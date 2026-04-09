// /src/pages/Home.jsx

import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { httpJson } from "../api/http";
import { getHomeNews } from "../api/emberApi.js";
import { getRecentHomeItems } from "../lib/recentHomeItems.js";

import { SearchIcon } from "@/components/ui/search";
import { MonitorCheckIcon } from "@/components/ui/monitor-check";
import { BrainIcon } from "@/components/ui/brain";
import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { FileCheckIcon } from "@/components/ui/file-check";

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-NL");
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function scheduleAfterFirstPaint(fn) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(fn, 250);
  return () => window.clearTimeout(id);
}

function newsImageSrc(rawUrl) {
  if (!rawUrl) return "";
  return `/home/news/image?url=${encodeURIComponent(rawUrl)}`;
}

function AnimatedHomeCard({ to, Icon, title, text }) {
  const iconRef = useRef(null);
  const arrowRef = useRef(null);

  return (
    <Link
      to={to}
      className="home-card home-card--interactive"
      onMouseEnter={() => {
        iconRef.current?.startAnimation?.();
        arrowRef.current?.startAnimation?.();
      }}
      onMouseLeave={() => {
        iconRef.current?.stopAnimation?.();
        arrowRef.current?.stopAnimation?.();
      }}
    >
      <div className="home-card-head">
        <div className="home-card-icon-wrap">
          <Icon ref={iconRef} size={18} className="nav-anim-icon" />
        </div>

        <div className="home-card-title-wrap">
          <div className="home-card-title">{title}</div>
        </div>

        <div className="home-card-arrow">
          <ArrowBigRightIcon ref={arrowRef} size={18} className="nav-anim-icon" />
        </div>
      </div>

      <div className="home-card-text muted">{text}</div>
    </Link>
  );
}

function RecentItemIcon({ kind }) {
  if (kind === "installation") return <SearchIcon size={16} className="nav-anim-icon" />;
  if (kind === "monitor") return <MonitorCheckIcon size={16} className="nav-anim-icon" />;
  return <FileCheckIcon size={16} className="nav-anim-icon" />;
}

function RecentKindTag({ kind }) {
  let cls = "home-recent-kind-tag";
  let label = "Item";

  if (kind === "installation") {
    cls += " home-recent-kind-tag--installation";
    label = "Installatie";
  } else if (kind === "monitor") {
    cls += " home-recent-kind-tag--monitor";
    label = "Monitor";
  } else if (kind === "form") {
    cls += " home-recent-kind-tag--form";
    label = "Formulier";
  }

  return <span className={cls}>{label}</span>;
}

export default function Home() {
  const [roles, setRoles] = useState([]);
  const [news, setNews] = useState([]);
  const [newsState, setNewsState] = useState("idle");
  const [recentItems, setRecentItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const data = await httpJson("/me");
        if (!cancelled) setRoles(data.roles ?? []);
      } catch {
        if (!cancelled) setRoles([]);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const cancelScheduled = scheduleAfterFirstPaint(async () => {
      if (cancelled) return;

      setNewsState("loading");

      try {
        const data = await getHomeNews();
        if (cancelled) return;

        setNews(Array.isArray(data?.items) ? data.items : []);
        setNewsState("ready");
      } catch {
        if (cancelled) return;
        setNews([]);
        setNewsState("error");
      }
    });

    return () => {
      cancelled = true;
      cancelScheduled?.();
    };
  }, []);

  useEffect(() => {
    function refreshRecent() {
      setRecentItems(getRecentHomeItems());
    }

    refreshRecent();
    window.addEventListener("focus", refreshRecent);
    window.addEventListener("storage", refreshRecent);

    return () => {
      window.removeEventListener("focus", refreshRecent);
      window.removeEventListener("storage", refreshRecent);
    };
  }, []);

  const visibleRecent = useMemo(() => recentItems.slice(0, 6), [recentItems]);

  return (
    <div className="home">
      <div className="home-layout">
        <div className="home-main">
          <div className="home-hero">
            <h1 className="home-title">Ember</h1>
            <p className="home-subtitle muted">Kies wat je wilt doen:</p>
          </div>

          <div className="home-grid">
            <AnimatedHomeCard
              to="/installaties"
              Icon={SearchIcon}
              title="Installatiegegevens"
              text="Zoek en bekijk installatie-informatie, maak en vul formulieren voor installaties."
            />

            <AnimatedHomeCard
              to="/monitor/formulieren"
              Icon={MonitorCheckIcon}
              title="Monitor"
              text="Bekijk en verwerk formulieren."
            />

            {roles.includes("admin") && (
              <AnimatedHomeCard
                to="/admin"
                Icon={BrainIcon}
                title="Beheer"
                text="Beheer formulieren en configuratie."
              />
            )}
          </div>

          <div className="home-recent-card">
            <div className="home-recent-head">
              <div className="home-recent-title">Recent bekeken</div>
            </div>

            {visibleRecent.length === 0 ? (
              <div className="home-recent-empty muted">
                Recent geopende installaties, formulieren en monitoritems verschijnen hier.
              </div>
            ) : (
              <div className="home-recent-list">
                {visibleRecent.map((item) => (
                  <Link
                    key={`${item.kind}-${item.key}`}
                    to={item.to}
                    className="home-recent-item"
                  >
                    <div className="home-recent-item-icon">
                      <RecentItemIcon kind={item.kind} />
                    </div>

                    <div className="home-recent-item-main">
                      <div className="home-recent-item-title-row">
                        <div className="home-recent-item-title">{item.title}</div>
                        <RecentKindTag kind={item.kind} />
                      </div>

                      {!!item.subtitle && (
                        <div className="home-recent-item-sub muted">{item.subtitle}</div>
                      )}
                    </div>

                    <div className="home-recent-item-side muted">
                      <div className="home-recent-item-time">
                        {formatDateTime(item.visited_at)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="home-news" aria-label="Nieuws">
          <div className="home-news-card">
            <div className="home-news-title">Nieuws</div>

            <div className="home-news-list">
              {newsState === "loading" && (
                <div className="home-news-placeholder muted">
                  Recente berichten laden...
                </div>
              )}

              {newsState !== "loading" && news.length === 0 && (
                <div className="home-news-placeholder muted">
                  Geen recente berichten beschikbaar.
                </div>
              )}

              {news.map((item, idx) => (
                <a
                  key={`${item.link}-${idx}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="home-news-item"
                >
                  <div className="home-news-item-row">
                    <div className="home-news-thumb-wrap">
                      {item.image_url ? (
                        <img
                          src={newsImageSrc(item.image_url)}
                          alt=""
                          className="home-news-thumb"
                        />
                      ) : (
                        <div className="home-news-thumb-fallback" />
                      )}
                    </div>

                    <div className="home-news-item-body">
                      <div className="home-news-item-title">{item.title}</div>

                      {!!item.date && (
                        <div className="home-news-item-date muted">
                          {formatDate(item.date)}
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}