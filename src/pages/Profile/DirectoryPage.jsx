// src/pages/Profile/DirectoryPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserDirectory } from "../../api/emberApi.js";
import teamsLogo from "../../assets/teams-logo.png";
import ApiStartupLoader, { useApiStartupLoader } from "../../components/ApiStartupLoader.jsx";
import UserAvatar from "../../components/UserAvatar.jsx";
import {
  buildInitials,
  getDirectoryDisplayName,
  resolveDirectoryAvatarPath,
} from "../../lib/avatar.js";

import { ChevronLeftIcon } from "@/components/ui/chevron-left";
import { SearchIcon } from "@/components/ui/search";

const NOTE_MAX = 240;

function truncateNote(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= NOTE_MAX) return text;
  return `${text.slice(0, NOTE_MAX).trim()}...`;
}

export default function DirectoryPage() {
  const navigate = useNavigate();
  const backIconRef = useRef(null);
  const searchIconRef = useRef(null);

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const startupLoader = useApiStartupLoader(loading, {
    loadingCopy: "Het smoelenboek wordt geladen.",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await getUserDirectory();
        if (!cancelled) setItems(Array.isArray(res?.items) ? res.items : []);
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
    const needle = q.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        const displayName = getDirectoryDisplayName(item);
        const email = String(item?.email || "").trim().toLowerCase();
        if (email === "jesse@local") return false;

        if (!needle) return true;

        return [displayName, item?.email, item?.profile_note]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const formDiff =
          Number(b?.stats?.forms_total || 0) - Number(a?.stats?.forms_total || 0);
        if (formDiff !== 0) return formDiff;

        const followDiff =
          Number(b?.stats?.follow_ups_total || 0) -
          Number(a?.stats?.follow_ups_total || 0);
        if (followDiff !== 0) return followDiff;

        return String(getDirectoryDisplayName(a) || "").localeCompare(
          String(getDirectoryDisplayName(b) || ""),
          "nl"
        );
      });
  }, [items, q]);

  return (
    <div className="profile-page">
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <button
              type="button"
              className="icon-btn"
              title="terug naar home"
              onClick={() => navigate("/")}
              onMouseEnter={() => backIconRef.current?.startAnimation?.()}
              onMouseLeave={() => backIconRef.current?.stopAnimation?.()}
            >
              <ChevronLeftIcon ref={backIconRef} size={18} />
            </button>

            <div className="inst-title">
              <h1>Smoelenboek</h1>
              <div className="ember-page-subtitle">
                Collega’s in Ember; gerangschikt op ingevulde formulieren
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="inst-body ui-stack">
        {loading ? <ApiStartupLoader state={startupLoader} inlineLabel="laden; smoelenboek" /> : null}
        {error ? <div className="ember-error-text">{error}</div> : null}

        {!loading && !error ? (
          <>
            <div className="directory-toolbar">
              <div
                className="directory-search-wrap"
                onMouseEnter={() => searchIconRef.current?.startAnimation?.()}
                onMouseLeave={() => searchIconRef.current?.stopAnimation?.()}
              >
                <SearchIcon ref={searchIconRef} size={18} className="nav-anim-icon" />
                <input
                  className="directory-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Zoek op naam, e-mail of profielnotitie"
                />
              </div>

              <div className="ember-page-subtitle">
                {ranked.length} van {items.length} gebruikers
              </div>
            </div>

            {ranked.length === 0 ? (
              <div className="card ui-stack-sm">
                <div className="profile-section-title">Geen gebruikers gevonden</div>
                <div className="ember-page-subtitle">
                  Pas je zoekterm aan om meer resultaten te tonen.
                </div>
              </div>
            ) : (
              <div className="directory-grid">
                {ranked.map((item, index) => {
                  const formsTotal = Number(item?.stats?.forms_total || 0);
                  const followUpsTotal = Number(item?.stats?.follow_ups_total || 0);
                  const followUpsOpen = Number(item?.stats?.follow_ups_open || 0);
                  const note = truncateNote(item?.profile_note);
                  const displayName = getDirectoryDisplayName(item) || "Gebruiker";

                  return (
                    <div
                      key={item.user_object_id || `${item.email}-${index}`}
                      className={`directory-card ${
                        item?.is_current_user ? "directory-card--current" : ""
                      }`}
                    >
                      <div className="ui-row-between">
                        <div className="ui-row">
                          <div className="profile-avatar-preview">
                            <UserAvatar
                              path={resolveDirectoryAvatarPath(item)}
                              fallback={buildInitials(
                                getDirectoryDisplayName(item),
                                item?.email,
                                item?.initials || "E"
                              )}
                              alt={getDirectoryDisplayName(item) || "Profiel"}
                              className="profile-avatar-preview"
                              imageClassName="directory-card-avatar-image"
                            />
                          </div>

                          <div className="ui-stack-sm ui-min-0">
                            <div className="profile-media-title">
                              {displayName}
                            </div>
                            <div className="ember-page-subtitle">
                              {item?.email || "-"}
                            </div>
                          </div>
                        </div>

                        <span className="ember-label ember-label--muted">
                          #{index + 1}
                        </span>
                      </div>

                      {note ? (
                        <div className="ember-page-subtitle">
                          {note}
                        </div>
                      ) : null}

                      <div className="ember-label-row">
                        <span className="ember-label ember-label--success">
                          {formsTotal} formulieren
                        </span>

                        {followUpsTotal > 0 ? (
                          <span className="ember-label ember-label--info">
                            {followUpsTotal} opvolgacties
                          </span>
                        ) : null}

                        {followUpsOpen > 0 ? (
                          <span className="ember-label ember-label--warning">
                            {followUpsOpen} open
                          </span>
                        ) : null}

                        {item?.is_current_user ? (
                          <span className="ember-label ember-label--neutral">
                            Jij
                          </span>
                        ) : null}
                      </div>

                      <div className="ui-row">
                        {item?.teams_chat_url ? (
                          <a
                            className="btn btn-secondary"
                            href={item.teams_chat_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={teamsLogo}
                              alt=""
                              className="directory-card-teams-logo"
                            />
                            Chat in Teams
                          </a>
                        ) : (
                          <span className="ember-page-subtitle">
                            Geen Teams-link beschikbaar
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
