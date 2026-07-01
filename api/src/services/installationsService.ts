// api/src/services/installationsService.ts
import { sqlQuery, sqlQueryRaw } from "../db/index.js";
import { randomUUID } from "node:crypto";

import {
  getInstallationSql,
  getCustomValuesSql,
  getCatalogSectionsSql,
  getCatalogExternalFieldsSql,
  getCatalogCustomFieldsSql,
  getCatalogDocumentTypesSql,
  getCatalogDocumentTypeAttachmentParentsSql,
  getCatalogCustomFieldOptionsSql,
  upsertCustomValuesSql,
  searchInstallationsSql,
  getInstallationArchiveStateSql,
} from "../db/queries/installations.sql.js";

import {
  getInstallationDocumentsReadSql,
  upsertInstallationDocumentsMetadataSql,
} from "../db/queries/installationDocuments.sql.js";

import {
  ensureInstallationSql,
  getInstallationTypesSql,
  setInstallationTypeSql,
} from "../db/queries/installationTypes.sql.js";

import {
  getEnergySupplyBrandTypesSql,
  upsertEnergySupplyBrandTypesSql,
} from "../db/queries/energySupplyBrandTypes.sql.js";

import {
  getInstallationEnergySuppliesSql,
  upsertInstallationEnergySuppliesSql,
  deleteInstallationEnergySupplySql,
} from "../db/queries/energySupplies.sql.js";

import {
  getNen2535CatalogSql,
  getInstallationPerformanceRequirementSql,
  upsertInstallationPerformanceRequirementSql,
  getNen2535MatrixForNormSql,
} from "../db/queries/nen2535.sql.js";

import { 
  getInstallationComponentsSql
 } from "../db/queries/installationComponents.sql.js";
import {
  archiveInstallationNoteSql,
  deleteInstallationNoteSql,
  getInstallationNoteByIdSql,
  getInstallationNotesSql,
  getInstallationWorkflowItemsSql,
  insertInstallationNoteSql,
  insertUserNotificationEventSql,
  markInstallationNoteNotificationsReadSql,
  replaceInstallationNoteMentionsSql,
  toggleInstallationNoteReactionSql,
  updateInstallationNoteSql,
} from "../db/queries/installationNotes.sql.js";
import {
  getUserAuditActor,
  getUserDisplayNameSnapshot,
  getUserEmail,
  getUserObjectId,
} from "../utils/userIdentity.js";

const INSTALLATION_NOTE_KINDS = new Set(["NOTE", "HANDOVER", "WARNING"]);
const WORKFLOW_ACTIVE_STATUSES = new Set(["OPEN", "PLANNING_NODIG", "WACHTENOPDERDEN", "GEPLAND"]);
const WORKFLOW_OPEN_STATUSES = new Set(["OPEN", "PLANNING_NODIG", "WACHTENOPDERDEN"]);
const WORKFLOW_HISTORY_STATUSES = new Set(["AFGEHANDELD", "VERVALLEN", "AFGEWEZEN", "INFORMATIEF"]);

function normalizeOptionalString(value: any) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function normalizeInstallationNoteKind(value: any) {
  const normalized = String(value || "NOTE").trim().toUpperCase();
  if (!INSTALLATION_NOTE_KINDS.has(normalized)) {
    throw new Error("installation note kind invalid");
  }
  return normalized;
}

function normalizeInstallationNoteBody(value: any) {
  const body = String(value ?? "").trim();
  if (!body) {
    throw new Error("installation note body required");
  }
  return body;
}

function normalizeInstallationNoteMentions(value: any[]) {
  const seen = new Set<string>();
  const items = Array.isArray(value) ? value : [];
  const result: Array<{
    mentioned_user_object_id: string;
    mentioned_display_name_snapshot: string | null;
    mentioned_email_snapshot: string | null;
  }> = [];

  for (const item of items) {
    const userObjectId = normalizeOptionalString(item?.mentioned_user_object_id ?? item?.user_object_id ?? item?.id);
    if (!userObjectId || seen.has(userObjectId)) continue;
    seen.add(userObjectId);
    result.push({
      mentioned_user_object_id: userObjectId,
      mentioned_display_name_snapshot: normalizeOptionalString(
        item?.mentioned_display_name_snapshot ?? item?.display_name_snapshot ?? item?.display_name ?? item?.label ?? item?.name
      ),
      mentioned_email_snapshot: normalizeOptionalString(
        item?.mentioned_email_snapshot ?? item?.email_snapshot ?? item?.email
      ),
    });
  }

  return result;
}

function mapInstallationNoteRecord(row: any) {
  return {
    installation_note_id: row.installation_note_id,
    installation_id: row.installation_id,
    atrium_installation_code: row.atrium_installation_code,
    note_kind: row.note_kind ?? "NOTE",
    body_markdown: row.body_markdown ?? "",
    author_user_object_id: row.author_user_object_id ?? null,
    author_display_name_snapshot: row.author_display_name_snapshot ?? null,
    author_email_snapshot: row.author_email_snapshot ?? null,
    is_archived: row.is_archived === true || row.is_archived === 1,
    archived_at: row.archived_at ?? null,
    archived_by: row.archived_by ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
  };
}

function mapInstallationNoteMention(row: any) {
  return {
    installation_note_mention_id: row.installation_note_mention_id,
    installation_note_id: row.installation_note_id,
    mentioned_user_object_id: row.mentioned_user_object_id ?? null,
    mentioned_display_name_snapshot: row.mentioned_display_name_snapshot ?? null,
    mentioned_email_snapshot: row.mentioned_email_snapshot ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
  };
}

function mapInstallationNoteReaction(row: any) {
  return {
    installation_note_reaction_id: row.installation_note_reaction_id,
    installation_note_id: row.installation_note_id,
    reaction_key: row.reaction_key ?? null,
    reactor_user_object_id: row.reactor_user_object_id ?? null,
    reactor_display_name_snapshot: row.reactor_display_name_snapshot ?? null,
    reactor_email_snapshot: row.reactor_email_snapshot ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
  };
}

