import { useCallback, useState } from "react";
import { Paperclip } from "lucide-react";

import { getInstallationFollowUpAttachmentUrl } from "../../../api/emberApi.js";
import AnimatedIconButton from "../../../components/AnimatedIconButton.jsx";
import DateInput from "../../../components/DateInput.jsx";
import { ArrowBigRightIcon } from "../../../components/ui/arrow-big-right.jsx";
import { CheckCheckIcon } from "../../../components/ui/check-check.jsx";
import { HistoryIcon } from "../../../components/ui/history.jsx";
import { MapPinIcon } from "../../../components/ui/map-pin.jsx";
import { MapPinPlusInsideIcon } from "../../../components/ui/map-pin-plus-inside.jsx";
import { RotateCCWIcon } from "../../../components/ui/rotate-ccw.jsx";
import { SquarePenIcon } from "../../../components/ui/square-pen.jsx";
import { formatDateTime, getCardToneClass, getStatusTone, getToneClass, statusLabel } from "../../Monitor/formsMonitorShared.jsx";
import ActionPointPhoto from "../../../components/ActionPointPhoto.jsx";
import {
  ATRIUM_CONTEXT_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  RESPONSIBILITIES,
  RESPONSIBILITY_LABELS,
  categoryTags,
  certificateImpactValue,
  dueLabel,
  eventLabel,
  isOverdue,
  isTerminalStatus,
  otherAttachments,
  photoAttachments,
  sourceLabel,
} from "./actionPointsShared.js";

function Tag({ tone = "muted", title, children }) {
  return (
    <span className={`monitor-tag monitor-tag--${tone}`} title={title}>
      {children}
    </span>
  );
}

function emptyEdit(item) {
  return {
    priority: String(item.priority || "NORMAL").toUpperCase(),
    responsibility_type: String(item.responsibility_type || "INTERN").toUpperCase(),
    due_date: item.due_date ? String(item.due_date).slice(0, 10) : null,
    assigned_user_object_id: item.assigned_user_object_id || "",
    assigned_role_code: item.assigned_role_code || "",
    internal_note: item.note || "",
  };
}

