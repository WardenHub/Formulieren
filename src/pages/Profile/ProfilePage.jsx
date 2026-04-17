// src/pages/Profile/ProfilePage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getMyProfile,
  putMyProfile,
  uploadMyAvatar,
  deleteMyAvatar,
  uploadMySignature,
  deleteMySignature,
} from "../../api/emberApi.js";

import SaveButton from "@/components/SaveButton.jsx";
import { UploadIcon } from "@/components/ui/upload";
import { DeleteIcon } from "@/components/ui/delete";
import { IdCardIcon } from "@/components/ui/id-card";
import { RefreshCWIcon } from "@/components/ui/refresh-cw";
import ProfileSignaturePadModal from "./ProfileSignaturePadModal.jsx";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function initialsFromProfile(data) {
  return data?.effective?.initials || "E";
}

function statusToneClass(kind) {
  if (kind === "success") return "monitor-tag monitor-tag--success";
  if (kind === "warning") return "monitor-tag monitor-tag--warning";
  if (kind === "active") return "monitor-tag monitor-tag--active";
  return "monitor-tag monitor-tag--neutral";
}

function resolveAvatarImageSrc(data, avatarPreviewUrl) {
  if (avatarPreviewUrl) return avatarPreviewUrl;

  return (
    data?.effective?.avatar_url ||
    data?.effective?.avatar_download_url ||
    data?.effective?.avatar_preview_url ||
    data?.avatar?.download_url ||
    data?.avatar?.preview_url ||
    data?.avatar?.url ||
    data?.avatar?.storage_url ||
    null
  );
}

function resolveSignatureImageSrc(data, signaturePreviewUrl) {
  if (signaturePreviewUrl) return signaturePreviewUrl;

  return (
    data?.effective?.signature_url ||
    data?.effective?.signature_download_url ||
    data?.effective?.signature_preview_url ||
    data?.signature?.download_url ||
    data?.signature?.preview_url ||
    data?.signature?.url ||
    data?.signature?.storage_url ||
    null
  );
}

function dispatchProfileUpdated(payload) {
  window.dispatchEvent(
    new CustomEvent("ember:profile-updated", {
      detail: payload || null,
    })
  );
}