function mapInstallationNotesRecordsets(recordsets: any[]) {
  const noteRows = Array.isArray(recordsets?.[0]) ? recordsets[0] : [];
  const mentionRows = Array.isArray(recordsets?.[1]) ? recordsets[1] : [];
  const reactionRows = Array.isArray(recordsets?.[2]) ? recordsets[2] : [];

  const byId = new Map<string, any>();
  for (const row of noteRows) {
    const note = mapInstallationNoteRecord(row);
    byId.set(String(note.installation_note_id), {
      ...note,
      mentions: [],
      reactions: [],
    });
  }

  for (const row of mentionRows) {
    const noteId = String(row.installation_note_id || "");
    const target = byId.get(noteId);
    if (!target) continue;
    target.mentions.push(mapInstallationNoteMention(row));
  }

  for (const row of reactionRows) {
    const noteId = String(row.installation_note_id || "");
    const target = byId.get(noteId);
    if (!target) continue;
    target.reactions.push(mapInstallationNoteReaction(row));
  }

  const notes = [...byId.values()];
  return {
    notes,
    activeNotes: notes.filter((note) => !note.is_archived),
    archivedNotes: notes.filter((note) => note.is_archived),
  };
}

function normalizeUserRoles(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean);
}

function canModerateInstallationNotes(user: any) {
  const roles = normalizeUserRoles(user);
  return roles.includes("admin") || roles.includes("documentbeheerder");
}

function canDeleteInstallationNotes(user: any) {
  const roles = normalizeUserRoles(user);
  return roles.includes("admin");
}

function canEditOwnOrModerateInstallationNote(note: any, user: any) {
  const userObjectId = normalizeOptionalString(getUserObjectId(user));
  if (userObjectId && userObjectId === normalizeOptionalString(note?.author_user_object_id)) {
    return true;
  }
  return canModerateInstallationNotes(user);
}

async function ensureInstallationOverlay(code: string, user: any) {
  const actor = getUserAuditActor(user);
  await sqlQuery(ensureInstallationSql, {
    code,
    createdBy: actor,
  });

  const rows = await sqlQuery(
    `select top 1 installation_id, atrium_installation_code from dbo.Installation where atrium_installation_code = @code`,
    { code }
  );
  const row: any = rows?.[0] ?? null;
  if (!row?.installation_id) {
    throw new Error("installation not found");
  }
  return row;
}

async function getInstallationNoteOrThrow(code: string, installationNoteId: string) {
  const rows = await sqlQuery(getInstallationNoteByIdSql, {
    code,
    installationNoteId,
  });
  const row: any = rows?.[0] ?? null;
  if (!row) {
    throw new Error("installation note not found");
  }
  return mapInstallationNoteRecord(row);
}

async function insertNotificationEvent(params: {
  eventType: string;
  recipientUserObjectId: string;
  recipientDisplayNameSnapshot?: string | null;
  recipientEmailSnapshot?: string | null;
  actorUserObjectId?: string | null;
  actorDisplayNameSnapshot?: string | null;
  actorEmailSnapshot?: string | null;
  installationId?: string | null;
  code: string;
  formInstanceId?: number | null;
  followUpActionId?: string | null;
  installationNoteId?: string | null;
  reactionKey?: string | null;
  summaryText: string;
  targetPath?: string | null;
}) {
  await sqlQuery(insertUserNotificationEventSql, {
    notificationEventId: randomUUID(),
    eventType: params.eventType,
    recipientUserObjectId: params.recipientUserObjectId,
    recipientDisplayNameSnapshot: params.recipientDisplayNameSnapshot ?? null,
    recipientEmailSnapshot: params.recipientEmailSnapshot ?? null,
    actorUserObjectId: params.actorUserObjectId ?? null,
    actorDisplayNameSnapshot: params.actorDisplayNameSnapshot ?? null,
    actorEmailSnapshot: params.actorEmailSnapshot ?? null,
    installationId: params.installationId ?? null,
    code: params.code,
    formInstanceId: params.formInstanceId ?? null,
    followUpActionId: params.followUpActionId ?? null,
    installationNoteId: params.installationNoteId ?? null,
    reactionKey: params.reactionKey ?? null,
    summaryText: params.summaryText,
    targetPath: params.targetPath ?? null,
  });
}




function roundNen(value: number) {
  if (value <= 1) return Math.ceil(value);
  return Math.round(value);
}

function calcMaxAllowed(normering_key: string, countsByRisk: Record<string, number>, mode: "internal" | "external") {
  const A = countsByRisk["A"] ?? 0;
  const B = countsByRisk["B"] ?? 0;
  const C = countsByRisk["C"] ?? 0;
  const D = countsByRisk["D"] ?? 0;
  const E = countsByRisk["E"] ?? 0;

  let between = 0;

  if (mode === "external") {
    between = ((A / 100) * 0.5) + ((B / 100) * 1) + ((C / 100) * 1.5);
    return roundNen(between);
  }

  if (normering_key === "NEN2535_2009_PLUS") {
    between =
      ((A / 100) * 0.5) +
      ((B / 100) * 1) +
      ((C / 100) * 1.5) +
      ((D / 100) * 2) +
      ((E / 100) * 3);
    return roundNen(between);
  }

  if (normering_key === "NEN2535_1996_2008") {
    between = ((A / 100) * 1) + ((B / 100) * 2) + ((C / 100) * 3);
    return roundNen(between);
  }

  return null;
}

function weightedDetectorCount(row: any) {
  const a = Number(row.automatic_detectors ?? 0);
  const h = Number(row.manual_call_points ?? 0);
  const v = Number(row.flame_detectors ?? 0);
  const l = Number(row.linear_smoke_detectors ?? 0);
  const asp = Number(row.aspirating_openings ?? 0);
  return a + h + (v * 5) + (l * 10) + asp;
}

export function isHistoricalInstallationStatus(status: any) {
  return String(status || "").trim().toUpperCase() === "J";
}

