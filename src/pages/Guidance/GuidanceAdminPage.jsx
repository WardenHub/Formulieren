import { useEffect, useMemo, useRef, useState } from "react";
import {
  activateAdminGuidanceMedia,
  archiveAdminGuidanceMedia,
  createAdminGuidanceExternalMedia,
  createAdminGuidanceItem,
  getAdminGuidanceCatalog,
  getMe,
  saveAdminGuidanceLinks,
  updateAdminGuidanceItem,
  uploadAdminGuidanceMedia,
} from "../../api/emberApi.js";
import { BookTextIcon } from "@/components/ui/book-text";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { PlusIcon } from "@/components/ui/plus";
import { UploadIcon } from "@/components/ui/upload";
import { MicIcon } from "@/components/ui/mic";
import { HistoryIcon } from "@/components/ui/history";
import { ChevronDownIcon } from "@/components/ui/chevron-down";
import { ChevronRightIcon } from "@/components/ui/chevron-right";
import { SearchIcon } from "@/components/ui/search";
import { ArchiveIcon } from "@/components/ui/archive";
import { CheckIcon } from "@/components/ui/check";

function normalizeItemDraft(item) {
  return {
    title: item?.title ?? "",
    body_markdown: item?.body_markdown ?? "",
    sort_order: item?.sort_order ?? 0,
    is_active: item?.is_active !== false,
  };
}

