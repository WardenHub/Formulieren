import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
  archiveInstallationProgramming,
  downloadInstallationProgrammingFile,
  getInstallationProgrammingDownloadUrl,
  putInstallationSoftware,
  uploadInstallationProgramming,
} from "../../api/emberApi.js";
import Tabs from "../../components/Tabs.jsx";

import { MonitorCheckIcon } from "@/components/ui/monitor-check";
import { UploadIcon } from "@/components/ui/upload";
import { DownloadIcon } from "@/components/ui/download";
import { ArchiveIcon } from "@/components/ui/archive";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { FileCogIcon } from "@/components/ui/file-cog";
import { CpuIcon } from "@/components/ui/cpu";
import { GitPullRequestIcon } from "@/components/ui/git-pull-request";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function isoDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayIsoDate() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function openNativeFilePicker(inputEl) {
  if (!inputEl) return;
  try {
    if (typeof inputEl.showPicker === "function") {
      inputEl.showPicker();
      return;
    }
  } catch {
    // fallback
  }
  inputEl.click();
}

function StatusChip({ children, tone = "neutral", href = null }) {
  const className = `ember-label ember-label--${tone}`;
  if (href) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    );
  }
  return <span className={className}>{children}</span>;
}

function AnimatedActionButton({
  title,
  onClick,
  Icon,
  children,
  className = "btn-ghost",
  disabled = false,
}) {
  const iconRef = useRef(null);

  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.();
      }}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
    >
      <Icon ref={iconRef} size={16} className="doc-anim-icon" />
      {children}
    </button>
  );
}

function ClickableUploadBar({ title, subtitle, onClick, compact = false, disabled = false }) {
  const iconRef = useRef(null);

  return (
    <button
      type="button"
      className={cx("doc-dropbar", compact && "doc-dropbar--compact")}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.(e);
      }}
      disabled={disabled}
    >
      <span className="doc-dropbar__text">
        <span className="doc-dropbar__title">{title}</span>
        {subtitle ? <span className="muted doc-dropbar__subtitle">{subtitle}</span> : null}
      </span>

      <span className="doc-dropbar__icon">
        <UploadIcon ref={iconRef} size={18} className="doc-anim-icon" />
      </span>
    </button>
  );
}

function buildSoftwareSnapshot(softwareData) {
  return JSON.stringify({
    management_portal: {
      portal_key: softwareData?.managementPortal?.portal_key ?? "",
      portal_installation_name: softwareData?.managementPortal?.portal_installation_name ?? "",
      portal_installation_reference: softwareData?.managementPortal?.portal_installation_reference ?? "",
      portal_installation_url: softwareData?.managementPortal?.portal_installation_url ?? "",
      note: softwareData?.managementPortal?.note ?? "",
    },
    programming_state: {
      presence_mode: softwareData?.programmingState?.presence_mode ?? "NONE",
      presence_note: softwareData?.programmingState?.presence_note ?? "",
    },
  });
}

function buildProgrammingSummary(programmingState, programmingItems) {
  const items = Array.isArray(programmingItems) ? programmingItems : [];
  const anyFile = items.some((item) => item?.has_file);
  const mode = String(programmingState?.presence_mode || "NONE").toUpperCase();

  if (mode === "MANUAL") {
    return {
      tone: "success",
      label: "Programmering aanwezig",
      detail: "Vastgelegd zonder ZIP-bestand",
    };
  }

  if (mode === "FILE" || anyFile) {
    return {
      tone: "success",
      label: "Programmering aanwezig",
      detail: anyFile ? `${items.length} bestand(en) bekend` : "Status staat op aanwezig via bestand",
    };
  }

  return {
    tone: "danger",
    label: "Geen programmering aanwezig",
    detail: "Nog geen programmering of handmatige aanwezigheid vastgelegd",
  };
}