export async function getInstallationArchiveState(code: string) {
  const cleanCode = String(code || "").trim();
  const rows = await sqlQuery(getInstallationArchiveStateSql, { code: cleanCode });
  const row: any = rows?.[0] ?? null;

  if (!row) {
    throw new Error("atrium installation not found");
  }

  const status = row.installation_status ?? null;

  return {
    atrium_installation_code: row.atrium_installation_code ?? cleanCode,
    installation_status: status,
    bedrijf_unit: row.BedrijfUnit ?? row.bedrijfUnit ?? null,
    isHistorical: isHistoricalInstallationStatus(status),
  };
}

export async function assertInstallationWritable(code: string) {
  const state = await getInstallationArchiveState(code);

  if (state.isHistorical) {
    throw new Error("historical installation read-only");
  }

  return state;
}

export async function getInstallationByCode(code: string) {
  const rows = await sqlQuery(getInstallationSql, { code });
  if (!rows.length) return { error: "not found" };
  return { installation: rows[0] };
}

export async function getCatalog(code: string) {
  // haal type op (kan null zijn)
  const instRows = await sqlQuery(
    `select top 1 installation_type_key
     from dbo.Installation
     where atrium_installation_code = @code`,
    { code }
  );

  const installationTypeKey = instRows?.[0]?.installation_type_key ?? null;

  const [sections, externalFields, customFields, documentTypes, documentTypeAttachmentParents, optionRows] =
    await Promise.all([
      sqlQuery(getCatalogSectionsSql),

      // belangrijk: param altijd meegeven (ook null)
      sqlQuery(getCatalogExternalFieldsSql, { installationTypeKey }),

      sqlQuery(getCatalogCustomFieldsSql, { installationTypeKey }),

      sqlQuery(getCatalogDocumentTypesSql, { installationTypeKey }),

      sqlQuery(getCatalogDocumentTypeAttachmentParentsSql),

      sqlQuery(getCatalogCustomFieldOptionsSql),
    ]);
    
  const fields = [...externalFields, ...customFields];

  // group options by field_key -> [{value,label}]
  const fieldOptions: Record<string, Array<{ value: string; label: string }>> =
    {};

  for (const r of optionRows || []) {
    const fieldKey = r?.field_key;
    if (!fieldKey) continue;

    if (!fieldOptions[fieldKey]) fieldOptions[fieldKey] = [];
    fieldOptions[fieldKey].push({
      value: String(r.option_value ?? ""),
      label: String(r.option_label ?? r.option_value ?? ""),
    });
  }

  const attachmentParentsByType: Record<string, string[]> = {};
  for (const row of documentTypeAttachmentParents || []) {
    const typeKey = String(row?.document_type_key || "").trim();
    const parentTypeKey = String(row?.parent_document_type_key || "").trim();
    if (!typeKey || !parentTypeKey) continue;
    if (!attachmentParentsByType[typeKey]) attachmentParentsByType[typeKey] = [];
    attachmentParentsByType[typeKey].push(parentTypeKey);
  }

  return {
    sections,
    fields,
    documentTypes: (documentTypes || []).map((row: any) => ({
      document_type_key: row.document_type_key,
      document_type_name: row.document_type_name,
      section_key: row.section_key ?? null,
      sort_order: row.sort_order == null ? null : Number(row.sort_order),
      is_attachment_only: row.is_attachment_only === true,
      attachment_parent_type_keys: attachmentParentsByType[String(row.document_type_key || "").trim()] || [],
      is_active: row.is_active === false ? false : true,
      is_required: row.is_required === true,
    })),
    fieldOptions,
  };
}

export async function getCustomValues(code: string) {
  const values = await sqlQuery(getCustomValuesSql, { code });
  return { values };
}

export async function upsertCustomValues(code: string, values: any[], user: any) {
  if (!Array.isArray(values)) {
    return { ok: false, error: "values must be an array" };
  }

  await assertInstallationWritable(code);

  const cleaned = values
    .filter((v) => v && typeof v.field_key === "string" && v.field_key.trim().length)
    .map((v) => ({
      field_key: v.field_key,
      value_string: v.value_string ?? null,
      value_number: v.value_number ?? null,
      value_bool: v.value_bool ?? null,
      value_date: v.value_date ?? null,
      value_json: v.value_json ?? null,
    }));

  const valuesJson = JSON.stringify(cleaned);

  const updatedBy = getUserAuditActor(user);
  

  const result = await sqlQuery(upsertCustomValuesSql, {
    code,
    valuesJson,
    updatedBy,
  });

  return { ok: true, result };
}