export default function ActionPointCard({
  code,
  item,
  busy = false,
  readOnly = false,
  statuses = [],
  directory = [],
  workflowRoles = [],
  onStatus,
  onSave,
  onOpenDrawing,
  onSetLocation,
  onOpenPhoto,
}) {
  const loadPhotoUrl = useCallback(
    (storedFileId) =>
      getInstallationFollowUpAttachmentUrl(code, item.follow_up_action_id, storedFileId),
    [code, item.follow_up_action_id]
  );

  const [logOpen, setLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState(() => emptyEdit(item));

  const pins = item.drawing_pins || [];
  const photos = photoAttachments(item);
  const files = otherAttachments(item);
  const contexts = item.atrium_contexts || [];
  const tags = categoryTags(item).slice(0, 4);
  const overdue = isOverdue(item);
  const terminal = isTerminalStatus(item.status);
  const impact = certificateImpactValue(item);

  function openEditor() {
    setEdit(emptyEdit(item));
    setEditOpen(true);
  }

  function setField(key, value) {
    setEdit((current) => ({
      ...current,
      [key]: value,
      ...(key === "assigned_user_object_id" && value ? { assigned_role_code: "" } : {}),
      ...(key === "assigned_role_code" && value ? { assigned_user_object_id: "" } : {}),
    }));
  }

  async function submitEdit(event) {
    event.preventDefault();
    const selectedUser = directory.find(
      (entry) => String(entry.user_object_id) === String(edit.assigned_user_object_id)
    );

    await onSave?.(item, {
      priority: edit.priority,
      responsibility_type: edit.responsibility_type,
      due_date: edit.due_date || null,
      assigned_user_object_id: edit.assigned_user_object_id || null,
      assigned_role_code: edit.assigned_role_code || null,
      assigned_display_name_snapshot: selectedUser?.display_name || selectedUser?.name || null,
      assigned_email_snapshot: selectedUser?.email || null,
      internal_note: edit.internal_note || null,
    });

    setEditOpen(false);
  }

  return (
    <article
      className={`${getCardToneClass(item.status)} follow-up-card action-point-card${
        overdue ? " action-point-card--overdue" : ""
      }`}
    >
      <div className="follow-up-card__head">
        <div>
          <div className="follow-up-card__title">
            {item.source_item_code ? (
              <span className="action-point-card__code">{item.source_item_code}</span>
            ) : null}
            <span>{item.workflow_title || "Actiepunt"}</span>
          </div>
          {item.workflow_description ? (
            <div className="follow-up-card__description">{item.workflow_description}</div>
          ) : null}
        </div>
        <span className={getToneClass(getStatusTone(item.status))}>{statusLabel(item.status)}</span>
      </div>

      {photos.length || files.length ? (
        <div className="action-point-card__media">
          {photos.map((file) => (
            <ActionPointPhoto
              key={file.stored_file_id}
              loadUrl={loadPhotoUrl}
              file={file}
              onOpen={onOpenPhoto}
            />
          ))}
          {files.map((file) => (
            <span key={file.stored_file_id} className="action-point-file" title={file.file_name}>
              <Paperclip size={14} />
              {file.file_name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="follow-up-tags" aria-label="Kenmerken van dit actiepunt">
        <Tag tone="active" title="Waar dit punt vandaan komt">
          Bron; {sourceLabel(item)}
          {item.instance_number != null ? ` #${item.instance_number}` : ""}
        </Tag>
        <Tag title="Verantwoordelijke partij">
          {RESPONSIBILITY_LABELS[item.responsibility_type] || item.responsibility_type}
        </Tag>
        <Tag tone={["CRITICAL", "HIGH"].includes(String(item.priority || "").toUpperCase()) ? "warning" : "muted"}>
          {PRIORITY_LABELS[item.priority] || item.priority}
        </Tag>
        {impact === "yes" ? <Tag tone="danger">Raakt het certificaat</Tag> : null}
        {item.assigned_to ? <Tag>Toegewezen; {item.assigned_to}</Tag> : <Tag tone="warning">Niet toegewezen</Tag>}
        {pins.length ? (
          <Tag tone="active">
            {pins.length} markering{pins.length === 1 ? "" : "en"}
          </Tag>
        ) : (
          <Tag tone="muted">Geen locatie</Tag>
        )}
        {item.customer_visible ? <Tag tone="active">Zichtbaar voor klant</Tag> : null}
        {contexts.map((context) => (
          <Tag key={`${context.context_type}-${context.context_key}`} title={context.context_key}>
            {ATRIUM_CONTEXT_LABELS[context.context_type] || context.context_type};{" "}
            {context.context_display_snapshot || context.context_key}
          </Tag>
        ))}
        {tags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>

      <div className="follow-up-card__meta">
        <span className={overdue ? "action-point-card__due is-overdue" : "action-point-card__due"}>
          {dueLabel(item)}
        </span>
        <span>Laatst gewijzigd; {formatDateTime(item.updated_at || item.created_at)}</span>
        {item.last_review_decision ? (
          <span>
            Beoordeeld; {formatDateTime(item.last_reviewed_at)}
            {item.last_reviewed_by ? ` door ${item.last_reviewed_by}` : ""}
          </span>
        ) : null}
        {item.resolution_note ? <span>Afhandeling; {item.resolution_note}</span> : null}
      </div>

      {pins.length || item.form_instance_id || item.inspection_case_id ? (
        <div className="follow-up-card__links">
          {pins.map((pin) => (
            <AnimatedIconButton
              key={pin.drawing_pin_id}
              Icon={MapPinIcon}
              iconSize={16}
              onClick={() => onOpenDrawing?.(pin)}
            >
              {pin.pin_label || `Pagina ${pin.page_number}`}
            </AnimatedIconButton>
          ))}
          {item.form_instance_id ? (
            <AnimatedIconButton
              Icon={ArrowBigRightIcon}
              iconSize={17}
              to={`/monitor/formulieren/${encodeURIComponent(item.form_instance_id)}`}
            >
              Open het formulier
            </AnimatedIconButton>
          ) : null}
          {item.inspection_case_id ? (
            <AnimatedIconButton
              Icon={ArrowBigRightIcon}
              iconSize={17}
              to={`/inspecties/${encodeURIComponent(item.inspection_case_id)}`}
            >
              Open de inspectiecase
            </AnimatedIconButton>
          ) : null}
        </div>
      ) : null}

      <div className="follow-up-card__actions">
        <div className="action-point-card__actions-left">
          {!readOnly && !terminal && onSetLocation ? (
            <AnimatedIconButton
              Icon={MapPinPlusInsideIcon}
              iconSize={16}
              onClick={() => onSetLocation(item)}
              title="Plaats een markering op de tekening en koppel die aan dit punt"
            >
              {pins.length ? "Locatie toevoegen" : "Locatie bepalen"}
            </AnimatedIconButton>
          ) : null}

          {!readOnly ? (
            <AnimatedIconButton
              Icon={SquarePenIcon}
              iconSize={16}
              onClick={() => (editOpen ? setEditOpen(false) : openEditor())}
              aria-expanded={editOpen}
            >
              Bewerken
            </AnimatedIconButton>
          ) : null}

          <AnimatedIconButton
            Icon={HistoryIcon}
            iconSize={16}
            onClick={() => setLogOpen((value) => !value)}
            aria-expanded={logOpen}
          >
            Logboek {(item.events || []).length}
          </AnimatedIconButton>
        </div>

        <div className="action-point-card__actions-right">
          <label className="action-point-card__status">
            <span className="sr-only">Status van dit actiepunt</span>
            <select
              className="cf-input"
              value={String(item.status || "OPEN").toUpperCase()}
              disabled={readOnly || busy}
              onChange={(event) => onStatus?.(item, event.target.value)}
            >
              {statuses.map((status) => (
                <option key={status.status_code} value={status.status_code}>
                  {status.display_name || statusLabel(status.status_code)}
                </option>
              ))}
            </select>
          </label>

          {!terminal ? (
            <AnimatedIconButton
              Icon={CheckCheckIcon}
              iconSize={17}
              className="btn btn-compact"
              disabled={readOnly || busy}
              onClick={() => onStatus?.(item, "AFGEHANDELD")}
            >
              {busy ? "Opslaan..." : "Afhandelen"}
            </AnimatedIconButton>
          ) : (
            <AnimatedIconButton
              Icon={RotateCCWIcon}
              iconSize={17}
              disabled={readOnly || busy}
              onClick={() => onStatus?.(item, "OPEN")}
            >
              {busy ? "Opslaan..." : "Heropenen"}
            </AnimatedIconButton>
          )}
        </div>
      </div>

      {editOpen ? (
        <form className="action-point-editor" onSubmit={submitEdit}>
          <div className="action-point-editor__grid">
            <label className="follow-up-field">
              <span>Prioriteit</span>
              <select
                className="cf-input"
                value={edit.priority}
                onChange={(event) => setField("priority", event.target.value)}
              >
                {PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="follow-up-field">
              <span>Verantwoordelijkheid</span>
              <select
                className="cf-input"
                value={edit.responsibility_type}
                onChange={(event) => setField("responsibility_type", event.target.value)}
              >
                {RESPONSIBILITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="follow-up-field">
              <span>Deadline</span>
              <DateInput value={edit.due_date} onChange={(value) => setField("due_date", value)} allowEmpty />
            </label>

            <label className="follow-up-field">
              <span>Interne gebruiker</span>
              <select
                className="cf-input"
                value={edit.assigned_user_object_id}
                onChange={(event) => setField("assigned_user_object_id", event.target.value)}
              >
                <option value="">Niet toegewezen</option>
                {directory.map((entry) => (
                  <option key={entry.user_object_id} value={entry.user_object_id}>
                    {entry.display_name || entry.name || entry.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="follow-up-field">
              <span>Workflowrol</span>
              <select
                className="cf-input"
                value={edit.assigned_role_code}
                onChange={(event) => setField("assigned_role_code", event.target.value)}
              >
                <option value="">Niet toegewezen</option>
                {workflowRoles.map((role) => (
                  <option key={role.role_code} value={role.role_code}>
                    {role.display_name || role.role_code}
                  </option>
                ))}
              </select>
            </label>

            <label className="follow-up-field follow-up-field--wide">
              <span>Interne notitie</span>
              <textarea
                className="cf-textarea"
                rows={3}
                value={edit.internal_note}
                onChange={(event) => setField("internal_note", event.target.value)}
              />
            </label>
          </div>

          <div className="follow-up-create__actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>
              Annuleren
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Opslaan..." : "Wijzigingen opslaan"}
            </button>
          </div>
        </form>
      ) : null}

      {logOpen ? (
        <ol className="follow-up-timeline">
          {(item.events || []).map((event) => (
            <li key={event.follow_up_action_event_id}>
              <time>{formatDateTime(event.created_at)}</time>
              <span>{event.actor_display_name_snapshot || event.actor_email_snapshot || "Systeem"}</span>
              <strong>{eventLabel(event)}</strong>
            </li>
          ))}
          {!(item.events || []).length ? <li className="muted">Nog geen logboekregels.</li> : null}
        </ol>
      ) : null}
    </article>
  );
}
