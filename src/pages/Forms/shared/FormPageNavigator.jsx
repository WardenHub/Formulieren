import { useEffect, useMemo, useRef } from "react";

import { PanelLeftOpenIcon } from "@/components/ui/panel-left-open";
import { PanelLeftCloseIcon } from "@/components/ui/panel-left-close";

import { getPageTitle } from "./surveyCore.jsx";

function getPageStatus({ pageIndex, validationSummary, hasValidatedOnce }) {
  const hasBlockingItems = Array.isArray(validationSummary)
    ? validationSummary.some((item) => Number(item?.pageIndex) === Number(pageIndex))
    : false;

  if (hasBlockingItems) {
    return {
      key: "blocking",
      label: "Blokkades",
      compactBg: "rgba(250, 128, 114, 0.22)",
      compactBorder: "rgba(250, 128, 114, 0.55)",
      compactColor: "rgba(255,255,255,0.96)",
      badgeBg: "rgba(250, 128, 114, 0.16)",
      badgeBorder: "rgba(250, 128, 114, 0.45)",
      badgeColor: "salmon",
    };
  }

  if (hasValidatedOnce) {
    return {
      key: "ready",
      label: "Gereed",
      compactBg: "rgba(34, 197, 94, 0.18)",
      compactBorder: "rgba(34, 197, 94, 0.48)",
      compactColor: "rgba(255,255,255,0.96)",
      badgeBg: "rgba(34, 197, 94, 0.14)",
      badgeBorder: "rgba(34, 197, 94, 0.40)",
      badgeColor: "rgba(134, 239, 172, 0.98)",
    };
  }

  return {
    key: "idle",
    label: "Nog niet gecontroleerd",
    compactBg: "rgba(255,255,255,0.03)",
    compactBorder: "rgba(255,255,255,0.10)",
    compactColor: "rgba(255,255,255,0.88)",
    badgeBg: "rgba(255,255,255,0.04)",
    badgeBorder: "rgba(255,255,255,0.10)",
    badgeColor: "rgba(255,255,255,0.78)",
  };
}

export default function FormPageNavigator({
  model,
  currentPageIndex,
  validationSummary,
  hasValidatedOnce,
  bookmarksOpen,
  onToggleBookmarks,
  onNavigateToPage,
}) {
  const rootRef = useRef(null);

  const pages = useMemo(() => {
    return Array.isArray(model?.visiblePages) ? model.visiblePages : [];
  }, [model]);

  const navItems = useMemo(() => {
    return pages.map((page, index) => ({
      index,
      title: getPageTitle(page, index),
      status: getPageStatus({
        pageIndex: index,
        validationSummary,
        hasValidatedOnce,
      }),
    }));
  }, [pages, validationSummary, hasValidatedOnce]);

  useEffect(() => {
    if (!bookmarksOpen) return;

    function onPointerDown(e) {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target)) return;
      onToggleBookmarks?.(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        onToggleBookmarks?.(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [bookmarksOpen, onToggleBookmarks]);

  if (!pages.length) return null;

  return (
    <div
      ref={rootRef}
      className="ember-page-nav-shell"
      style={{
        position: "sticky",
        top: "var(--ember-form-nav-top, 56px)",
        zIndex: 35,
      }}
    >
      <div
        className="card ember-page-nav-compact"
        style={{
          padding: 12,
          display: "grid",
          gap: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            gap: 10,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="icon-btn"
            onClick={() => onToggleBookmarks?.(!bookmarksOpen)}
            title={bookmarksOpen ? "Bladwijzerlijst inklappen" : "Bladwijzerlijst uitklappen"}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: bookmarksOpen
                ? "1px solid rgba(249, 115, 22, 0.45)"
                : "1px solid rgba(255,255,255,0.10)",
              background: bookmarksOpen
                ? "rgba(249, 115, 22, 0.10)"
                : "rgba(255,255,255,0.04)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            {bookmarksOpen ? <PanelLeftCloseIcon size={18} /> : <PanelLeftOpenIcon size={18} />}
          </button>

          <div
            className="ember-form-page-nav-strip"
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            {navItems.map((item) => {
              const isActive = item.index === currentPageIndex;

              return (
                <button
                  key={item.index}
                  type="button"
                  onClick={() => onNavigateToPage(item.index)}
                  title={item.title}
                  style={{
                    minWidth: isActive ? 46 : 40,
                    height: isActive ? 46 : 40,
                    borderRadius: 12,
                    border: `1px solid ${item.status.compactBorder}`,
                    background: item.status.compactBg,
                    color: item.status.compactColor,
                    fontWeight: isActive ? 900 : 800,
                    fontSize: isActive ? 15 : 14,
                    boxShadow: isActive ? "0 0 0 2px rgba(249, 115, 22, 0.28) inset" : "none",
                    transform: isActive ? "translateY(-1px)" : "none",
                    transition: "all 0.18s ease",
                    flex: "0 0 auto",
                    cursor: "pointer",
                  }}
                >
                  {item.index + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {bookmarksOpen && (
        <div
          className="card ember-page-nav-bookmarks"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            padding: 12,
            display: "grid",
            gap: 8,
            maxHeight: "min(60vh, 520px)",
            overflow: "auto",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 18px 46px rgba(0,0,0,0.42)",
            backdropFilter: "blur(10px)",
          }}
        >
          {navItems.map((item) => {
            const isActive = item.index === currentPageIndex;

            return (
              <button
                key={`bookmark-${item.index}`}
                type="button"
                onClick={() => onNavigateToPage(item.index)}
                className="btn btn-secondary"
                style={{
                  justifyContent: "space-between",
                  gap: 12,
                  textAlign: "left",
                  whiteSpace: "normal",
                  border: isActive
                    ? "1px solid rgba(249, 115, 22, 0.45)"
                    : "1px solid rgba(255,255,255,0.08)",
                  background: isActive ? "rgba(249, 115, 22, 0.08)" : "rgba(255,255,255,0.02)",
                }}
                title={item.title}
              >
                <span
                  style={{
                    display: "grid",
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.06)",
                        fontSize: 12,
                        fontWeight: 900,
                        flex: "0 0 auto",
                      }}
                    >
                      {item.index + 1}
                    </span>

                    <span style={{ fontWeight: isActive ? 900 : 700 }}>
                      {item.title}
                    </span>
                  </span>
                </span>

                <span
                  style={{
                    flex: "0 0 auto",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: item.status.badgeBg,
                    border: `1px solid ${item.status.badgeBorder}`,
                    color: item.status.badgeColor,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {item.status.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}