export async function getInstallationDocuments(code: string) {
  const rows = await sqlQuery(getInstallationDocumentsReadSql, { code });

  const byType = new Map<
    string,
    {
      document_type_key: string;
      document_type_name: string;
      section_key: string | null;
      sort_order: number | null;
      documents: any[];
    }
  >();

  for (const r of rows as any[]) {
    const bucketTypeKey = String(r.bucket_document_type_key || r.document_type_key || "").trim();
    if (!bucketTypeKey) continue;

    if (!byType.has(bucketTypeKey)) {
      byType.set(bucketTypeKey, {
        document_type_key: bucketTypeKey,
        document_type_name: r.bucket_document_type_name ?? r.document_type_name,
        section_key: r.bucket_section_key ?? r.section_key ?? null,
        sort_order: r.bucket_sort_order ?? r.sort_order ?? null,
        documents: [],
      });
    }
  }

  const rowsByType = new Map<string, any[]>();
  for (const r of rows as any[]) {
    if (!r.document_id) continue;
    const bucketTypeKey = String(r.bucket_document_type_key || r.document_type_key || "").trim();
    if (!bucketTypeKey) continue;

    const arr = rowsByType.get(bucketTypeKey) || [];
    arr.push({
      document_id: r.document_id,
      document_type_key: r.document_type_key,
      document_type_name: r.document_type_name ?? null,
      parent_document_id: r.parent_document_id ?? null,
      relation_type: r.relation_type ?? null,

      title: r.title ?? "",
      note: r.note ?? "",
      document_number: r.document_number ?? "",
      document_date: r.document_date ?? null,
      revision: r.revision ?? "",

      has_file: Boolean(r.storage_key),
      file_name: r.file_name ?? null,
      mime_type: r.mime_type ?? null,
      file_size_bytes: r.file_size_bytes ?? null,
      uploaded_at: r.uploaded_at ?? null,
      uploaded_by: r.uploaded_by ?? null,
      file_last_modified_at: r.file_last_modified_at ?? null,
      file_last_modified_by: r.file_last_modified_by ?? null,

      storage_provider: r.storage_provider ?? null,
      storage_key: r.storage_key ?? null,

      document_is_active: r.document_is_active ?? true,
      created_at: r.created_at ?? null,
      created_by: r.created_by ?? null,
      updated_at: r.updated_at ?? null,
      updated_by: r.updated_by ?? null,

      attachments: [],
      history: [],
    });
    rowsByType.set(bucketTypeKey, arr);
  }

  for (const [typeKey, arr] of rowsByType.entries()) {
    const docsById = new Map(arr.map((d) => [String(d.document_id), d]));
    const replacedParentIds = new Set<string>();

    for (const d of arr) {
      if (String(d.relation_type || "").toUpperCase() === "VERVANGING" && d.parent_document_id) {
        replacedParentIds.add(String(d.parent_document_id));
      }
    }

    const mainDocs = arr.filter((d) => {
      if (String(d.relation_type || "").toUpperCase() === "BIJLAGE") return false;
      return !replacedParentIds.has(String(d.document_id));
    });

    const resolveHistory = (head: any) => {
      const history: any[] = [];
      let current = head;

      while (current?.parent_document_id) {
        const parent = docsById.get(String(current.parent_document_id));
        if (!parent) break;

        history.push({
          ...parent,
          attachments: [],
          history: [],
        });

        current = parent;
      }

      return history;
    };

    const attachmentParentIds = new Set<string>();
    for (const d of arr) {
      if (String(d.relation_type || "").toUpperCase() === "BIJLAGE" && d.parent_document_id) {
        attachmentParentIds.add(String(d.parent_document_id));
      }
    }

    for (const main of mainDocs) {
      main.history = resolveHistory(main);

      const validParentIds = new Set<string>([
        String(main.document_id),
        ...main.history.map((x: any) => String(x.document_id)),
      ]);

      main.attachments = arr.filter((d) => {
        return (
          String(d.relation_type || "").toUpperCase() === "BIJLAGE" &&
          d.parent_document_id &&
          validParentIds.has(String(d.parent_document_id))
        );
      });
    }

    byType.get(typeKey)!.documents = mainDocs;
  }

  return {
    code,
    documentTypes: Array.from(byType.values()),
  };
}

export async function getInstallationNotes(
  code: string,
  options: {
    includeArchived?: boolean;
    noteKind?: string | null;
    markReadUser?: any;
  } = {}
) {
  const cleanCode = String(code || "").trim();
  const includeArchived = options.includeArchived === true;
  const noteKind = normalizeOptionalString(options.noteKind)
    ? normalizeInstallationNoteKind(options.noteKind)
    : null;
  const markReadUserObjectId = normalizeOptionalString(getUserObjectId(options.markReadUser));

  if (markReadUserObjectId) {
    await sqlQuery(markInstallationNoteNotificationsReadSql, {
      code: cleanCode,
      recipientUserObjectId: markReadUserObjectId,
    });
  }

  const result: any = await sqlQueryRaw(getInstallationNotesSql, {
    code: cleanCode,
    includeArchived: includeArchived ? 1 : 0,
    noteKind,
  });

  const mapped = mapInstallationNotesRecordsets(result?.recordsets ?? []);
  return {
    code: cleanCode,
    note_kind: noteKind,
    include_archived: includeArchived,
    ...mapped,
    counts: {
      total: mapped.notes.length,
      active: mapped.activeNotes.length,
      archived: mapped.archivedNotes.length,
      warnings: mapped.notes.filter((item) => item.note_kind === "WARNING" && !item.is_archived).length,
      handovers: mapped.notes.filter((item) => item.note_kind === "HANDOVER" && !item.is_archived).length,
    },
  };
}

export async function createInstallationNote(code: string, payload: any, user: any) {
  const cleanCode = String(code || "").trim();
  await assertInstallationWritable(cleanCode);

  const actor = getUserAuditActor(user);
  const authorUserObjectId = normalizeOptionalString(getUserObjectId(user));
  if (!authorUserObjectId) {
    throw new Error("user object id missing");
  }

  const installation = await ensureInstallationOverlay(cleanCode, user);
  const installationNoteId = randomUUID();
  const noteKind = normalizeInstallationNoteKind(payload?.note_kind);
  const bodyMarkdown = normalizeInstallationNoteBody(payload?.body_markdown ?? payload?.body);
  const mentions = normalizeInstallationNoteMentions(payload?.mentions);

  const insertedRows = await sqlQuery(insertInstallationNoteSql, {
    installationNoteId,
    installationId: installation.installation_id,
    code: cleanCode,
    noteKind,
    bodyMarkdown,
    authorUserObjectId,
    authorDisplayNameSnapshot: normalizeOptionalString(getUserDisplayNameSnapshot(user)),
    authorEmailSnapshot: normalizeOptionalString(getUserEmail(user)),
    actor,
  });

  const mentionRows = await sqlQuery(replaceInstallationNoteMentionsSql, {
    installationNoteId,
    mentionsJson: JSON.stringify(mentions),
    actor,
  });

  for (const mention of mentions) {
    if (mention.mentioned_user_object_id === authorUserObjectId) continue;

    await insertNotificationEvent({
      eventType: "INSTALLATION_NOTE_MENTION",
      recipientUserObjectId: mention.mentioned_user_object_id,
      recipientDisplayNameSnapshot: mention.mentioned_display_name_snapshot,
      recipientEmailSnapshot: mention.mentioned_email_snapshot,
      actorUserObjectId: authorUserObjectId,
      actorDisplayNameSnapshot: normalizeOptionalString(getUserDisplayNameSnapshot(user)),
      actorEmailSnapshot: normalizeOptionalString(getUserEmail(user)),
      installationId: installation.installation_id,
      code: cleanCode,
      installationNoteId,
      summaryText:
        noteKind === "WARNING"
          ? "Je bent genoemd in een waarschuwing op de installatie."
          : "Je bent genoemd in een installatienotitie.",
      targetPath: `/installaties/${encodeURIComponent(cleanCode)}?tab=notes&subtab=notes&note=${encodeURIComponent(installationNoteId)}`,
    });
  }

  return {
    ok: true,
    note: {
      ...mapInstallationNoteRecord(insertedRows?.[0] ?? {}),
      mentions: (mentionRows || []).map(mapInstallationNoteMention),
      reactions: [],
    },
  };
}

