// api/src/services/formsAssistantService.ts

import { sqlQuery } from "../db/index.js";
import {
  createAssistantAudioSql,
  createAssistantPatchSql,
  createAssistantSessionSql,
  createAssistantTurnSql,
  getAdminAssistantAuditSql,
  getAssistantAuditSql,
  getAssistantFormInstanceContextSql,
  getAssistantSessionSql,
  markAssistantPatchesAppliedSql,
  markAssistantPatchesRejectedSql,
} from "../db/queries/formsAssistant.sql.js";

import { buildAssistantCommandPatches } from "./formsAssistantCommandService.js";
import { transcribeAudioBuffer, normalizeTranscriptText } from "./formsAssistantSpeechService.js";
import { uploadAssistantAudioToBlob } from "./formsAssistantAudioStorageService.js";

function getUserDisplayName(user: any) {
  return user?.name || user?.upn || user?.email || user?.objectId || "unknown";
}

function parsePositiveInt(value: any): number | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseJsonMaybe(value: any, fallback: any = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;

  const txt = String(value || "").trim();
  if (!txt) return fallback;

  try {
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function toJson(value: any) {
  if (value === undefined || value === null) return null;

  return JSON.stringify({
    value,
  });
}

function toJsonObject(value: any) {
  if (value === undefined || value === null) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return JSON.stringify({
    value,
  });
}


function collectSpeechPhrases(clientContext: any, body: any): string[] {
  const candidates = [
    clientContext?.speech_phrases,
    clientContext?.speechPhrases,
    body?.speech_phrases,
    body?.speechPhrases,
    parseJsonMaybe(body?.speech_phrases_json, null),
  ];

  const out: string[] = [];
  const seen = new Set<string>();
  const max = Number(process.env.AZURE_SPEECH_MAX_PHRASES || 500);

  function visit(value: any) {
    if (value == null) return;

    if (typeof value === "string") {
      const txt = value.trim();
      if (!txt) return;

      if ((txt.startsWith("[") && txt.endsWith("]")) || (txt.startsWith("{") && txt.endsWith("}"))) {
        const parsed = parseJsonMaybe(txt, null);
        if (parsed !== txt && parsed != null) {
          visit(parsed);
          return;
        }
      }

      for (const part of txt.split(/[\n,;]+/g)) {
        const phrase = part.trim().replace(/\s+/g, " ");
        if (!phrase || phrase.length > 90) continue;

        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        out.push(phrase);
        if (out.length >= max) return;
      }

      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
        if (out.length >= max) return;
      }
      return;
    }

    if (typeof value === "object") {
      if (value.value || value.text || value.label || value.title) {
        visit(value.value ?? value.text ?? value.label ?? value.title);
      }
    }
  }

  for (const candidate of candidates) {
    visit(candidate);
    if (out.length >= max) break;
  }

  return out;
}

async function getContextOrThrow(code: string, instanceId: number) {
  const rows = await sqlQuery(getAssistantFormInstanceContextSql, {
    code,
    instanceId,
  });

  const ctx: any = rows?.[0] ?? null;
  if (!ctx) throw new Error("form instance not found");

  return ctx;
}

async function getOrCreateSession(args: {
  code: string;
  instanceId: number;
  user: any;
  assistantSessionId?: any;
  clientContext?: any;
  entryPoint?: string | null;
  activePageName?: string | null;
  activeQuestionName?: string | null;
  activeSectionKey?: string | null;
}) {
  const ctx = await getContextOrThrow(args.code, args.instanceId);
  const requestedId = parsePositiveInt(args.assistantSessionId);

  if (requestedId != null) {
    const rows = await sqlQuery(getAssistantSessionSql, {
      assistantSessionId: requestedId,
      formInstanceId: ctx.form_instance_id,
      code: ctx.atrium_installation_code,
    });

    const session: any = rows?.[0] ?? null;
    if (session) return { ctx, session };
  }

  const rows = await sqlQuery(createAssistantSessionSql, {
    formInstanceId: ctx.form_instance_id,
    installationId: ctx.installation_id,
    code: ctx.atrium_installation_code,
    entryPoint: args.entryPoint || "runtime",
    activePageName: args.activePageName || null,
    activeQuestionName: args.activeQuestionName || null,
    activeSectionKey: args.activeSectionKey || null,
    clientContextJson: toJson(args.clientContext),
    startedBy: getUserDisplayName(args.user),
  });

  const session: any = rows?.[0] ?? null;
  if (!session) throw new Error("assistant session could not be created");

  return { ctx, session };
}

async function insertPatches(args: {
  ctx: any;
  session: any;
  turn: any;
  patches: any[];
  user: any;
}) {
  const out: any[] = [];
  const proposedBy = getUserDisplayName(args.user);

  for (const raw of args.patches || []) {
    const rows = await sqlQuery(createAssistantPatchSql, {
      assistantSessionId: args.session.assistant_session_id,
      assistantTurnId: args.turn.assistant_turn_id,
      formInstanceId: args.ctx.form_instance_id,
      installationId: args.ctx.installation_id,
      code: args.ctx.atrium_installation_code,

      patchOp: raw.patch_op || "SET",
      patchSequence: Number(raw.patch_sequence ?? out.length),
      targetKind: raw.target_kind || "QUESTION",
      targetPath: String(raw.target_path || ""),
      targetLabel: raw.target_label || null,

      questionName: raw.question_name || null,
      matrixName: raw.matrix_name || null,
      matrixRowIndex: raw.matrix_row_index == null ? null : Number(raw.matrix_row_index),
      matrixRowKey: raw.matrix_row_key || null,
      matrixColumnName: raw.matrix_column_name || null,
      groupKey: raw.group_key || null,
      itemCode: raw.item_code || null,

      oldValueJson: toJson(raw.old_value),
      newValueJson: toJson(raw.new_value),
      patchJson: toJsonObject(raw),

      confidence: raw.confidence == null ? null : Number(raw.confidence),
      sourceText: raw.source_text || null,
      reason: raw.reason || null,
      proposedBy,
    });

    if (rows?.[0]) out.push(rows[0]);
  }

  return out;
}

export async function transcribeAssistantAudio(
  code: string,
  instanceIdValue: any,
  file: any,
  body: any,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const instanceId = parsePositiveInt(instanceIdValue);
  if (instanceId == null) return { ok: false, error: "ongeldige form_instance_id" };

  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    return { ok: false, error: "missing file" };
  }

  const maxBytes = Number(process.env.ASSISTANT_AUDIO_UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
  if (file.buffer.length > maxBytes) {
    return { ok: false, error: `audio is te groot; maximaal ${maxBytes} bytes` };
  }

  const clientContext = parseJsonMaybe(body?.client_context_json, body?.client_context ?? null);
  const speechPhrases = collectSpeechPhrases(clientContext, body);

  const { ctx, session } = await getOrCreateSession({
    code: cleanCode,
    instanceId,
    user,
    assistantSessionId: body?.assistant_session_id,
    clientContext,
    entryPoint: body?.entry_point || "runtime",
    activePageName: body?.active_page_name || null,
    activeQuestionName: body?.active_question_name || null,
    activeSectionKey: body?.active_section_key || null,
  });

  const speech = await transcribeAudioBuffer({
    buffer: file.buffer,
    mimeType: file.mimetype,
    fileName: file.originalname,
    speechPhrases,
  });

  const turnRows = await sqlQuery(createAssistantTurnSql, {
    assistantSessionId: session.assistant_session_id,
    formInstanceId: ctx.form_instance_id,
    installationId: ctx.installation_id,
    code: ctx.atrium_installation_code,

    turnKind: "TRANSCRIBE",
    inputMode: "AUDIO",
    languageCode: speech.language_code,
    provider: speech.provider,
    providerModel: speech.provider_model,

    rawInputText: null,
    transcriptText: speech.transcript_text,
    normalizedText: speech.normalized_text,
    assistantMessage: null,
    localCommandName: null,
    localCommandConfidence: null,

    requestContextJson: toJson({
      ...(clientContext && typeof clientContext === "object" ? clientContext : {}),
      speech_phrase_count: speechPhrases.length,
    }),
    aiRequestJson: null,
    aiResponseJson: toJson(speech.raw_response),
    aiUsageJson: null,

    latencyMs: speech.latency_ms,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    errorMessage: null,
    createdBy: getUserDisplayName(user),
  });

  const turn: any = turnRows?.[0];
  if (!turn) throw new Error("assistant turn could not be created");

  const blob = await uploadAssistantAudioToBlob({
    buffer: file.buffer,
    fileName: file.originalname,
    mimeType: file.mimetype,
    code: cleanCode,
    formInstanceId: ctx.form_instance_id,
    assistantSessionId: session.assistant_session_id,
    assistantTurnId: turn.assistant_turn_id,
  });

  const audioRows = await sqlQuery(createAssistantAudioSql, {
    assistantSessionId: session.assistant_session_id,
    assistantTurnId: turn.assistant_turn_id,
    formInstanceId: ctx.form_instance_id,
    installationId: ctx.installation_id,
    code: ctx.atrium_installation_code,

    fileName: file.originalname || null,
    mimeType: file.mimetype || null,
    fileSizeBytes: file.size ?? file.buffer.length,
    durationMs: body?.duration_ms == null ? null : Number(body.duration_ms),

    storageProvider: blob.storage_provider,
    storageKey: blob.storage_key,
    storageUrl: blob.storage_url,
    checksumSha256: blob.checksum_sha256,
    capturedBy: getUserDisplayName(user),
  });

  return {
    ok: true,
    assistant_session_id: session.assistant_session_id,
    assistant_turn_id: turn.assistant_turn_id,
    assistant_audio_id: audioRows?.[0]?.assistant_audio_id ?? null,

    transcript_text: speech.transcript_text,
    normalized_text: speech.normalized_text,
    language_code: speech.language_code,
    provider: speech.provider,
    provider_model: speech.provider_model,
    latency_ms: speech.latency_ms,

    audio: audioRows?.[0] ?? null,
  };
}

export async function interpretAssistantText(
  code: string,
  instanceIdValue: any,
  payload: any,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const instanceId = parsePositiveInt(instanceIdValue);
  if (instanceId == null) return { ok: false, error: "ongeldige form_instance_id" };

  const transcript = normalizeTranscriptText(
    payload?.transcript_text ?? payload?.text ?? payload?.normalized_text ?? ""
  );

  if (!transcript) return { ok: false, error: "tekst ontbreekt" };

  const clientContext = payload?.client_context ?? null;
  const fieldMap = Array.isArray(payload?.field_map) ? payload.field_map : [];

  const { ctx, session } = await getOrCreateSession({
    code: cleanCode,
    instanceId,
    user,
    assistantSessionId: payload?.assistant_session_id,
    clientContext,
    entryPoint: payload?.entry_point || "runtime",
    activePageName: payload?.active_page_name || null,
    activeQuestionName: payload?.active_question_name || null,
    activeSectionKey: payload?.active_section_key || null,
  });

  const local = buildAssistantCommandPatches({
    transcript,
    fieldMap,
    activePageName: payload?.active_page_name || payload?.client_context?.active_page_name || null,
    clientContext,
  });

  const turnRows = await sqlQuery(createAssistantTurnSql, {
    assistantSessionId: session.assistant_session_id,
    formInstanceId: ctx.form_instance_id,
    installationId: ctx.installation_id,
    code: ctx.atrium_installation_code,

    turnKind: local.handled ? "LOCAL_COMMAND" : "AI_INTERPRET",
    inputMode: "TEXT",
    languageCode: process.env.AZURE_SPEECH_LANGUAGE || "nl-NL",
    provider: local.handled ? "ember-local" : null,
    providerModel: local.handled ? "assistant-command-v1" : null,

    rawInputText: payload?.text ?? payload?.transcript_text ?? transcript,
    transcriptText: payload?.transcript_text ?? transcript,
    normalizedText: transcript,
    assistantMessage: local.assistantMessage,
    localCommandName: local.commandName,
    localCommandConfidence: local.confidence,

    requestContextJson: toJson({
      client_context: clientContext,
      field_map_count: fieldMap.length,
    }),
    aiRequestJson: local.handled
      ? null
      : toJson({
          note: "AI provider nog niet gekoppeld; deze turn is alvast gelogd voor toekomstige AI request audit.",
          transcript,
          field_map_count: fieldMap.length,
        }),
    aiResponseJson: local.handled ? null : toJson({ ok: false, reason: "ai_provider_not_configured" }),
    aiUsageJson: null,

    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    errorMessage: local.handled ? null : "AI provider nog niet geconfigureerd.",
    createdBy: getUserDisplayName(user),
  });

  const turn: any = turnRows?.[0];
  if (!turn) throw new Error("assistant turn could not be created");

  const patches = await insertPatches({
    ctx,
    session,
    turn,
    patches: local.patches,
    user,
  });

  return {
    ok: true,
    assistant_session_id: session.assistant_session_id,
    assistant_turn_id: turn.assistant_turn_id,

    handled_locally: local.handled,
    assistant_message: local.assistantMessage,
    local_command_name: local.commandName,
    local_command_confidence: local.confidence,

    patches,
  };
}

export async function markAssistantPatchesApplied(
  code: string,
  instanceIdValue: any,
  payload: any,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const instanceId = parsePositiveInt(instanceIdValue);
  if (instanceId == null) return { ok: false, error: "ongeldige form_instance_id" };

  const patchIds = Array.isArray(payload?.patch_ids) ? payload.patch_ids : [];
  const appliedDraftRev =
    payload?.applied_draft_rev == null ? null : Number(payload.applied_draft_rev);

  const rows = await sqlQuery(markAssistantPatchesAppliedSql, {
    code: cleanCode,
    formInstanceId: instanceId,
    patchIdsJson: JSON.stringify(patchIds),
    appliedDraftRev: Number.isFinite(appliedDraftRev) ? Math.trunc(appliedDraftRev) : null,
    appliedBy: getUserDisplayName(user),
  });

  return { ok: true, items: rows || [] };
}

export async function markAssistantPatchesRejected(
  code: string,
  instanceIdValue: any,
  payload: any,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const instanceId = parsePositiveInt(instanceIdValue);
  if (instanceId == null) return { ok: false, error: "ongeldige form_instance_id" };

  const patchIds = Array.isArray(payload?.patch_ids) ? payload.patch_ids : [];
  const rejectedReason = String(payload?.reason || "").trim() || null;

  const rows = await sqlQuery(markAssistantPatchesRejectedSql, {
    code: cleanCode,
    formInstanceId: instanceId,
    patchIdsJson: JSON.stringify(patchIds),
    rejectedReason,
    rejectedBy: getUserDisplayName(user),
  });

  return { ok: true, items: rows || [] };
}

export async function getAssistantAudit(code: string, instanceIdValue: any, takeValue: any) {
  const cleanCode = String(code || "").trim();
  const instanceId = parsePositiveInt(instanceIdValue);
  if (instanceId == null) return { ok: false, error: "ongeldige form_instance_id" };

  const takeRaw = Number(takeValue || 100);
  const take = Math.min(Math.max(Number.isFinite(takeRaw) ? Math.trunc(takeRaw) : 100, 1), 500);

  const rows = await sqlQuery(getAssistantAuditSql, {
    code: cleanCode,
    formInstanceId: instanceId,
    take,
  });

  return { ok: true, items: rows || [] };
}

export async function getAdminAssistantAudit(params: any = {}) {
  const takeRaw = Number(params?.take || 100);
  const take = Math.min(Math.max(Number.isFinite(takeRaw) ? Math.trunc(takeRaw) : 100, 1), 500);
  const q = String(params?.q || "").trim() || null;

  const rows = await sqlQuery(getAdminAssistantAuditSql, {
    q,
    take,
  });

  return {
    ok: true,
    items: rows || [],
  };
}