function triggerBrowserDownload(result, fallbackName) {
  const blob = result?.blob;
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result?.fileName || fallbackName || "bestand";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SoftwareTab = forwardRef(function SoftwareTab(
  {
    code,
    softwareData,
    readOnly = false,
    onDirtyChange,
    onSavingChange,
    onSaveOk,
    onSaved,
    onAnyOpenChange,
  },
  ref
) {
  const initialSnapshotRef = useRef("");
  const uploadInputRef = useRef(null);

  const [managementPortal, setManagementPortal] = useState({
    portal_key: "",
    portal_installation_name: "",
    portal_installation_reference: "",
    portal_installation_url: "",
    note: "",
  });

  const [programmingState, setProgrammingState] = useState({
    presence_mode: "NONE",
    presence_note: "",
  });

  const [uploadDraft, setUploadDraft] = useState({
    title: "",
    version_label: "",
    programming_date: todayIsoDate(),
    note: "",
    parent_programming_id: "",
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState("software");
  const [openMap, setOpenMap] = useState({
    programmering: true,
    beheerportaal: true,
    bron: false,
  });

  useEffect(() => {
    setManagementPortal({
      portal_key: softwareData?.managementPortal?.portal_key ?? "",
      portal_installation_name: softwareData?.managementPortal?.portal_installation_name ?? "",
      portal_installation_reference: softwareData?.managementPortal?.portal_installation_reference ?? "",
      portal_installation_url: softwareData?.managementPortal?.portal_installation_url ?? "",
      note: softwareData?.managementPortal?.note ?? "",
    });

    setProgrammingState({
      presence_mode: softwareData?.programmingState?.presence_mode ?? "NONE",
      presence_note: softwareData?.programmingState?.presence_note ?? "",
    });

    setUploadDraft({
      title: "",
      version_label: "",
      programming_date: todayIsoDate(),
      note: "",
      parent_programming_id: "",
    });
    setUploadFile(null);
    setError(null);

    initialSnapshotRef.current = buildSoftwareSnapshot(softwareData);
    onDirtyChange?.(false);
  }, [softwareData, onDirtyChange]);

  useEffect(() => {
    const snapshot = JSON.stringify({
      management_portal: managementPortal,
      programming_state: programmingState,
    });
    onDirtyChange?.(readOnly ? false : snapshot !== initialSnapshotRef.current);
  }, [managementPortal, programmingState, onDirtyChange, readOnly]);

  useEffect(() => {
    onSavingChange?.(saving || uploading);
  }, [saving, uploading, onSavingChange]);

  useEffect(() => {
    const anyOpen = Object.values(openMap).some(Boolean);
    onAnyOpenChange?.(anyOpen);
  }, [openMap, onAnyOpenChange]);

  const portalOptions = useMemo(() => {
    return Array.isArray(softwareData?.portalOptions) ? softwareData.portalOptions : [];
  }, [softwareData]);

  const programmingItems = useMemo(() => {
    return Array.isArray(softwareData?.programmingItems) ? softwareData.programmingItems : [];
  }, [softwareData]);

  const activeProgrammingItems = useMemo(
    () => programmingItems.filter((item) => item?.is_active !== false),
    [programmingItems]
  );

  const archivedProgrammingItems = useMemo(
    () => programmingItems.filter((item) => item?.is_active === false),
    [programmingItems]
  );

  const programmingSummary = useMemo(
    () => buildProgrammingSummary(programmingState, programmingItems),
    [programmingState, programmingItems]
  );

  const softwareSubTabs = useMemo(
    () => [
      {
        key: "software",
        label: "Software",
        Icon: CpuIcon,
      },
      {
        key: "beheerportaal",
        label: "Beheerportaal",
        Icon: GitPullRequestIcon,
      },
    ],
    []
  );

  function toggleSection(key) {
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function expandAll() {
    setOpenMap({
      programmering: true,
      beheerportaal: true,
      bron: true,
    });
  }

  function collapseAll() {
    setOpenMap({
      programmering: false,
      beheerportaal: false,
      bron: false,
    });
  }

  async function save() {
    if (readOnly || saving) return;

    setSaving(true);
    setError(null);

    try {
      await putInstallationSoftware(code, {
        management_portal: managementPortal,
        programming_state: programmingState,
      });

      await onSaved?.();
      onSaveOk?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save, expandAll, collapseAll }));

  async function handleOpenProgramming(item) {
    const result = await getInstallationProgrammingDownloadUrl(code, item.programming_id);
    if (!result?.url) return;
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function handleDownloadProgramming(item) {
    const result = await downloadInstallationProgrammingFile(code, item.programming_id);
    triggerBrowserDownload(result, item.file_name || "programmering.zip");
  }

  async function handleArchiveProgramming(item) {
    if (readOnly) return;

    const ok = window.confirm(
      `Weet je zeker dat je programmeerbestand "${item.title || item.file_name || item.programming_id}" wilt archiveren?`
    );
    if (!ok) return;

    setUploading(true);
    setError(null);

    try {
      await archiveInstallationProgramming(code, item.programming_id);
      await onSaved?.();
      onSaveOk?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadProgramming() {
    if (readOnly || uploading) return;
    if (!uploadFile) {
      setError("Kies eerst een ZIP-bestand.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await uploadInstallationProgramming(code, uploadFile, {
        title: uploadDraft.title || null,
        version_label: uploadDraft.version_label || null,
        programming_date: uploadDraft.programming_date || null,
        note: uploadDraft.note || null,
        parent_programming_id: uploadDraft.parent_programming_id || null,
      });

      setUploadDraft({
        title: "",
        version_label: "",
        programming_date: todayIsoDate(),
        note: "",
        parent_programming_id: "",
      });
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";

      await onSaved?.();
      onSaveOk?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  function renderSection(title, key, subtitle, content, actions = null) {
    const isOpen = openMap[key] === true;

    return (
      <div className="admin-subcard">
        <button
          type="button"
          className="admin-section-head"
          onClick={() => toggleSection(key)}
        >
          <div className="admin-section-head-main">
            <div className="admin-section-title">{title}</div>
            {subtitle ? <div className="admin-section-sub">{subtitle}</div> : null}
          </div>

          <div className="ember-label-row">
            {actions}
            {isOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
          </div>
        </button>

        {isOpen ? <div className="admin-section-body">{content}</div> : null}
      </div>
    );
  }

  if (!softwareData) {
    return (
      <div className="card" style={{ minHeight: 180, display: "grid", placeItems: "center" }}>
        <div style={{ display: "grid", gap: 8, justifyItems: "center", textAlign: "center", padding: 24 }}>
          <MonitorCheckIcon size={28} className="nav-anim-icon" />
          <div style={{ fontWeight: 800, fontSize: 20 }}>Software laden...</div>
          <div className="muted" style={{ fontSize: 13 }}>Bezig met software- en beheerportaalgegevens ophalen.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <StatusChip tone={programmingSummary.tone}>{programmingSummary.label}</StatusChip>
          {programmingSummary.detail ? (
            <StatusChip tone="muted">{programmingSummary.detail}</StatusChip>
          ) : null}

          {managementPortal.portal_key ? (
            <StatusChip
              tone="info"
              href={managementPortal.portal_installation_url || null}
            >
              {softwareData?.managementPortal?.portal_display_name || managementPortal.portal_key}
            </StatusChip>
          ) : null}

          {uploadFile ? <StatusChip tone="accent">ZIP klaar voor upload</StatusChip> : null}
          {readOnly ? <StatusChip tone="muted">Historische installatie; alleen lezen</StatusChip> : null}
        </div>

        {error ? <div className="ember-label ember-label--danger">{error}</div> : null}
      </div>

      <Tabs tabs={softwareSubTabs} activeKey={activeSubTab} onChange={setActiveSubTab} />

      {activeSubTab === "software" ? (
        <>
          {renderSection(
            "Programmering",
            "programmering",
            "Leg vast of programmering aanwezig is; upload bij voorkeur een ZIP-bestand. Historische bestanden blijven zichtbaar.",
            <div style={{ display: "grid", gap: 16 }}>
              <div className="cf-grid">
                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Status</div>
                  </div>

                  <div className="cf-control">
                    <select
                      className="input"
                      value={programmingState.presence_mode}
                      disabled={readOnly}
                      onChange={(e) =>
                        setProgrammingState((prev) => ({
                          ...prev,
                          presence_mode: e.target.value || "NONE",
                        }))
                      }
                    >
                      <option value="NONE">Geen programmering vastgelegd</option>
                      <option value="MANUAL">Programmering aanwezig zonder bestand</option>
                      <option value="FILE">Programmering aanwezig via bestand(en)</option>
                    </select>
                  </div>
                </div>

                <div className="cf-row">
                  <div className="cf-label">
                    <div className="cf-label-text">Notitie</div>
                  </div>

                  <div className="cf-control">
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Leg kort uit hoe de programmering geregeld is; bijvoorbeeld via extern beheer of server."
                      value={programmingState.presence_note}
                      disabled={readOnly}
                      onChange={(e) =>
                        setProgrammingState((prev) => ({
                          ...prev,
                          presence_note: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {!readOnly ? (
                <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>Nieuwe programmering uploaden</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      Voeg bij voorkeur één ZIP-bestand per versie toe; geen losse mappenstructuren of bundels vol subbestanden.
                    </div>
                  </div>

                  <input
                    ref={uploadInputRef}
                    type="file"
                    hidden
                    accept=".zip,application/zip,application/x-zip-compressed"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadFile(file);
                      if (file && !uploadDraft.title) {
                        setUploadDraft((prev) => ({
                          ...prev,
                          title: String(file.name || "").replace(/\.zip$/i, ""),
                        }));
                      }
                    }}
                  />

                  <ClickableUploadBar
                    title={uploadFile ? uploadFile.name : "ZIP-bestand kiezen"}
                    subtitle={
                      uploadFile
                        ? "Klaar voor upload; metadata hieronder mag je nog aanpassen."
                        : "Klik om een ZIP-bestand te kiezen."
                    }
                    onClick={() => openNativeFilePicker(uploadInputRef.current)}
                    disabled={uploading}
                  />

                  <div className="cf-grid">
                    <div className="cf-row">
                      <div className="cf-label">
                        <div className="cf-label-text">Titel</div>
                      </div>
                      <div className="cf-control">
                        <input
                          className="input"
                          value={uploadDraft.title}
                          disabled={uploading}
                          placeholder="Programmering Bosch BMI"
                          onChange={(e) =>
                            setUploadDraft((prev) => ({ ...prev, title: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="cf-row">
                      <div className="cf-label">
                        <div className="cf-label-text">Versie</div>
                      </div>
                      <div className="cf-control">
                        <input
                          className="input"
                          value={uploadDraft.version_label}
                          disabled={uploading}
                          placeholder="1.0"
                          onChange={(e) =>
                            setUploadDraft((prev) => ({ ...prev, version_label: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="cf-row">
                      <div className="cf-label">
                        <div className="cf-label-text">Datum</div>
                      </div>
                      <div className="cf-control">
                        <input
                          type="date"
                          className="input"
                          value={uploadDraft.programming_date}
                          disabled={uploading}
                          onChange={(e) =>
                            setUploadDraft((prev) => ({ ...prev, programming_date: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="cf-row">
                      <div className="cf-label">
                        <div className="cf-label-text">Vervangt</div>
                      </div>
                      <div className="cf-control">
                        <select
                          className="input"
                          value={uploadDraft.parent_programming_id}
                          disabled={uploading}
                          onChange={(e) =>
                            setUploadDraft((prev) => ({
                              ...prev,
                              parent_programming_id: e.target.value || "",
                            }))
                          }
                        >
                          <option value="">geen specifieke vorige versie</option>
                          {activeProgrammingItems.map((item) => (
                            <option key={item.programming_id} value={item.programming_id}>
                              {item.title || item.file_name || item.programming_id}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="cf-row">
                      <div className="cf-label">
                        <div className="cf-label-text">Notitie</div>
                      </div>
                      <div className="cf-control">
                        <textarea
                          className="input"
                          rows={2}
                          value={uploadDraft.note}
                          disabled={uploading}
                          placeholder="Korte context; bijvoorbeeld paneeltype of exportmoment."
                          onChange={(e) =>
                            setUploadDraft((prev) => ({ ...prev, note: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <AnimatedActionButton
                      title="programmering uploaden"
                      Icon={UploadIcon}
                      className="btn btn-secondary"
                      disabled={uploading || !uploadFile}
                      onClick={handleUploadProgramming}
                    >
                      {uploading ? "uploaden..." : "ZIP uploaden"}
                    </AnimatedActionButton>
                  </div>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Actieve programmeerbestanden</div>
                {activeProgrammingItems.length === 0 ? (
                  <div className="muted">Nog geen actieve programmeerbestanden.</div>
                ) : (
                  <div className="doc-list">
                    {activeProgrammingItems.map((item) => (
                      <div key={item.programming_id} className="doc-main-item">
                        <div className="doc-card">
                          <div className="doc-card__top">
                            <div className="doc-card__top-left">
                              <div className="doc-card__top-icon">
                                <FileCogIcon size={18} className="doc-anim-icon" />
                              </div>

                              <div className="doc-card__main">
                                <div className="doc-card__title-row">
                                  <div className="doc-card__title">
                                    {item.title || item.file_name || "Programmering"}
                                  </div>

                                  <div className="doc-card__labels">
                                    {item.has_file ? (
                                      <StatusChip tone="success">ZIP aanwezig</StatusChip>
                                    ) : (
                                      <StatusChip tone="warning">Nog zonder bestand</StatusChip>
                                    )}
                                    {item.version_label ? <StatusChip tone="neutral">Versie; {item.version_label}</StatusChip> : null}
                                    {item.programming_date ? <StatusChip tone="neutral">Datum; {isoDate(item.programming_date)}</StatusChip> : null}
                                    {item.file_size_bytes ? <StatusChip tone="muted">{formatBytes(item.file_size_bytes)}</StatusChip> : null}
                                  </div>
                                </div>

                                <div className="muted doc-card__subtitle">
                                  {item.note || item.file_name || " "}
                                </div>
                              </div>
                            </div>

                            <div className="doc-card__actions">
                              {item.has_file ? (
                                <AnimatedActionButton
                                  title="openen"
                                  Icon={FileCogIcon}
                                  onClick={() => handleOpenProgramming(item)}
                                >
                                  openen
                                </AnimatedActionButton>
                              ) : null}

                              {item.has_file ? (
                                <AnimatedActionButton
                                  title="downloaden"
                                  Icon={DownloadIcon}
                                  onClick={() => handleDownloadProgramming(item)}
                                >
                                  downloaden
                                </AnimatedActionButton>
                              ) : null}

                              {!readOnly ? (
                                <AnimatedActionButton
                                  title="archiveren"
                                  Icon={ArchiveIcon}
                                  onClick={() => handleArchiveProgramming(item)}
                                >
                                  archiveren
                                </AnimatedActionButton>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {archivedProgrammingItems.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>Historische programmeerbestanden</div>
                  <div className="doc-list doc-list--archived">
                    {archivedProgrammingItems.map((item) => (
                      <div key={item.programming_id} className="doc-main-item">
                        <div className="doc-card">
                          <div className="doc-card__top">
                            <div className="doc-card__top-left">
                              <div className="doc-card__top-icon">
                                <FileCogIcon size={18} className="doc-anim-icon" />
                              </div>

                              <div className="doc-card__main">
                                <div className="doc-card__title-row">
                                  <div className="doc-card__title">
                                    {item.title || item.file_name || "Programmering"}
                                  </div>
                                  <div className="doc-card__labels">
                                    <StatusChip tone="neutral">Historisch</StatusChip>
                                    {item.version_label ? <StatusChip tone="neutral">Versie; {item.version_label}</StatusChip> : null}
                                    {item.programming_date ? <StatusChip tone="neutral">Datum; {isoDate(item.programming_date)}</StatusChip> : null}
                                  </div>
                                </div>

                                <div className="muted doc-card__subtitle">
                                  {item.note || item.file_name || " "}
                                </div>
                              </div>
                            </div>

                            <div className="doc-card__actions">
                              {item.has_file ? (
                                <AnimatedActionButton
                                  title="openen"
                                  Icon={FileCogIcon}
                                  onClick={() => handleOpenProgramming(item)}
                                >
                                  openen
                                </AnimatedActionButton>
                              ) : null}

                              {item.has_file ? (
                                <AnimatedActionButton
                                  title="downloaden"
                                  Icon={DownloadIcon}
                                  onClick={() => handleDownloadProgramming(item)}
                                >
                                  downloaden
                                </AnimatedActionButton>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>,
            <StatusChip tone={programmingSummary.tone}>{programmingSummary.label}</StatusChip>
          )}

          {renderSection(
            "Bron uit Atrium",
            "bron",
            "Alleen lezen; dit zijn bestaande Atrium-velden die context kunnen geven bij software en beheer.",
            <div className="cf-grid">
              <div className="cf-row">
                <div className="cf-label">
                  <div className="cf-label-text">Softwareversie</div>
                </div>
                <div className="cf-control">
                  <input className="input" value={softwareData?.atrium?.software_versie || ""} disabled />
                </div>
              </div>

              <div className="cf-row">
                <div className="cf-label">
                  <div className="cf-label-text">Software gebruiker</div>
                </div>
                <div className="cf-control">
                  <input className="input" value={softwareData?.atrium?.software_gebruikersnaam || ""} disabled />
                </div>
              </div>
            </div>,
            <StatusChip tone="muted">Atrium</StatusChip>
          )}
        </>
      ) : (
        renderSection(
          "Beheerportaal",
          "beheerportaal",
          "Leg het gekoppelde beheerportaal vast; maximaal één portaal per installatie.",
          <div className="cf-grid">
            <div className="cf-row">
              <div className="cf-label">
                <div className="cf-label-text">Portaal</div>
              </div>
              <div className="cf-control">
                <select
                  className="input"
                  value={managementPortal.portal_key}
                  disabled={readOnly}
                  onChange={(e) =>
                    setManagementPortal((prev) => ({
                      ...prev,
                      portal_key: e.target.value || "",
                    }))
                  }
                >
                  <option value="">geen beheerportaal</option>
                  {portalOptions.map((item) => (
                    <option key={item.portal_key} value={item.portal_key}>
                      {item.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cf-row">
              <div className="cf-label">
                <div className="cf-label-text">Naam in portaal</div>
              </div>
              <div className="cf-control">
                <input
                  className="input"
                  value={managementPortal.portal_installation_name}
                  disabled={readOnly || !managementPortal.portal_key}
                  placeholder="Naam of label van de installatie in het portaal"
                  onChange={(e) =>
                    setManagementPortal((prev) => ({
                      ...prev,
                      portal_installation_name: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="cf-row">
              <div className="cf-label">
                <div className="cf-label-text">Referentie</div>
              </div>
              <div className="cf-control">
                <input
                  className="input"
                  value={managementPortal.portal_installation_reference}
                  disabled={readOnly || !managementPortal.portal_key}
                  placeholder="Installatie-id of referentie in het portaal"
                  onChange={(e) =>
                    setManagementPortal((prev) => ({
                      ...prev,
                      portal_installation_reference: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="cf-row">
              <div className="cf-label">
                <div className="cf-label-text">URL naar installatie</div>
              </div>
              <div className="cf-control">
                <input
                  className="input"
                  value={managementPortal.portal_installation_url}
                  disabled={readOnly || !managementPortal.portal_key}
                  placeholder="https://..."
                  onChange={(e) =>
                    setManagementPortal((prev) => ({
                      ...prev,
                      portal_installation_url: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="cf-row">
              <div className="cf-label">
                <div className="cf-label-text">Notitie</div>
              </div>
              <div className="cf-control">
                <textarea
                  className="input"
                  rows={2}
                  value={managementPortal.note}
                  disabled={readOnly || !managementPortal.portal_key}
                  placeholder="Korte context; bijvoorbeeld tenant of bijzonderheden."
                  onChange={(e) =>
                    setManagementPortal((prev) => ({
                      ...prev,
                      note: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {managementPortal.portal_installation_url ? (
              <div className="cf-row">
                <div className="cf-label">
                  <div className="cf-label-text">Actie</div>
                </div>
                <div className="cf-control">
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <StatusChip tone="info" href={managementPortal.portal_installation_url}>
                      Open beheerportaal
                    </StatusChip>
                  </div>
                </div>
              </div>
            ) : null}
          </div>,
          managementPortal.portal_key ? (
            <StatusChip
              tone="info"
              href={managementPortal.portal_installation_url || null}
            >
              {softwareData?.managementPortal?.portal_display_name || managementPortal.portal_key}
            </StatusChip>
          ) : (
            <StatusChip tone="muted">Geen portaal</StatusChip>
          )
        )
      )}
    </div>
  );
});

export default SoftwareTab;