export async function updateInstallationNote(
  code: string,
  installationNoteId: string,
  payload: any,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const cleanNoteId = String(installationNoteId || "").trim();
  const existing = await getInstallationNoteOrThrow(cleanCode, cleanNoteId);

  if (!canEditOwnOrModerateInstallationNote(existing, user)) {
    throw new Error("installation note forbidden");
  }

  const actor = getUserAuditActor(user);
  const actorUserObjectId = normalizeOptionalString(getUserObjectId(user));
  const noteKind = normalizeInstallationNoteKind(payload?.note_kind ?? existing.note_kind);
  const bodyMarkdown = normalizeInstallationNoteBody(payload?.body_markdown ?? payload?.body ?? existing.body_markdown);
  const mentions = normalizeInstallationNoteMentions(payload?.mentions);

  const updatedRows = await sqlQuery(updateInstallationNoteSql, {
    installationNoteId: cleanNoteId,
    code: cleanCode,
    noteKind,
    bodyMarkdown,
    actor,
  });

  await sqlQuery(
    `delete from dbo.UserNotificationEvent
     where installation_note_id = @installationNoteId
       and event_type = N'INSTALLATION_NOTE_MENTION'`,
    { installationNoteId: cleanNoteId }
  );

  const mentionRows = await sqlQuery(replaceInstallationNoteMentionsSql, {
    installationNoteId: cleanNoteId,
    mentionsJson: JSON.stringify(mentions),
    actor,
  });

  for (const mention of mentions) {
    if (mention.mentioned_user_object_id === actorUserObjectId) continue;

    await insertNotificationEvent({
      eventType: "INSTALLATION_NOTE_MENTION",
      recipientUserObjectId: mention.mentioned_user_object_id,
      recipientDisplayNameSnapshot: mention.mentioned_display_name_snapshot,
      recipientEmailSnapshot: mention.mentioned_email_snapshot,
      actorUserObjectId,
      actorDisplayNameSnapshot: normalizeOptionalString(getUserDisplayNameSnapshot(user)),
      actorEmailSnapshot: normalizeOptionalString(getUserEmail(user)),
      installationId: existing.installation_id,
      code: cleanCode,
      installationNoteId: cleanNoteId,
      summaryText:
        noteKind === "WARNING"
          ? "Je bent genoemd in een bijgewerkte waarschuwing op de installatie."
          : "Je bent genoemd in een bijgewerkte installatienotitie.",
      targetPath: `/installaties/${encodeURIComponent(cleanCode)}?tab=notes&subtab=notes&note=${encodeURIComponent(cleanNoteId)}`,
    });
  }

  const reactionData = await getInstallationNotes(cleanCode, {
    includeArchived: true,
    markReadUser: null,
  });
  const updatedNote = (reactionData.notes || []).find(
    (item: any) => String(item.installation_note_id) === cleanNoteId
  );

  return {
    ok: true,
    note:
      updatedNote || {
        ...mapInstallationNoteRecord(updatedRows?.[0] ?? {}),
        mentions: (mentionRows || []).map(mapInstallationNoteMention),
        reactions: [],
      },
  };
}

export async function archiveInstallationNote(
  code: string,
  installationNoteId: string,
  archiveState: boolean,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const cleanNoteId = String(installationNoteId || "").trim();
  const existing = await getInstallationNoteOrThrow(cleanCode, cleanNoteId);

  if (!canEditOwnOrModerateInstallationNote(existing, user)) {
    throw new Error("installation note forbidden");
  }

  const rows = await sqlQuery(archiveInstallationNoteSql, {
    installationNoteId: cleanNoteId,
    code: cleanCode,
    archiveState: archiveState ? 1 : 0,
    actor: getUserAuditActor(user),
  });

  return {
    ok: true,
    note: mapInstallationNoteRecord(rows?.[0] ?? {}),
  };
}

export async function deleteInstallationNote(code: string, installationNoteId: string, user: any) {
  const cleanCode = String(code || "").trim();
  const cleanNoteId = String(installationNoteId || "").trim();
  const existing = await getInstallationNoteOrThrow(cleanCode, cleanNoteId);

  const isOwner =
    normalizeOptionalString(existing.author_user_object_id) ===
    normalizeOptionalString(getUserObjectId(user));

  if (!isOwner && !canDeleteInstallationNotes(user)) {
    throw new Error("installation note forbidden");
  }

  await sqlQuery(deleteInstallationNoteSql, {
    installationNoteId: cleanNoteId,
    code: cleanCode,
  });

  return {
    ok: true,
    installation_note_id: cleanNoteId,
  };
}