function formatDateTime(value) {
  if (!value) return "onbekend";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function fileSizeLabel(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function GuidanceItemMeta({ item }) {
  const linkCount = Array.isArray(item?.links) ? item.links.length : 0;
  const activeVideo = Array.isArray(item?.media_assets)
    ? item.media_assets.some((media) => media.media_kind === "video" && media.is_active)
    : false;
  const activeImage = Array.isArray(item?.media_assets)
    ? item.media_assets.some((media) => media.media_kind === "image" && media.is_active)
    : false;

  return (
    <div className="ember-label-row admin-inline-labels">
      <span className={`ember-label ember-label--${item?.is_active === false ? "muted" : "success"}`}>
        {item?.is_active === false ? "Inactief" : "Actief"}
      </span>
      <span className="ember-label ember-label--muted">{linkCount} koppeling(en)</span>
      <span className={`ember-label ember-label--${activeVideo ? "success" : "muted"}`}>
        video; {activeVideo ? "actief" : "geen"}
      </span>
      <span className={`ember-label ember-label--${activeImage ? "success" : "muted"}`}>
        afbeelding; {activeImage ? "actief" : "geen"}
      </span>
    </div>
  );
}

function MediaHistorySection({
  title,
  kind,
  mediaItems,
  historyOpen,
  setHistoryOpen,
  onActivate,
  onArchive,
  onUploadClick,
  onCaptureClick,
  onExternalCreate,
  externalDraft,
  setExternalDraft,
  busyKey,
}) {
  const activeItem = mediaItems.find((item) => item.is_active) || null;
  const archiveItems = mediaItems.filter((item) => !item.is_active);

  return (
    <div className="admin-subcard guidance-media-card">
      <div className="admin-toolbar">
        <div className="admin-toolbar-title">
          <div className="admin-subcard-title">{title}</div>
          <div className="admin-panel-subtitle">
            Maximaal 1 actieve {kind === "video" ? "video" : "afbeelding"} tegelijk.
          </div>
        </div>

        <div className="admin-toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={onUploadClick}>
            <UploadIcon size={16} className="nav-anim-icon" />
            {kind === "video" ? "Bestand kiezen" : "Afbeelding kiezen"}
          </button>

          <button type="button" className="btn btn-secondary" onClick={onCaptureClick}>
            {kind === "video" ? <MicIcon size={16} className="nav-anim-icon" /> : <UploadIcon size={16} className="nav-anim-icon" />}
            {kind === "video" ? "Video opnemen" : "Foto maken"}
          </button>
        </div>
      </div>

      <div className="guidance-media-active">
        {activeItem ? (
          <div className="guidance-media-active-card">
            <div className="ember-label-row admin-inline-labels">
              <span className="ember-label ember-label--success">Actief</span>
              <span className="ember-label ember-label--muted">
                {activeItem.source_kind === "upload" ? "Upload" : "Externe URL"}
              </span>
              {activeItem.file_name ? (
                <span className="ember-label ember-label--muted">{activeItem.file_name}</span>
              ) : null}
              {activeItem.file_size_bytes ? (
                <span className="ember-label ember-label--muted">
                  {fileSizeLabel(activeItem.file_size_bytes)}
                </span>
              ) : null}
            </div>

            {kind === "image" && activeItem.preview_url ? (
              <img
                src={activeItem.preview_url}
                alt={activeItem.caption || "Actieve afbeelding"}
                className="guidance-media-preview guidance-media-preview--image"
              />
            ) : null}

            {kind === "video" && activeItem.preview_url ? (
              <video
                className="guidance-media-preview guidance-media-preview--video"
                controls
                preload="metadata"
                src={activeItem.preview_url}
              />
            ) : null}

            {activeItem.caption ? (
              <div className="admin-panel-subtitle">{activeItem.caption}</div>
            ) : null}

            <div className="guidance-media-actions">
              {activeItem.preview_url ? (
                <a
                  className="btn btn-secondary"
                  href={activeItem.preview_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Openen
                </a>
              ) : null}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onArchive(activeItem.guidance_media_id)}
                disabled={busyKey === `${kind}:archive:${activeItem.guidance_media_id}`}
              >
                <ArchiveIcon size={16} className="nav-anim-icon" />
                Archiveren
              </button>
            </div>
          </div>
        ) : (
          <div className="admin-empty-note">Nog geen actieve {kind === "video" ? "video" : "afbeelding"} ingesteld.</div>
        )}
      </div>

      <div className="guidance-external-row">
        <label className="admin-field">
          <span>Externe {kind === "video" ? "video-URL" : "afbeeldings-URL"}</span>
          <input
            value={externalDraft.url}
            onChange={(e) => setExternalDraft((prev) => ({ ...prev, url: e.target.value }))}
            placeholder={kind === "video" ? "https://..." : "https://..."}
          />
        </label>

        <label className="admin-field">
          <span>Bijschrift</span>
          <input
            value={externalDraft.caption}
            onChange={(e) => setExternalDraft((prev) => ({ ...prev, caption: e.target.value }))}
            placeholder="optioneel"
          />
        </label>

        <div className="guidance-inline-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onExternalCreate}
            disabled={!String(externalDraft.url || "").trim()}
          >
            Externe {kind === "video" ? "video" : "afbeelding"} activeren
          </button>
        </div>
      </div>

      <div className="guidance-history-block">
        <button
          type="button"
          className="admin-section-head"
          onClick={() => setHistoryOpen((prev) => !prev)}
        >
          <div className="admin-section-head-main">
            <div className="admin-section-title">
              <HistoryIcon size={16} className="nav-anim-icon" />
              Geschiedenis
            </div>
            <div className="admin-section-sub">
              {archiveItems.length} gearchiveerd
            </div>
          </div>

          {historyOpen ? (
            <ChevronDownIcon size={18} className="nav-anim-icon" />
          ) : (
            <ChevronRightIcon size={18} className="nav-anim-icon" />
          )}
        </button>

        {historyOpen ? (
          <div className="admin-section-body">
            {archiveItems.length === 0 ? (
              <div className="admin-empty-note">Nog geen oudere {kind === "video" ? "videos" : "afbeeldingen"}.</div>
            ) : (
              <div className="admin-check-grid">
                {archiveItems.map((item) => (
                  <div key={item.guidance_media_id} className="admin-subcard">
                    <div className="admin-toolbar">
                      <div className="admin-toolbar-title">
                        <div className="admin-subcard-title">
                          {item.file_name || item.external_url || `${kind} item`}
                        </div>
                        <div className="ember-label-row admin-inline-labels">
                          <span className="ember-label ember-label--muted">Gearchiveerd</span>
                          <span className="ember-label ember-label--muted">
                            {item.source_kind === "upload" ? "Upload" : "Externe URL"}
                          </span>
                          <span className="ember-label ember-label--muted">
                            {formatDateTime(item.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="admin-toolbar-actions">
                        {item.preview_url ? (
                          <a
                            className="btn btn-secondary"
                            href={item.preview_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Openen
                          </a>
                        ) : null}

                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onActivate(item.guidance_media_id)}
                          disabled={busyKey === `${kind}:activate:${item.guidance_media_id}`}
                        >
                          <CheckIcon size={16} className="nav-anim-icon" />
                          Activeren
                        </button>
                      </div>
                    </div>

                    {item.caption ? <div className="admin-panel-subtitle">{item.caption}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function GuidanceAdminPage() {
  const videoUploadInputRef = useRef(null);
  const videoCaptureInputRef = useRef(null);
  const imageUploadInputRef = useRef(null);
  const imageCaptureInputRef = useRef(null);

  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedGuidanceId, setSelectedGuidanceId] = useState("");
  const [search, setSearch] = useState("");
  const [itemDraft, setItemDraft] = useState({
    title: "",
    body_markdown: "",
    sort_order: 0,
    is_active: true,
  });
  const [linksDraft, setLinksDraft] = useState([]);
  const [savingItem, setSavingItem] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [mediaBusyKey, setMediaBusyKey] = useState("");
  const [videoHistoryOpen, setVideoHistoryOpen] = useState(false);
  const [imageHistoryOpen, setImageHistoryOpen] = useState(false);
  const [videoExternalDraft, setVideoExternalDraft] = useState({ url: "", caption: "" });
  const [imageExternalDraft, setImageExternalDraft] = useState({ url: "", caption: "" });

  async function loadPage(preferredGuidanceId = "") {
    setLoading(true);
    setError("");

    try {
      const [meRes, catalogRes] = await Promise.all([getMe(), getAdminGuidanceCatalog()]);
      const nextRoles = Array.isArray(meRes?.roles) ? meRes.roles : [];
      const nextCatalog = catalogRes || { items: [], forms: [] };

      setRoles(nextRoles);
      setCatalog(nextCatalog);

      const items = Array.isArray(nextCatalog.items) ? nextCatalog.items : [];
      const nextSelected =
        items.find((item) => item.guidance_id === preferredGuidanceId)?.guidance_id ||
        items.find((item) => item.guidance_id === selectedGuidanceId)?.guidance_id ||
        items[0]?.guidance_id ||
        "";

      setSelectedGuidanceId(nextSelected);
    } catch (e) {
      setError(e?.message || String(e));
      setCatalog({ items: [], forms: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const forms = Array.isArray(catalog?.forms) ? catalog.forms : [];

  const selectedItem = useMemo(
    () => items.find((item) => item.guidance_id === selectedGuidanceId) || null,
    [items, selectedGuidanceId]
  );

  useEffect(() => {
    if (!selectedItem) {
      setItemDraft({
        title: "",
        body_markdown: "",
        sort_order: 0,
        is_active: true,
      });
      setLinksDraft([]);
      setVideoExternalDraft({ url: "", caption: "" });
      setImageExternalDraft({ url: "", caption: "" });
      return;
    }

    setItemDraft(normalizeItemDraft(selectedItem));
    setLinksDraft(
      Array.isArray(selectedItem.links)
        ? selectedItem.links.map((link, index) => ({
            form_id: link.form_id ?? "",
            question_name: link.question_name ?? "",
            sort_order: link.sort_order ?? (index + 1) * 10,
          }))
        : []
    );
    setVideoExternalDraft({ url: "", caption: "" });
    setImageExternalDraft({ url: "", caption: "" });
  }, [selectedItem]);

  const formMap = useMemo(() => {
    const map = new Map();
    for (const form of forms) {
      map.set(form.form_id, form);
    }
    return map;
  }, [forms]);

  const visibleItems = useMemo(() => {
    const needle = String(search || "").trim().toLowerCase();
    if (!needle) return items;

    return items.filter((item) => {
      const text = [
        item.title,
        item.body_markdown,
        ...(Array.isArray(item.links)
          ? item.links.flatMap((link) => [link.form_code, link.form_name, link.question_name])
          : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(needle);
    });
  }, [items, search]);

  const canManage = roles.includes("admin") || roles.includes("uitlegbeheerder");

  async function handleCreateItem() {
    const title = `Nieuwe toelichting ${items.length + 1}`;
    setSavingItem(true);
    setError("");

    try {
      const res = await createAdminGuidanceItem({
        title,
        body_markdown: "",
        sort_order: (items.length + 1) * 10,
        is_active: true,
      });
      setCatalog(res || { items: [], forms: [] });
      setSelectedGuidanceId(res?.created_guidance_id || res?.items?.[0]?.guidance_id || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingItem(false);
    }
  }

  async function handleSaveItem() {
    if (!selectedItem) return;

    setSavingItem(true);
    setError("");

    try {
      const res = await updateAdminGuidanceItem(selectedItem.guidance_id, itemDraft);
      setCatalog(res || { items: [], forms: [] });
      setSelectedGuidanceId(selectedItem.guidance_id);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingItem(false);
    }
  }

  function addLinkRow() {
    setLinksDraft((prev) => [
      ...prev,
      {
        form_id: forms[0]?.form_id || "",
        question_name: forms[0]?.questions?.[0]?.question_name || "",
        sort_order: (prev.length + 1) * 10,
      },
    ]);
  }

  function setLinkRow(index, patch) {
    setLinksDraft((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        return { ...row, ...patch };
      })
    );
  }

  function removeLinkRow(index) {
    setLinksDraft((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }

  async function handleSaveLinks() {
    if (!selectedItem) return;

    setSavingLinks(true);
    setError("");

    try {
      const res = await saveAdminGuidanceLinks(selectedItem.guidance_id, linksDraft);
      setCatalog(res || { items: [], forms: [] });
      setSelectedGuidanceId(selectedItem.guidance_id);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingLinks(false);
    }
  }

  async function handleMediaUpload(kind, file, extra = {}) {
    if (!selectedItem || !file) return;

    setMediaBusyKey(`${kind}:upload`);
    setError("");

    try {
      const res = await uploadAdminGuidanceMedia(selectedItem.guidance_id, file, {
        media_kind: kind,
        caption: extra.caption || "",
        is_active: "1",
      });
      setCatalog(res || { items: [], forms: [] });
      setSelectedGuidanceId(selectedItem.guidance_id);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMediaBusyKey("");
      if (videoUploadInputRef.current) videoUploadInputRef.current.value = "";
      if (videoCaptureInputRef.current) videoCaptureInputRef.current.value = "";
      if (imageUploadInputRef.current) imageUploadInputRef.current.value = "";
      if (imageCaptureInputRef.current) imageCaptureInputRef.current.value = "";
    }
  }

  async function handleCreateExternalMedia(kind, draft) {
    if (!selectedItem) return;

    setMediaBusyKey(`${kind}:external`);
    setError("");

    try {
      const res = await createAdminGuidanceExternalMedia(selectedItem.guidance_id, {
        media_kind: kind,
        external_url: draft.url,
        caption: draft.caption,
        is_active: true,
      });
      setCatalog(res || { items: [], forms: [] });
      setSelectedGuidanceId(selectedItem.guidance_id);
      if (kind === "video") setVideoExternalDraft({ url: "", caption: "" });
      else setImageExternalDraft({ url: "", caption: "" });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMediaBusyKey("");
    }
  }

  async function handleActivateMedia(kind, guidanceMediaId) {
    if (!selectedItem || !guidanceMediaId) return;

    setMediaBusyKey(`${kind}:activate:${guidanceMediaId}`);
    setError("");

    try {
      const res = await activateAdminGuidanceMedia(selectedItem.guidance_id, guidanceMediaId);
      setCatalog(res || { items: [], forms: [] });
      setSelectedGuidanceId(selectedItem.guidance_id);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMediaBusyKey("");
    }
  }

  async function handleArchiveMedia(kind, guidanceMediaId) {
    if (!selectedItem || !guidanceMediaId) return;

    setMediaBusyKey(`${kind}:archive:${guidanceMediaId}`);
    setError("");

    try {
      const res = await archiveAdminGuidanceMedia(selectedItem.guidance_id, guidanceMediaId);
      setCatalog(res || { items: [], forms: [] });
      setSelectedGuidanceId(selectedItem.guidance_id);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMediaBusyKey("");
    }
  }

  if (loading) {
    return <div className="muted">laden; uitlegbeheer</div>;
  }

  if (!canManage) {
    return (
      <div className="admin-page">
        <div className="admin-panel">
          <div className="admin-panel-title">Geen toegang</div>
          <div className="admin-panel-subtitle">
            Deze sectie is alleen beschikbaar voor beheerders en uitlegbeheerders.
          </div>
        </div>
      </div>
    );
  }

  const selectedVideoItems = Array.isArray(selectedItem?.media_assets)
    ? selectedItem.media_assets.filter((media) => media.media_kind === "video")
    : [];
  const selectedImageItems = Array.isArray(selectedItem?.media_assets)
    ? selectedItem.media_assets.filter((media) => media.media_kind === "image")
    : [];

  return (
    <div className="admin-page guidance-admin-page">
      <input
        ref={videoUploadInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => handleMediaUpload("video", e.target.files?.[0] || null)}
      />
      <input
        ref={videoCaptureInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(e) => handleMediaUpload("video", e.target.files?.[0] || null)}
      />
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleMediaUpload("image", e.target.files?.[0] || null)}
      />
      <input
        ref={imageCaptureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleMediaUpload("image", e.target.files?.[0] || null)}
      />

      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Uitlegbeheer</h1>
              <div className="ember-page-subtitle">
                Beheer toelichtingen per vraag; met koppelingen, actieve media en historie.
              </div>
            </div>
          </div>

          <div className="ember-toolbar">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCreateItem}
              disabled={savingItem}
            >
              <PlusIcon size={16} className="nav-anim-icon" />
              Nieuwe toelichting
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="ember-label ember-label--danger">{error}</div> : null}

      <div className="admin-grid guidance-admin-grid">
        <div className="admin-panel guidance-admin-list">
          <div className="admin-toolbar">
            <div className="admin-toolbar-title">
              <div className="admin-panel-title">Toelichtingen</div>
              <div className="admin-panel-subtitle">
                Kies een regel; of maak een nieuwe aan.
              </div>
            </div>
          </div>

          <label className="admin-field guidance-search-field">
            <span>Zoeken</span>
            <div className="guidance-search-input">
              <SearchIcon size={16} className="nav-anim-icon" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="titel, formulier of vraag"
              />
            </div>
          </label>

          {visibleItems.length === 0 ? (
            <div className="admin-empty-note">Geen toelichtingen gevonden.</div>
          ) : (
            <div className="admin-check-grid">
              {visibleItems.map((item) => {
                const active = item.guidance_id === selectedGuidanceId;
                return (
                  <button
                    key={item.guidance_id}
                    type="button"
                    className={`admin-compact-row guidance-admin-list-row${active ? " ember-accent-active" : ""}`}
                    onClick={() => setSelectedGuidanceId(item.guidance_id)}
                  >
                    <div className="admin-compact-row-main">
                      <div className="admin-compact-row-title-wrap">
                        <div className="admin-compact-row-title">{item.title}</div>
                        <div className="admin-compact-row-sub">
                          sortering; {item.sort_order ?? 0}
                        </div>
                      </div>
                      <GuidanceItemMeta item={item} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="guidance-admin-detail">
          {!selectedItem ? (
            <div className="admin-panel">
              <div className="admin-empty-note">Selecteer een toelichting om verder te werken.</div>
            </div>
          ) : (
            <>
              <div className="admin-panel">
                <div className="admin-toolbar">
                  <div className="admin-toolbar-title">
                    <div className="admin-panel-title">{selectedItem.title}</div>
                    <div className="admin-panel-subtitle">
                      Runner-knoppen verschijnen automatisch bij gekoppelde vragen.
                    </div>
                  </div>

                  <div className="admin-toolbar-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSaveItem}
                      disabled={savingItem}
                    >
                      <BookTextIcon size={16} className="nav-anim-icon" />
                      Opslaan
                    </button>
                  </div>
                </div>

                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Titel</span>
                    <input
                      value={itemDraft.title}
                      onChange={(e) => setItemDraft((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </label>

                  <label className="admin-field">
                    <span>Sortering</span>
                    <input
                      type="number"
                      value={itemDraft.sort_order}
                      onChange={(e) =>
                        setItemDraft((prev) => ({
                          ...prev,
                          sort_order: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </label>

                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={itemDraft.is_active}
                      onChange={(e) =>
                        setItemDraft((prev) => ({ ...prev, is_active: e.target.checked }))
                      }
                    />
                    <span>Actief in Ember</span>
                  </label>

                  <label className="admin-field guidance-wide-field">
                    <span>Toelichting</span>
                    <textarea
                      rows={8}
                      value={itemDraft.body_markdown}
                      onChange={(e) =>
                        setItemDraft((prev) => ({ ...prev, body_markdown: e.target.value }))
                      }
                      placeholder="Korte uitleg, werkinstructie of context voor de invuller."
                    />
                  </label>
                </div>
              </div>

              <div className="admin-panel">
                <div className="admin-toolbar">
                  <div className="admin-toolbar-title">
                    <div className="admin-panel-title">Koppelingen</div>
                    <div className="admin-panel-subtitle">
                      Koppel deze toelichting aan formulieren en specifieke vragen.
                    </div>
                  </div>

                  <div className="admin-toolbar-actions">
                    <button type="button" className="btn btn-secondary" onClick={addLinkRow}>
                      <PlusIcon size={16} className="nav-anim-icon" />
                      Koppeling toevoegen
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSaveLinks}
                      disabled={savingLinks}
                    >
                      <CircleHelpIcon size={16} className="nav-anim-icon" />
                      Koppelingen opslaan
                    </button>
                  </div>
                </div>

                {linksDraft.length === 0 ? (
                  <div className="admin-empty-note">Nog geen koppelingen ingesteld.</div>
                ) : (
                  <div className="admin-check-grid">
                    {linksDraft.map((row, index) => {
                      const selectedForm = formMap.get(row.form_id) || null;
                      const questionOptions = Array.isArray(selectedForm?.questions)
                        ? selectedForm.questions
                        : [];

                      return (
                        <div key={`${row.form_id || "nieuw"}:${index}`} className="admin-subcard">
                          <div className="admin-form-grid">
                            <label className="admin-field">
                              <span>Formulier</span>
                              <select
                                value={row.form_id}
                                onChange={(e) => {
                                  const nextFormId = e.target.value;
                                  const nextForm = formMap.get(nextFormId) || null;
                                  setLinkRow(index, {
                                    form_id: nextFormId,
                                    question_name: nextForm?.questions?.[0]?.question_name || "",
                                  });
                                }}
                              >
                                <option value="">Kies formulier</option>
                                {forms.map((form) => (
                                  <option key={form.form_id} value={form.form_id}>
                                    {form.code}; {form.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="admin-field">
                              <span>Vraag</span>
                              <select
                                value={row.question_name}
                                onChange={(e) => setLinkRow(index, { question_name: e.target.value })}
                              >
                                <option value="">Kies vraag</option>
                                {questionOptions.map((question) => (
                                  <option key={question.question_name} value={question.question_name}>
                                    {question.title}; {question.question_name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="admin-field">
                              <span>Sortering</span>
                              <input
                                type="number"
                                value={row.sort_order}
                                onChange={(e) =>
                                  setLinkRow(index, { sort_order: Number(e.target.value || 0) })
                                }
                              />
                            </label>

                            <div className="guidance-inline-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => removeLinkRow(index)}
                              >
                                Verwijderen
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="admin-panel">
                <div className="admin-toolbar">
                  <div className="admin-toolbar-title">
                    <div className="admin-panel-title">Media</div>
                    <div className="admin-panel-subtitle">
                      Houd uitleg compact; maximaal 1 actieve video en 1 actieve afbeelding.
                    </div>
                  </div>
                </div>

                <div className="admin-check-grid guidance-media-grid">
                  <MediaHistorySection
                    title="Video"
                    kind="video"
                    mediaItems={selectedVideoItems}
                    historyOpen={videoHistoryOpen}
                    setHistoryOpen={setVideoHistoryOpen}
                    busyKey={mediaBusyKey}
                    onActivate={(guidanceMediaId) => handleActivateMedia("video", guidanceMediaId)}
                    onArchive={(guidanceMediaId) => handleArchiveMedia("video", guidanceMediaId)}
                    onUploadClick={() => videoUploadInputRef.current?.click()}
                    onCaptureClick={() => videoCaptureInputRef.current?.click()}
                    externalDraft={videoExternalDraft}
                    setExternalDraft={setVideoExternalDraft}
                    onExternalCreate={() => handleCreateExternalMedia("video", videoExternalDraft)}
                  />

                  <MediaHistorySection
                    title="Afbeelding"
                    kind="image"
                    mediaItems={selectedImageItems}
                    historyOpen={imageHistoryOpen}
                    setHistoryOpen={setImageHistoryOpen}
                    busyKey={mediaBusyKey}
                    onActivate={(guidanceMediaId) => handleActivateMedia("image", guidanceMediaId)}
                    onArchive={(guidanceMediaId) => handleArchiveMedia("image", guidanceMediaId)}
                    onUploadClick={() => imageUploadInputRef.current?.click()}
                    onCaptureClick={() => imageCaptureInputRef.current?.click()}
                    externalDraft={imageExternalDraft}
                    setExternalDraft={setImageExternalDraft}
                    onExternalCreate={() => handleCreateExternalMedia("image", imageExternalDraft)}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
