import { randomUUID } from "node:crypto";
import { buildFormReportPdf } from "./formReportPdfService.js";

type PdfJobStatus =
  | "queued"
  | "building_model"
  | "warming_renderer"
  | "renderer_ready"
  | "creating_pages"
  | "rendering_html"
  | "rendering_cover"
  | "rendering_body"
  | "merging_pdf"
  | "ready"
  | "failed";

type PdfJobRecord = {
  job_id: string;
  form_instance_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  status: PdfJobStatus;
  message: string;
  progress: number;
  error: string | null;
  file_name: string | null;
  content_type: string | null;
  content_disposition: string | null;
  content_length: number | null;
  buffer: Buffer | null;
};

const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOB_COUNT = 50;
const jobs = new Map<string, PdfJobRecord>();

function nowIso() {
  return new Date().toISOString();
}

function expiresIso() {
  return new Date(Date.now() + JOB_TTL_MS).toISOString();
}

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (new Date(job.expires_at).getTime() <= now) {
      jobs.delete(jobId);
    }
  }

  if (jobs.size <= MAX_JOB_COUNT) return;

  const ordered = [...jobs.values()].sort((a, b) => {
    return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
  });

  for (const job of ordered) {
    if (jobs.size <= MAX_JOB_COUNT) break;
    jobs.delete(job.job_id);
  }
}

function sanitizeJob(job: PdfJobRecord) {
  return {
    job_id: job.job_id,
    form_instance_id: job.form_instance_id,
    created_at: job.created_at,
    updated_at: job.updated_at,
    expires_at: job.expires_at,
    status: job.status,
    message: job.message,
    progress: job.progress,
    error: job.error,
    file_name: job.file_name,
    ready: job.status === "ready" && !!job.buffer,
  };
}

function updateJob(jobId: string, patch: Partial<PdfJobRecord>) {
  const current = jobs.get(jobId);
  if (!current) return;
  jobs.set(jobId, {
    ...current,
    ...patch,
    updated_at: nowIso(),
    expires_at: expiresIso(),
  });
}

async function runPdfJob(jobId: string, formInstanceId: string, user: any) {
  try {
    const result: any = await buildFormReportPdf(formInstanceId, user, (phase, message, progress) => {
      const normalizedPhase = String(phase || "").trim().toLowerCase();
      updateJob(jobId, {
        status: normalizedPhase === "ready" ? "merging_pdf" : (phase as PdfJobStatus),
        message,
        progress: Number.isFinite(Number(progress)) ? Number(progress) : 0,
      });
    });

    if (result?.error === "not found") {
      updateJob(jobId, {
        status: "failed",
        message: "Formulier niet gevonden",
        progress: 100,
        error: "not found",
      });
      return;
    }

    updateJob(jobId, {
      status: "ready",
      message: "Download staat klaar",
      progress: 100,
      error: null,
      file_name: result?.fileName || null,
      content_type: result?.contentType || "application/pdf",
      content_disposition: result?.contentDisposition || null,
      content_length: Number(result?.contentLength || 0) || null,
      buffer: Buffer.isBuffer(result?.buffer) ? result.buffer : Buffer.from(result?.buffer || []),
    });
  } catch (err) {
    const message = String((err as any)?.message || err || "downloadFormsMonitorPdf failed");
    console.error("[form report pdf] job failed", { jobId, formInstanceId, error: err });
    updateJob(jobId, {
      status: "failed",
      message,
      progress: 100,
      error: message,
    });
  }
}

export function createFormReportPdfJob(formInstanceId: string, user: any) {
  cleanupExpiredJobs();

  const jobId = randomUUID();
  const record: PdfJobRecord = {
    job_id: jobId,
    form_instance_id: String(formInstanceId || ""),
    created_at: nowIso(),
    updated_at: nowIso(),
    expires_at: expiresIso(),
    status: "queued",
    message: "Export staat in de wachtrij",
    progress: 2,
    error: null,
    file_name: null,
    content_type: null,
    content_disposition: null,
    content_length: null,
    buffer: null,
  };

  jobs.set(jobId, record);
  void runPdfJob(jobId, record.form_instance_id, user);
  return sanitizeJob(record);
}

export function getFormReportPdfJob(jobId: string) {
  cleanupExpiredJobs();
  const job = jobs.get(String(jobId || ""));
  if (!job) return null;
  return sanitizeJob(job);
}

export function getFormReportPdfJobDownload(jobId: string) {
  cleanupExpiredJobs();
  const job = jobs.get(String(jobId || ""));
  if (!job) return { error: "not found" as const };
  if (job.status !== "ready" || !job.buffer) return { error: "not ready" as const, job: sanitizeJob(job) };

  return {
    ok: true as const,
    buffer: job.buffer,
    contentType: job.content_type || "application/pdf",
    contentLength: job.content_length || job.buffer.length,
    contentDisposition:
      job.content_disposition || `attachment; filename="${String(job.file_name || `formulier_${job.form_instance_id}.pdf`).replace(/"/g, "")}"`,
  };
}