export async function toggleInstallationNoteReaction(
  code: string,
  installationNoteId: string,
  reactionKey: string,
  user: any
) {
  const cleanCode = String(code || "").trim();
  const cleanNoteId = String(installationNoteId || "").trim();
  const cleanReactionKey = String(reactionKey || "").trim();
  if (!cleanReactionKey) {
    throw new Error("reaction key required");
  }

  const existing = await getInstallationNoteOrThrow(cleanCode, cleanNoteId);
  const reactorUserObjectId = normalizeOptionalString(getUserObjectId(user));
  if (!reactorUserObjectId) {
    throw new Error("user object id missing");
  }

  const result: any = await sqlQueryRaw(toggleInstallationNoteReactionSql, {
    installationNoteId: cleanNoteId,
    reactionKey: cleanReactionKey,
    reactorUserObjectId,
    reactorDisplayNameSnapshot: normalizeOptionalString(getUserDisplayNameSnapshot(user)),
    reactorEmailSnapshot: normalizeOptionalString(getUserEmail(user)),
    actor: getUserAuditActor(user),
  });

  const stateRow = result?.recordsets?.[0]?.[0] ?? result?.recordset?.[0] ?? null;
  const reactions = (result?.recordsets?.[1] || []).map(mapInstallationNoteReaction);
  const isActive = Boolean(stateRow?.is_active);

  if (
    isActive &&
    normalizeOptionalString(existing.author_user_object_id) &&
    normalizeOptionalString(existing.author_user_object_id) !== reactorUserObjectId
  ) {
    await insertNotificationEvent({
      eventType: "INSTALLATION_NOTE_REACTION",
      recipientUserObjectId: String(existing.author_user_object_id),
      recipientDisplayNameSnapshot: existing.author_display_name_snapshot,
      recipientEmailSnapshot: existing.author_email_snapshot,
      actorUserObjectId: reactorUserObjectId,
      actorDisplayNameSnapshot: normalizeOptionalString(getUserDisplayNameSnapshot(user)),
      actorEmailSnapshot: normalizeOptionalString(getUserEmail(user)),
      installationId: existing.installation_id,
      code: cleanCode,
      installationNoteId: cleanNoteId,
      reactionKey: cleanReactionKey,
      summaryText: "Iemand reageerde op je installatienotitie.",
      targetPath: `/installaties/${encodeURIComponent(cleanCode)}?tab=notes&subtab=notes&note=${encodeURIComponent(cleanNoteId)}`,
    });
  }

  return {
    ok: true,
    installation_note_id: cleanNoteId,
    reaction_key: cleanReactionKey,
    is_active: isActive,
    reactions,
  };
}

export async function getInstallationWorkflowItems(code: string) {
  const cleanCode = String(code || "").trim();
  const rows = await sqlQuery(getInstallationWorkflowItemsSql, { code: cleanCode });
  const items = (rows || []).map((row: any) => ({
    follow_up_action_id: row.follow_up_action_id,
    form_instance_id: row.form_instance_id,
    installation_id: row.installation_id,
    atrium_installation_code: row.atrium_installation_code,
    source_question_name: row.source_question_name ?? null,
    source_question_type: row.source_question_type ?? null,
    source_row_index: row.source_row_index ?? null,
    source_item_code: row.source_item_code ?? null,
    kind: row.kind ?? null,
    workflow_title: row.workflow_title ?? "",
    workflow_description: row.workflow_description ?? "",
    category: row.category ?? null,
    certificate_impact: row.certificate_impact ?? null,
    certificate_impact_override: row.certificate_impact_override ?? null,
    status: row.status ?? "OPEN",
    status_set_at: row.status_set_at ?? null,
    status_set_by: row.status_set_by ?? null,
    assigned_to: row.assigned_to ?? null,
    due_date: row.due_date ?? null,
    note: row.note ?? "",
    resolution_note: row.resolution_note ?? "",
    resolution_outcome: row.resolution_outcome ?? null,
    resolved_at: row.resolved_at ?? null,
    resolved_by: row.resolved_by ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
    instance_number: row.instance_number ?? null,
    form_code: row.form_code ?? null,
    form_status: row.form_status ?? null,
    parent_instance_id: row.parent_instance_id ?? null,
    form_title: row.form_title ?? row.form_code ?? "Formulier",
  }));

  const activeItems = items.filter((item) => WORKFLOW_ACTIVE_STATUSES.has(String(item.status || "").trim().toUpperCase()));
  const historicalItems = items.filter((item) => WORKFLOW_HISTORY_STATUSES.has(String(item.status || "").trim().toUpperCase()));

  return {
    code: cleanCode,
    items,
    activeItems,
    historicalItems,
    counts: {
      total: items.length,
      active: activeItems.length,
      open: items.filter((item) => WORKFLOW_OPEN_STATUSES.has(String(item.status || "").trim().toUpperCase())).length,
      planned: items.filter((item) => String(item.status || "").trim().toUpperCase() === "GEPLAND").length,
      historical: historicalItems.length,
    },
  };
}

export async function upsertInstallationDocuments(code: string, documents: any[], user: any) {
  if (!Array.isArray(documents)) {
    return { ok: false, error: "documents must be an array" };
  }

  await assertInstallationWritable(code);

  const cleaned = documents
    .filter((d) => d && typeof d.document_type_key === "string" && d.document_type_key.trim().length)
    .map((d) => ({
      document_id: d.document_id ?? null,
      document_type_key: String(d.document_type_key),

      title: d.title ?? null,
      note: d.note ?? null,
      document_number: d.document_number ?? null,
      document_date: d.document_date ?? null,
      revision: d.revision ?? null,

      is_active: d.is_active ?? true,
    }));

  const documentsJson = JSON.stringify(cleaned);
  const updatedBy = getUserAuditActor(user);

  const result = await sqlQuery(upsertInstallationDocumentsMetadataSql, {
    code,
    documentsJson,
    updatedBy,
  });

  return { ok: true, result };
}

export async function getInstallationTypes() {
  const rows = await sqlQuery(getInstallationTypesSql);
  return { types: rows };
}

export async function setInstallationType(
  code: string,
  installation_type_key: string | null,
  updatedBy: string
) {
  const cleanCode = String(code || "").trim();
  const key = installation_type_key ? String(installation_type_key) : null;
  const who = updatedBy || "unknown";

  await assertInstallationWritable(cleanCode);

  // 1) ensure ember row exists (or throw if code not in Atrium sync)
  await sqlQuery(ensureInstallationSql, {
    code: cleanCode,
    createdBy: who,
  });

  // 2) set type
  const rows = await sqlQuery(setInstallationTypeSql, {
    code: cleanCode,
    installation_type_key: key,
  });

  return {
    ok: true,
    result: rows?.[0] ?? { atrium_installation_code: cleanCode, installation_type_key: key },
  };
}

