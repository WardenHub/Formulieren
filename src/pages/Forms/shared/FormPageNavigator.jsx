//src/pages/Forms/shared/FormPageNavigator.jsx

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
      className: "ember-page-nav-item--blocking",
      badgeClassName: "ember-page-nav-badge--blocking",
    };
  }

  if (hasValidatedOnce) {
    return {
      key: "ready",
      label: "Gereed",
      className: "ember-page-nav-item--ready",
      badgeClassName: "ember-page-nav-badge--ready",
    };
  }

  return {
    key: "idle",
    label: "Nog niet gecontroleerd",
    className: "ember-page-nav-item--idle",
    badgeClassName: "ember-page-nav-badge--idle",
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
    <div ref={rootRef} className="ember-page-nav-shell">
      <div className="card ember-page-nav-compact">
        <div className="ember-page-nav-grid">
          <button
            type="button"
            className={`icon-btn ember-page-nav-toggle ${
              bookmarksOpen ? "ember-page-nav-toggle--open" : ""
            }`}
            onClick={() => onToggleBookmarks?.(!bookmarksOpen)}
            title={bookmarksOpen ? "Bladwijzerlijst inklappen" : "Bladwijzerlijst uitklappen"}
          >
            {bookmarksOpen ? <PanelLeftCloseIcon size={18} /> : <PanelLeftOpenIcon size={18} />}
          </button>

          <div className="ember-form-page-nav-strip">
            {navItems.map((item) => {
              const isActive = item.index === currentPageIndex;

              return (
                <button
                  key={item.index}
                  type="button"
                  onClick={() => onNavigateToPage(item.index)}
                  title={item.title}
                  className={[
                    "ember-page-nav-item",
                    item.status.className,
                    isActive ? "ember-page-nav-item--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {item.index + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {bookmarksOpen && (
        <div className="card ember-page-nav-bookmarks">
          {navItems.map((item) => {
            const isActive = item.index === currentPageIndex;

            return (
              <button
                key={`bookmark-${item.index}`}
                type="button"
                onClick={() => onNavigateToPage(item.index)}
                className={`ember-page-nav-bookmark-row ${
                  isActive ? "ember-page-nav-bookmark-row--active" : ""
                }`}
                title={item.title}
              >
                <span className="ember-page-nav-bookmark-title-wrap">
                  <span className="ember-page-nav-bookmark-index">{item.index + 1}</span>
                  <span className="ember-page-nav-bookmark-title">{item.title}</span>
                </span>

                <span
                  className={[
                    "ember-page-nav-badge",
                    item.status.badgeClassName,
                  ]
                    .filter(Boolean)
                    .join(" ")}
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