function StatTile({ label, value, tone = "neutral" }) {
  let cls = "monitor-status-tile monitor-status-tile--neutral";
  if (tone === "active") cls = "monitor-status-tile monitor-status-tile--active";
  if (tone === "success") cls = "monitor-status-tile monitor-status-tile--success";
  if (tone === "warning") cls = "monitor-status-tile monitor-status-tile--warning";
  if (tone === "danger") cls = "monitor-status-tile monitor-status-tile--danger";
  if (tone === "muted") cls = "monitor-status-tile monitor-status-tile--muted";

  return (
    <div className={cls}>
      <div className="monitor-status-tile__value">{value ?? 0}</div>
      <div className="monitor-status-tile__label">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const avatarInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState(null);

  const [draft, setDraft] = useState({
    preferred_display_name: "",
    profile_note: "",
    appearance_preference: "system",
    avatar_source_preference: "uploaded",
    signature_source_preference: "uploaded",
  });

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      if (signaturePreviewUrl) URL.revokeObjectURL(signaturePreviewUrl);
    };
  }, [avatarPreviewUrl, signaturePreviewUrl]);

  async function loadProfile() {
    setLoading(true);
    setError(null);

    try {
      const res = await getMyProfile();
      setData(res || null);
      setDraft({
        preferred_display_name: res?.profile?.preferred_display_name || "",
        profile_note: res?.profile?.profile_note || "",
        appearance_preference: res?.profile?.appearance_preference || "system",
        avatar_source_preference: res?.profile?.avatar_source_preference || "uploaded",
        signature_source_preference: res?.profile?.signature_source_preference || "uploaded",
      });

      dispatchProfileUpdated(res || null);
    } catch (e) {
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const isDirty = useMemo(() => {
    if (!data?.profile) return false;

    return (
      (draft.preferred_display_name || "") !== (data.profile.preferred_display_name || "") ||
      (draft.profile_note || "") !== (data.profile.profile_note || "") ||
      (draft.appearance_preference || "system") !== (data.profile.appearance_preference || "system") ||
      (draft.avatar_source_preference || "uploaded") !== (data.profile.avatar_source_preference || "uploaded") ||
      (draft.signature_source_preference || "uploaded") !== (data.profile.signature_source_preference || "uploaded")
    );
  }, [draft, data]);

  useEffect(() => {
    function onKeyDown(e) {
      const key = String(e.key || "").toLowerCase();
      if (!e.altKey || key !== "s") return;

      e.preventDefault();
      if (!saving && isDirty) {
        handleSave();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saving, isDirty, draft, data]);

  async function handleSave() {
    if (!isDirty) return;

    setSaving(true);
    setError(null);

    try {
      const res = await putMyProfile(draft);
      setData(res || null);
      setDraft({
        preferred_display_name: res?.profile?.preferred_display_name || "",
        profile_note: res?.profile?.profile_note || "",
        appearance_preference: res?.profile?.appearance_preference || "system",
        avatar_source_preference: res?.profile?.avatar_source_preference || "uploaded",
        signature_source_preference: res?.profile?.signature_source_preference || "uploaded",
      });

      dispatchProfileUpdated(res || null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarFilePicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(String(file.type || "").toLowerCase())) {
      setError("Alleen PNG, JPEG of WEBP afbeeldingen zijn toegestaan voor profielfoto.");
      e.target.value = "";
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl(nextPreviewUrl);

    setUploadingAvatar(true);
    setError(null);

    try {
      const res = await uploadMyAvatar(file);
      setData(res || null);
      setDraft((prev) => ({
        ...prev,
        avatar_source_preference: res?.profile?.avatar_source_preference || "uploaded",
      }));

      dispatchProfileUpdated(res || null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  async function handleDeleteAvatar() {
    if (!window.confirm("Weet je zeker dat je je profielfoto wilt verwijderen?")) return;

    setUploadingAvatar(true);
    setError(null);

    try {
      const res = await deleteMyAvatar();
      setData(res || null);
      setDraft((prev) => ({
        ...prev,
        avatar_source_preference: res?.profile?.avatar_source_preference || "uploaded",
      }));

      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl(null);

      dispatchProfileUpdated(res || null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSignatureFilePicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(String(file.type || "").toLowerCase())) {
      setError("Alleen PNG, JPEG of WEBP afbeeldingen zijn toegestaan voor handtekeningen.");
      e.target.value = "";
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);

    if (signaturePreviewUrl) {
      URL.revokeObjectURL(signaturePreviewUrl);
    }
    setSignaturePreviewUrl(nextPreviewUrl);

    setUploadingSignature(true);
    setError(null);

    try {
      const res = await uploadMySignature(file);
      setData(res || null);
      setDraft((prev) => ({
        ...prev,
        signature_source_preference: res?.profile?.signature_source_preference || "uploaded",
      }));

      dispatchProfileUpdated(res || null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setUploadingSignature(false);
      e.target.value = "";
    }
  }

  async function handleDeleteSignature() {
    if (!window.confirm("Weet je zeker dat je je handtekening wilt verwijderen?")) return;

    setUploadingSignature(true);
    setError(null);

    try {
      const res = await deleteMySignature();
      setData(res || null);
      setDraft((prev) => ({
        ...prev,
        signature_source_preference: res?.profile?.signature_source_preference || "none",
      }));

      if (signaturePreviewUrl) {
        URL.revokeObjectURL(signaturePreviewUrl);
      }
      setSignaturePreviewUrl(null);

      dispatchProfileUpdated(res || null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setUploadingSignature(false);
    }
  }

  async function handleSaveDrawnSignature(file) {
    const nextPreviewUrl = URL.createObjectURL(file);

    if (signaturePreviewUrl) {
      URL.revokeObjectURL(signaturePreviewUrl);
    }
    setSignaturePreviewUrl(nextPreviewUrl);

    setUploadingSignature(true);
    setError(null);

    try {
      const res = await uploadMySignature(file);
      setData(res || null);
      setDraft((prev) => ({
        ...prev,
        signature_source_preference: res?.profile?.signature_source_preference || "uploaded",
      }));
      setSignaturePadOpen(false);

      dispatchProfileUpdated(res || null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setUploadingSignature(false);
    }
  }

  const profile = data?.profile || null;
  const avatar = data?.avatar || null;
  const signature = data?.signature || null;
  const stats = data?.stats || null;

  const avatarImageSrc = resolveAvatarImageSrc(data, avatarPreviewUrl);
  const signatureImageSrc = resolveSignatureImageSrc(data, signaturePreviewUrl);

  return (
    <div className="profile-page">
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Profiel</h1>
              <div className="muted" style={{ fontSize: 13 }}>
                Persoonlijke instellingen en activiteit
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadProfile}
            >
              <RefreshCWIcon size={18} className="nav-anim-icon" />
              Verversen
            </button>

            <SaveButton
              onClick={handleSave}
              disabled={!isDirty || saving}
              dirty={isDirty}
              saving={saving}
              saved={false}
              label="Opslaan"
            />
          </div>
        </div>
      </div>

      <div className="inst-body profile-grid">
        {error ? <div style={{ color: "salmon" }}>{error}</div> : null}

        {loading ? (
          <div className="muted">laden; profiel</div>
        ) : !profile ? (
          <div className="muted">Profiel niet beschikbaar.</div>
        ) : (
          <>
            <div className="profile-hero card">
              <div className="profile-hero-main">
                <div className="profile-avatar-large">
                  {avatarImageSrc ? (
                    <img
                      src={avatarImageSrc}
                      alt="Profielfoto"
                      className="profile-avatar-image"
                    />
                  ) : (
                    initialsFromProfile(data)
                  )}
                </div>

                <div className="profile-hero-text">
                  <div className="profile-hero-name">
                    {profile.effective_display_name}
                  </div>

                  <div className="muted" style={{ fontSize: 13 }}>
                    {profile.email_snapshot || "-"}
                  </div>

                  <div className="admin-chip-row">
                    <span className={statusToneClass("active")}>
                      Thema {profile.appearance_preference}
                    </span>

                    <span
                      className={statusToneClass(
                        data?.effective?.avatar_mode === "microsoft" ? "warning" : "success"
                      )}
                    >
                      Avatar{" "}
                      {data?.effective?.avatar_mode === "microsoft"
                        ? "Microsoft"
                        : data?.effective?.avatar_uploaded_available
                          ? "Eigen upload"
                          : "Geen upload"}
                    </span>

                    <span className={statusToneClass(data?.effective?.signature_has_any ? "success" : "neutral")}>
                      Handtekening {data?.effective?.signature_has_any ? "Ingesteld" : "Niet ingesteld"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="profile-two-col">
              <div className="card">
                <div className="card-head">
                  <div className="profile-section-title">Persoonlijk</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Kies hoe je in Ember zichtbaar bent
                  </div>
                </div>

                <div className="card-body">
                  <div>
                    <div className="label">Naamvoorkeur</div>
                    <input
                      className="input"
                      value={draft.preferred_display_name}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          preferred_display_name: e.target.value,
                        }))
                      }
                      placeholder={profile.display_name_snapshot || "Voer je gewenste naam in"}
                    />
                  </div>

                  <div>
                    <div className="label">Microsoft naam</div>
                    <input
                      className="input"
                      readOnly
                      value={profile.display_name_snapshot || ""}
                    />
                  </div>

                  <div>
                    <div className="label">E-mail</div>
                    <input
                      className="input"
                      readOnly
                      value={profile.email_snapshot || ""}
                    />
                  </div>

                  <div>
                    <div className="label">Opmerking voor smoelenboek</div>
                    <textarea
                      className="cf-textarea"
                      rows={5}
                      value={draft.profile_note}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          profile_note: e.target.value,
                        }))
                      }
                      placeholder="Korte profieltekst of toelichting"
                    />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="profile-section-title">Weergave</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Persoonlijke themavoorkeur voor Ember
                  </div>
                </div>

                <div className="card-body">
                  <div>
                    <div className="label">Thema</div>
                    <select
                      className="input"
                      value={draft.appearance_preference}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          appearance_preference: e.target.value,
                        }))
                      }
                    >
                      <option value="system">Systeem</option>
                      <option value="dark">Donker</option>
                      <option value="light">Licht</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="profile-two-col">
              <div className="card">
                <div className="card-head">
                  <div className="profile-section-title">Profielfoto</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Eigen foto heeft voorrang; anders gebruiken we Microsoft of een placeholder
                  </div>
                </div>

                <div className="card-body">
                  <div className="profile-media-preview">
                    <div className="profile-avatar-preview">
                      {avatarImageSrc ? (
                        <img
                          src={avatarImageSrc}
                          alt="Profielfoto preview"
                          className="profile-avatar-image"
                        />
                      ) : (
                        initialsFromProfile(data)
                      )}
                    </div>

                    <div className="profile-media-meta">
                      <div style={{ fontWeight: 700 }}>
                        {avatar?.file_name || "Geen eigen profielfoto geüpload"}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Actieve bron; {draft.avatar_source_preference}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="label">Bron voorkeur</div>
                    <select
                      className="input"
                      value={draft.avatar_source_preference}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          avatar_source_preference: e.target.value,
                        }))
                      }
                    >
                      <option value="uploaded">Eigen upload</option>
                      <option value="microsoft">Microsoft-foto</option>
                      <option value="none">Geen foto</option>
                    </select>
                  </div>

                  <div className="profile-action-row">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={handleAvatarFilePicked}
                    />

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={uploadingAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <UploadIcon size={18} className="nav-anim-icon" />
                      Foto uploaden
                    </button>

                    <button
                      type="button"
                      className="btn danger"
                      disabled={uploadingAvatar || !avatar?.has_file}
                      onClick={handleDeleteAvatar}
                    >
                      <DeleteIcon size={18} className="nav-anim-icon" />
                      Foto verwijderen
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="profile-section-title">Handtekening</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Deze handtekening kan later in formulier- en documentflows worden gebruikt
                  </div>
                </div>

                <div className="card-body">
                  <div className="profile-signature-preview">
                    {signatureImageSrc ? (
                      <div className="profile-signature-preview-inner">
                        <img
                          src={signatureImageSrc}
                          alt="Handtekening preview"
                          className="profile-signature-image"
                        />
                      </div>
                    ) : signature?.file_name ? (
                      <div className="profile-signature-preview-inner">
                        {signature.file_name}
                      </div>
                    ) : (
                      <div className="profile-signature-preview-empty">
                        Nog geen handtekening ingesteld
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="label">Bron voorkeur</div>
                    <select
                      className="input"
                      value={draft.signature_source_preference}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          signature_source_preference: e.target.value,
                        }))
                      }
                    >
                      <option value="uploaded">Eigen upload</option>
                      <option value="none">Geen handtekening</option>
                    </select>
                  </div>

                  <div className="profile-action-row">
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={handleSignatureFilePicked}
                    />

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={uploadingSignature}
                      onClick={() => setSignaturePadOpen(true)}
                    >
                      <IdCardIcon size={18} className="nav-anim-icon" />
                      Handtekening zetten
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={uploadingSignature}
                      onClick={() => signatureInputRef.current?.click()}
                    >
                      <UploadIcon size={18} className="nav-anim-icon" />
                      Afbeelding uploaden
                    </button>

                    <button
                      type="button"
                      className="btn danger"
                      disabled={uploadingSignature || !signature?.has_file}
                      onClick={handleDeleteSignature}
                    >
                      <DeleteIcon size={18} className="nav-anim-icon" />
                      Handtekening verwijderen
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div className="profile-section-title">Mijn activiteit</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Aantallen op basis van jouw formulieren en opvolgacties
                </div>
              </div>

              <div className="card-body">
                <div className="profile-stats-title">Formulieren</div>
                <div className="profile-stats-grid">
                  <StatTile label="Totaal" value={stats?.forms?.total ?? 0} tone="neutral" />
                  <StatTile label="Concept" value={stats?.forms?.concept ?? 0} tone="warning" />
                  <StatTile label="Ingediend" value={stats?.forms?.ingediend ?? 0} tone="active" />
                  <StatTile label="In behandeling" value={stats?.forms?.in_behandeling ?? 0} tone="active" />
                  <StatTile label="Definitief" value={stats?.forms?.afgehandeld ?? 0} tone="success" />
                  <StatTile label="Ingetrokken" value={stats?.forms?.ingetrokken ?? 0} tone="danger" />
                </div>

                <div className="profile-stats-title">Opvolgacties</div>
                <div className="profile-stats-grid">
                  <StatTile label="Totaal" value={stats?.follow_ups?.total ?? 0} tone="neutral" />
                  <StatTile label="Open" value={stats?.follow_ups?.open ?? 0} tone="active" />
                  <StatTile label="Wachten op derden" value={stats?.follow_ups?.waiting ?? 0} tone="warning" />
                  <StatTile label="Afgehandeld" value={stats?.follow_ups?.done ?? 0} tone="success" />
                  <StatTile label="Afgewezen" value={stats?.follow_ups?.rejected ?? 0} tone="danger" />
                  <StatTile label="Vervallen" value={stats?.follow_ups?.expired ?? 0} tone="muted" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ProfileSignaturePadModal
        open={signaturePadOpen}
        busy={uploadingSignature}
        onClose={() => setSignaturePadOpen(false)}
        onSave={handleSaveDrawnSignature}
      />
    </div>
  );
}