export async function searchInstallations(q: string | null, take = 25) {
  const clean = q ? String(q).trim() : "";

  if (!clean) {
    return { items: [] };
  }

  const rows = await sqlQuery(searchInstallationsSql, {
    take,
    q: clean,
    qLike: `%${clean}%`,
    qPrefix: `${clean}%`,
  });

  return { items: rows };
}

export async function getEnergySupplyBrandTypes() {
  const rows = await sqlQuery(getEnergySupplyBrandTypesSql);
  return { types: rows };
}

export async function upsertEnergySupplyBrandTypes(types: any[], user: any) {
  if (!Array.isArray(types)) {
    return { ok: false, error: "types must be an array" };
  }

  const cleaned = types
    .filter((t) => t && typeof t.brand_type_key === "string" && t.brand_type_key.trim().length)
    .map((t) => ({
      brand_type_key: String(t.brand_type_key).trim(),
      display_name: String(t.display_name ?? t.brand_type_key).trim(),
      default_capacity_ah: t.default_capacity_ah ?? null,
      sort_order: t.sort_order ?? null,
      is_active: t.is_active ?? true,
    }));

  const typesJson = JSON.stringify(cleaned);
  const updatedBy = getUserAuditActor(user);

  const result = await sqlQuery(upsertEnergySupplyBrandTypesSql, {
    typesJson,
    updatedBy,
  });

  return { ok: true, result };
}

export async function getInstallationEnergySupplies(code: string) {
  const rows = await sqlQuery(getInstallationEnergySuppliesSql, { code });
  return { items: rows };
}

export async function upsertInstallationEnergySupplies(code: string, items: any[], user: any) {
  if (!Array.isArray(items)) {
    return { ok: false, error: "items must be an array" };
  }

  await assertInstallationWritable(code);

  const cleaned = items.map((x) => ({
    energy_supply_id: x.energy_supply_id ?? null,

    sort_order: x.sort_order ?? null,
    kind: x.kind ?? "battery_set",

    location_label: x.location_label ?? null,

    brand_type_key: x.brand_type_key ?? null,
    brand_type_manual: x.brand_type_manual ?? null,

    quantity: x.quantity ?? 1,
    configuration: x.configuration ?? "single",

    capacity_ah: x.capacity_ah ?? null,

    battery_date: x.battery_date ?? null,

    remarks: x.remarks ?? null,

    is_active: x.is_active ?? true,
  }));

  for (const it of cleaned) {
    const hasKey = it.brand_type_key && String(it.brand_type_key).trim().length > 0;
    const hasManual = it.brand_type_manual && String(it.brand_type_manual).trim().length > 0;

    if (hasKey && hasManual) {
      return { ok: false, error: "kies óf merk/type óf handmatig; niet allebei" };
    }
  }

  for (const it of cleaned) {
    if (it.quantity !== null && it.quantity !== undefined) {
      const q = Number(it.quantity);
      if (!Number.isFinite(q) || q < 1) return { ok: false, error: "quantity must be >= 1" };
      it.quantity = Math.trunc(q);
    } else {
      it.quantity = 1;
    }

    const cfg = String(it.configuration || "").toLowerCase();
    if (!["single", "series", "parallel", "unknown"].includes(cfg)) {
      return { ok: false, error: "configuration must be single; series; parallel; unknown" };
    }
    it.configuration = cfg;

    // plaatsingdatum is verplicht en moet YYYY-MM-DD blijven (geen normalisatie)
    const ds = it.battery_date ? String(it.battery_date).trim() : "";
    if (!ds) return { ok: false, error: "plaatsingdatum is verplicht" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return { ok: false, error: "plaatsingdatum is ongeldig" };
    it.battery_date = ds;
  }

  const itemsJson = JSON.stringify(cleaned);
  const updatedBy = getUserAuditActor(user);

  const result = await sqlQuery(upsertInstallationEnergySuppliesSql, {
    code,
    itemsJson,
    updatedBy,
  });

  return { ok: true, result };
}

export async function deleteInstallationEnergySupply(code: string, energy_supply_id: string, user: any) {
  const updatedBy = getUserAuditActor(user);

  await assertInstallationWritable(code);

  const result = await sqlQuery(deleteInstallationEnergySupplySql, {
    code,
    energy_supply_id,
    updatedBy,
  });

  return { ok: true, result };
}

export async function getInstallationComponents(code: string) {
  const rows = await sqlQuery(getInstallationComponentsSql, { code });
  return { items: rows };
}

export async function getNen2535Catalog() {
const rs: any = await sqlQueryRaw(getNen2535CatalogSql);
const recordsets = Array.isArray(rs?.recordsets) ? rs.recordsets : [];
const normeringen = Array.isArray(recordsets[0]) ? recordsets[0] : [];
const functies = Array.isArray(recordsets[1]) ? recordsets[1] : [];
const matrix = Array.isArray(recordsets[2]) ? recordsets[2] : [];
return { normeringen, functies, matrix };

}

export async function upsertInstallationPerformanceRequirements(code: string, payload: any, user: any) {
  await assertInstallationWritable(code);

  const normering_key = String(payload?.normering_key || "").trim();
  const doormelding_mode = String(payload?.doormelding_mode || "").trim(); // header default/fallback
  const remarks = payload?.remarks ?? null;
  const rows = payload?.rows;

  if (!normering_key) return { ok: false, error: "normering_key is verplicht" };
  if (!["NEN2535_2009_PLUS", "NEN2535_1996_2008"].includes(normering_key)) {
    return { ok: false, error: "normering_key is ongeldig" };
  }

  if (!["GEEN", "ZONDER_VERTRAGING", "MET_VERTRAGING"].includes(doormelding_mode)) {
    return { ok: false, error: "doormelding_mode is ongeldig" };
  }

  if (!Array.isArray(rows)) return { ok: false, error: "rows must be an array" };

  const normalizeMode = (v: any) => {
    const s = String(v || "").trim();
    if (s === "MET_VERTRAGING") return "MET_VERTRAGING";
    if (s === "ZONDER_VERTRAGING") return "ZONDER_VERTRAGING";
    return "GEEN";
  };

  const matrixRows = await sqlQuery(getNen2535MatrixForNormSql, { normering_key });
  const allowedFunKeys = new Set((matrixRows as any[]).map((m) => String(m.gebruikersfunctie_key)));

  const toInt = (v: any, idx: number) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n < 0) throw new Error(`row ${idx + 1}: aantallen moeten >= 0 zijn`);
    return Math.trunc(n);
  };

  const cleaned = rows.map((r: any, idx: number) => {
    const gebruikersfunctie_key = String(r?.gebruikersfunctie_key || "").trim();
    if (!gebruikersfunctie_key) throw new Error(`row ${idx + 1}: gebruikersfunctie_key ontbreekt`);
    if (!allowedFunKeys.has(gebruikersfunctie_key)) {
      throw new Error(`row ${idx + 1}: gebruikersfunctie_key niet toegestaan voor normering`);
    }

    const row_label = r?.row_label == null ? null : String(r.row_label).trim();
    const rowMode = normalizeMode(r?.doormelding_mode ?? doormelding_mode);

    return {
      // natuurlijke sleutel: (performance_requirement_id, gebruikersfunctie_key, row_label, doormelding_mode)
      gebruikersfunctie_key,
      row_label: row_label && row_label.length ? row_label : null,
      doormelding_mode: rowMode,

      automatic_detectors: toInt(r.automatic_detectors, idx),
      manual_call_points: toInt(r.manual_call_points, idx),
      flame_detectors: toInt(r.flame_detectors, idx),
      linear_smoke_detectors: toInt(r.linear_smoke_detectors, idx),
      aspirating_openings: toInt(r.aspirating_openings, idx),

      sort_order: Number.isFinite(Number(r.sort_order)) ? Math.trunc(Number(r.sort_order)) : idx + 1,
    };
  });

  const updatedBy = getUserAuditActor(user);
  const rowsJson = JSON.stringify(cleaned);

  const result = await sqlQuery(upsertInstallationPerformanceRequirementSql, {
    code,
    normering_key,
    doormelding_mode, // header: blijft bestaan als default/overzicht
    remarks,
    updatedBy,
    rowsJson,
  });

  const readback = await getInstallationPerformanceRequirements(code);

  return { ok: true, result, readback };
}

