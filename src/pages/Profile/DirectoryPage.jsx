//src/pages/Profile/DirectoryPage.jsx

import { useEffect, useMemo, useState } from "react";
import { getUserDirectory } from "../../api/emberApi.js";
import { fetchProtectedObjectUrl } from "../../api/http.js";
import teamsLogo from "../../assets/teams-logo.png";

function DirectoryAvatar({ item }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let nextUrl = null;

    async function load() {
      const path = item?.avatar?.url;
      if (!path) {
        setSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }

      try {
        nextUrl = await fetchProtectedObjectUrl(path);
        if (cancelled) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }

        setSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      } catch (err) {
        console.error("directory avatar load failed", err);
        if (!cancelled) {
          setSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [item?.avatar?.url]);

  if (src) {
    return (
      <img
        src={src}
        alt={item?.effective_display_name || "Profiel"}
        className="directory-card-avatar-image"
      />
    );
  }

  return (
    <div className="directory-card-avatar-fallback">
      {item?.initials || "E"}
    </div>
  );
}

export default function DirectoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await getUserDirectory();
        if (!cancelled) {
          setItems(Array.isArray(res?.items) ? res.items : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || String(err));
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ranked = useMemo(() => {
    return [...items].sort((a, b) => {
      const formDiff = Number(b?.stats?.forms_total || 0) - Number(a?.stats?.forms_total || 0);
      if (formDiff !== 0) return formDiff;

      const followDiff =
        Number(b?.stats?.follow_ups_total || 0) - Number(a?.stats?.follow_ups_total || 0);
      if (followDiff !== 0) return followDiff;

      return String(a?.effective_display_name || "").localeCompare(
        String(b?.effective_display_name || ""),
        "nl"
      );
    });
  }, [items]);

  return (
    <div className="profile-page">
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Smoelenboek</h1>
              <div className="muted" style={{ fontSize: 13 }}>
                Collega’s in Ember; gerangschikt op ingevulde formulieren
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="inst-body">
        {loading ? <div className="muted">laden; smoelenboek</div> : null}
        {error ? <div style={{ color: "salmon" }}>{error}</div> : null}

        {!loading && !error ? (
          <div className="directory-grid">
            {ranked.map((item, index) => {
              const formsTotal = Number(item?.stats?.forms_total || 0);
              const followUpsTotal = Number(item?.stats?.follow_ups_total || 0);
              const followUpsOpen = Number(item?.stats?.follow_ups_open || 0);

              return (
                <div
                  key={item.user_object_id || `${item.email}-${index}`}
                  className={`directory-card ${item?.is_current_user ? "directory-card--current" : ""}`}
                >
                  <div className="directory-card-rank">
                    #{index + 1}
                  </div>

                  <div className="directory-card-header">
                    <div className="directory-card-avatar">
                      <DirectoryAvatar item={item} />
                    </div>

                    <div className="directory-card-headtext">
                      <div className="directory-card-name">
                        {item?.effective_display_name || "Gebruiker"}
                      </div>

                      <div className="directory-card-email">
                        {item?.email || "-"}
                      </div>
                    </div>
                  </div>

                  {item?.profile_note ? (
                    <div className="directory-card-note">
                      {item.profile_note}
                    </div>
                  ) : (
                    <div className="directory-card-note directory-card-note--empty">
                      Geen opmerking toegevoegd
                    </div>
                  )}

                  <div className="directory-card-badges">
                    <span className="monitor-tag monitor-tag--success">
                      {formsTotal} formulieren
                    </span>

                    {followUpsTotal > 0 ? (
                      <span className="monitor-tag monitor-tag--active">
                        {followUpsTotal} opvolgacties
                      </span>
                    ) : null}

                    {followUpsOpen > 0 ? (
                      <span className="monitor-tag monitor-tag--warning">
                        {followUpsOpen} open
                      </span>
                    ) : null}

                    {item?.is_current_user ? (
                      <span className="monitor-tag monitor-tag--neutral">
                        Jij
                      </span>
                    ) : null}
                  </div>

                  <div className="directory-card-actions">
                    {item?.teams_chat_url ? (
                      <a
                        className="btn btn-secondary directory-card-teams-btn"
                        href={item.teams_chat_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={teamsLogo}
                          alt="Teams"
                          className="directory-card-teams-logo"
                        />
                        Chat in Teams
                      </a>
                    ) : (
                      <span className="muted" style={{ fontSize: 13 }}>
                        Geen Teams-link beschikbaar
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}