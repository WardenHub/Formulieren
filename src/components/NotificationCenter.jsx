import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from "../api/emberApi.js";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";
import { MessageCircleMoreIcon } from "@/components/ui/message-circle-more";
import {
  BellRing,
  HandHelping,
  MessageCircleMore,
  TriangleAlert,
} from "lucide-react";

function formatNotificationStamp(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildActorInitials(item) {
  const source = String(
    item?.actor?.display_name_snapshot ||
      item?.actor?.email_snapshot ||
      item?.summary_text ||
      "E"
  ).trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function getNotificationKindMeta(kind) {
  if (kind === "mention") {
    return {
      label: "Vermelding",
      toneClass: "monitor-tag monitor-tag--active",
      cardClass: "monitor-surface monitor-surface--active",
      Icon: MessageCircleMore,
    };
  }
  if (kind === "reaction") {
    return {
      label: "Reactie",
      toneClass: "monitor-tag monitor-tag--warning",
      cardClass: "monitor-surface monitor-surface--warning",
      Icon: HandHelping,
    };
  }
  if (kind === "workflow") {
    return {
      label: "Toegewezen",
      toneClass: "monitor-tag monitor-tag--success",
      cardClass: "monitor-surface monitor-surface--success",
      Icon: TriangleAlert,
    };
  }

  return {
    label: "Notificatie",
    toneClass: "monitor-tag monitor-tag--muted",
    cardClass: "monitor-surface monitor-surface--neutral",
    Icon: BellRing,
  };
}

export default function NotificationCenter({ refreshToken = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const buttonIconRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyMarkAll, setBusyMarkAll] = useState(false);
  const [busyIds, setBusyIds] = useState({});
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [payload, setPayload] = useState({
    summary: { total_count: 0, unread_count: 0 },
    items: [],
  });

  const refreshKey = useMemo(
    () => `${location.pathname}|${location.search}|${refreshToken}|${unreadOnly ? "1" : "0"}`,
    [location.pathname, location.search, refreshToken, unreadOnly]
  );

  async function loadNotifications() {
    setLoading(true);
    try {
      const next = await getMyNotifications({
        take: 24,
        unread: unreadOnly ? 1 : 0,
      });
      setPayload(
        next || {
          summary: { total_count: 0, unread_count: 0 },
          items: [],
        }
      );
    } catch (err) {
      console.error("notifications fetch failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, [refreshKey]);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target)) return;
      setOpen(false);
    }

    function onWindowFocus() {
      loadNotifications();
    }

    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [unreadOnly]);

  async function handleItemOpen(item) {
    const notificationEventId = String(item?.notification_event_id || "").trim();
    if (!notificationEventId) return;

    if (item?.is_unread) {
      setBusyIds((prev) => ({ ...prev, [notificationEventId]: true }));
      try {
        await markMyNotificationRead(notificationEventId);
        setPayload((prev) => ({
          ...prev,
          summary: {
            ...prev.summary,
            unread_count: Math.max(0, Number(prev.summary?.unread_count || 0) - 1),
          },
          items: (prev.items || []).map((entry) =>
            entry.notification_event_id === notificationEventId
              ? { ...entry, is_unread: false, read_at: new Date().toISOString() }
              : entry
          ),
        }));
      } catch (err) {
        console.error("notification read failed", err);
      } finally {
        setBusyIds((prev) => ({ ...prev, [notificationEventId]: false }));
      }
    }

    if (item?.href) {
      setOpen(false);
      navigate(item.href);
    }
  }

  async function handleMarkAllRead() {
    setBusyMarkAll(true);
    try {
      const next = await markAllMyNotificationsRead();
      setPayload((prev) => ({
        ...prev,
        summary: next?.summary || { total_count: prev.summary?.total_count || 0, unread_count: 0 },
        items: (prev.items || []).map((item) => ({
          ...item,
          is_unread: false,
          read_at: item.read_at || new Date().toISOString(),
        })),
      }));
    } catch (err) {
      console.error("mark all notifications read failed", err);
    } finally {
      setBusyMarkAll(false);
    }
  }

  const unreadCount = Number(payload?.summary?.unread_count || 0);

  return (
    <div className="notification-wrap" ref={menuRef}>
      <button
        type="button"
        className="icon-btn topbar-notification-btn"
        aria-label="notificaties"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onMouseEnter={() => buttonIconRef.current?.startAnimation?.()}
        onMouseLeave={() => buttonIconRef.current?.stopAnimation?.()}
      >
        <BadgeAlertIcon ref={buttonIconRef} size={19} className="nav-anim-icon" />
        {unreadCount > 0 ? <span className="topbar-notification-count">{unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="notification-menu" role="dialog" aria-label="Notificaties">
          <div className="notification-menu-header">
            <div>
              <div className="notification-menu-title">Notificaties</div>
              <div className="ember-page-subtitle">
                {unreadCount > 0
                  ? `${unreadCount} ongelezen item${unreadCount === 1 ? "" : "s"}`
                  : "Alles is bijgewerkt"}
              </div>
            </div>

            <div className="notification-menu-actions">
              <button
                type="button"
                className={`btn btn-compact ${unreadOnly ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setUnreadOnly((prev) => !prev)}
              >
                {unreadOnly ? "Alles" : "Ongelezen"}
              </button>

              <button
                type="button"
                className="btn btn-compact"
                disabled={busyMarkAll || unreadCount === 0}
                onClick={handleMarkAllRead}
              >
                Alles gelezen
              </button>
            </div>
          </div>

          <div className="notification-menu-body">
            {loading ? (
              <div className="ui-empty">Notificaties laden;</div>
            ) : !payload?.items?.length ? (
              <div className="ui-empty notification-empty">
                <MessageCircleMoreIcon size={28} className="notification-empty-icon" />
                <div>
                  <div className="notification-empty-title">Geen notificaties</div>
                  <div className="ember-page-subtitle">
                    Nieuwe vermeldingen, reacties en toewijzingen verschijnen hier.
                  </div>
                </div>
              </div>
            ) : (
              <div className="notification-list">
                {(payload.items || []).map((item) => {
                  const notificationEventId = String(item?.notification_event_id || "");
                  const busy = !!busyIds[notificationEventId];
                  const kindMeta = getNotificationKindMeta(item?.kind);
                  const KindIcon = kindMeta.Icon;

                  return (
                    <div
                      key={notificationEventId}
                      className={`notification-item ${kindMeta.cardClass}${item?.is_unread ? " is-unread" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleItemOpen(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleItemOpen(item);
                        }
                      }}
                    >
                      <div className="notification-item-avatar">
                        {buildActorInitials(item)}
                      </div>

                      <div className="notification-item-main">
                        <div className="notification-item-top">
                          <div className="notification-item-kind">
                            <span className={kindMeta.toneClass}>
                              <span className="notification-item-kind__content">
                                <KindIcon size={14} />
                                {kindMeta.label}
                              </span>
                            </span>
                          </div>
                          <span className="notification-item-time">
                            {formatNotificationStamp(item?.created_at)}
                          </span>
                        </div>

                        <div className="notification-item-summary">{item?.summary_text || "-"}</div>

                        <div className="notification-item-meta">
                          {item?.actor?.display_name_snapshot || item?.actor?.email_snapshot || "Ember"}
                        </div>
                      </div>

                      <div className="notification-item-side">
                        {item?.is_unread ? <span className="notification-item-dot" /> : null}
                        <button
                          type="button"
                          className="btn btn-compact"
                          disabled={busy || !item?.is_unread}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleItemOpen({
                              ...item,
                              href: null,
                            });
                          }}
                        >
                          Gelezen
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