export async function getInstallationPerformanceRequirements(code: string) {
  const rs: any = await sqlQueryRaw(getInstallationPerformanceRequirementSql, { code });

  const header = rs?.recordsets?.[0]?.[0] ?? null;
  const rows = rs?.recordsets?.[1] ?? [];

  if (!header) {
    return { code, performanceRequirement: null, rows: [], calculated: null };
  }

  const normKey = String(header.normering_key || "").trim();

  const matrixRows = await sqlQuery(getNen2535MatrixForNormSql, { normering_key: normKey });
  const matrixByKey = new Map<string, any>();
  for (const m of matrixRows as any[]) matrixByKey.set(String(m.gebruikersfunctie_key), m);

  type Mode = "GEEN" | "ZONDER_VERTRAGING" | "MET_VERTRAGING";

  const emptyRisk = () => ({ A: 0, B: 0, C: 0, D: 0, E: 0 });

  const byMode: Record<
    Mode,
    { internal: Record<string, number>; external: Record<string, number> }
  > = {
    GEEN: { internal: emptyRisk(), external: emptyRisk() },
    ZONDER_VERTRAGING: { internal: emptyRisk(), external: emptyRisk() },
    MET_VERTRAGING: { internal: emptyRisk(), external: emptyRisk() },
  };

  const normalizeMode = (v: any): Mode => {
    const s = String(v || "").trim();
    if (s === "MET_VERTRAGING") return "MET_VERTRAGING";
    if (s === "ZONDER_VERTRAGING") return "ZONDER_VERTRAGING";
    return "GEEN";
  };

  const enrichedRows = (rows as any[]).map((r) => {
    const m = matrixByKey.get(String(r.gebruikersfunctie_key)) || null;
    const w = weightedDetectorCount(r);

    const mode: Mode = normalizeMode(r.doormelding_mode);

    const ri = m?.risk_internal ?? null;
    const re = m?.risk_external ?? null;

    // extern telt altijd mee (alle modes)
    if (re && byMode[mode].external[re] !== undefined) byMode[mode].external[re] += w;

    // intern telt alléén mee bij MET_VERTRAGING
    if (mode === "MET_VERTRAGING") {
      if (ri && byMode[mode].internal[ri] !== undefined) byMode[mode].internal[ri] += w;
    }

    return {
      ...r,
      doormelding_mode: mode,
      matrix_name: m?.matrix_name ?? null,
      risk_internal: ri,
      risk_external: re,
      weighted_count: w,
      // handig voor UI: of intern relevant is voor deze regel
      intern_enabled: mode === "MET_VERTRAGING",
    };
  });

  const calcForMode = (mode: Mode) => {
    const maxExtern = calcMaxAllowed(normKey, byMode[mode].external, "external");

    // intern alleen bij MET_VERTRAGING
    const maxIntern = mode === "MET_VERTRAGING"
      ? calcMaxAllowed(normKey, byMode[mode].internal, "internal")
      : null;

    return {
      riskTotals: {
        internal: mode === "MET_VERTRAGING" ? byMode[mode].internal : null,
        external: byMode[mode].external,
      },
      maxAllowed: {
        internal: maxIntern,
        external: maxExtern,
      },
    };
  };

  return {
    code,
    performanceRequirement: header,
    rows: enrichedRows,
    calculated: {
      byMode: {
        GEEN: calcForMode("GEEN"),
        ZONDER_VERTRAGING: calcForMode("ZONDER_VERTRAGING"),
        MET_VERTRAGING: calcForMode("MET_VERTRAGING"),
      },
    },
  };
}
