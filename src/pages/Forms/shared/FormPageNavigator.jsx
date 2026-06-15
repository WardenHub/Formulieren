//src/pages/Forms/shared/FormPageNavigator.jsx

import { useEffect, useMemo, useRef, useState } from "react";

import { FolderMinusIcon } from "@/components/ui/folder-minus";
import { FolderPlusIcon } from "@/components/ui/folder-plus";
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

function formatValidationTitle(item) {
  const pageTitle = String(item?.pageTitle || "").trim();
  const questionTitle = String(item?.questionTitle || "").trim();
  const message = String(item?.message || "").trim();

  return [pageTitle, questionTitle, message].filter(Boolean).join(" ; ");
}

export default function FormPageNavigator({
  model,
  currentPageIndex,
  validationSummary,
  hasValidatedOnce,
  bookmarksOpen,
  validationOpen,
  onToggleBookmarks,
  onToggleValidation,
  onNavigateToPage,
  onOpenValidationItem,
}) {
  const rootRef = useRef(null);
  const bookmarksIconRef = useRef(null);
  const validationIconRef = useRef(null);
  const previousValidationCountRef = useRef(null);
  const validationFeedbackTimerRef = useRef(null);

  const [validationFeedback, setValidationFeedback] = useState(null);

  const pages = useMemo(() => {
    return Array.isArray(model?.visiblePages) ? model.visiblePages : [];
  }, [model]);

  const validationItems = useMemo(() => {
    return Array.isArray(validationSummary) ? validationSummary : [];
  }, [validationSummary]);

  const hasValidationItems = validationItems.length > 0;
  const hasValidationControl = hasValidationItems || Boolean(validationFeedback);

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
    const nextCount = validationItems.length;
    const previousCount = previousValidationCountRef.current;

    previousValidationCountRef.current = nextCount;

    if (previousCount === null) return undefined;
    if (previousCount === nextCount) return undefined;

    const delta = nextCount - previousCount;
    if (delta === 0) return undefined;

    if (validationFeedbackTimerRef.current) {
      window.clearTimeout(validationFeedbackTimerRef.current);
      validationFeedbackTimerRef.current = null;
    }

    if (!validationOpen) {
      setValidationFeedback({
        delta,
        key: `${Date.now()}-${nextCount}`,
      });

      validationIconRef.current?.startAnimation?.();

      validationFeedbackTimerRef.current = window.setTimeout(() => {
        validationIconRef.current?.stopAnimation?.();
        setValidationFeedback(null);
        validationFeedbackTimerRef.current = null;
      }, 2200);
    } else {
      setValidationFeedback(null);
      validationIconRef.current?.stopAnimation?.();
    }

    return undefined;
  }, [validationItems.length, validationOpen]);

  useEffect(() => {
    return () => {
      if (validationFeedbackTimerRef.current) {
        window.clearTimeout(validationFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!bookmarksOpen) return undefined;

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
        <div
          className={`ember-page-nav-grid ${
            hasValidationControl ? "ember-page-nav-grid--with-validation" : ""
          }`}
        >
          {hasValidationItems ? (
            <button
              type="button"
              className={`icon-btn ember-page-nav-toggle ember-page-nav-validation-toggle ${
                validationOpen ? "ember-page-nav-toggle--open" : ""
              } ${validationFeedback ? "ember-page-nav-validation-toggle--pulse" : ""}`}
              onClick={() => {
                const nextOpen = !validationOpen;
                onToggleValidation?.(nextOpen);
                if (nextOpen) onToggleBookmarks?.(false);
                setValidationFeedback(null);
              }}
              title={validationOpen ? "Controlelijst inklappen" : "Controlelijst uitklappen"}
              onMouseEnter={() => validationIconRef.current?.startAnimation?.()}
              onMouseLeave={() => validationIconRef.current?.stopAnimation?.()}
              aria-label={validationOpen ? "Controlelijst inklappen" : "Controlelijst uitklappen"}
            >
              <span className="ember-page-nav-validation-toggle-inner">
                {validationOpen ? (
                  <FolderMinusIcon ref={validationIconRef} size={18} />
                ) : (
                  <FolderPlusIcon ref={validationIconRef} size={18} />
                )}

                <span
                  key={validationFeedback?.key || `count-${validationItems.length}`}
                  className={`ember-page-nav-validation-mini-badge ${
                    validationFeedback?.delta < 0
                      ? "ember-page-nav-validation-mini-badge--minus"
                      : validationFeedback?.delta > 0
                        ? "ember-page-nav-validation-mini-badge--plus"
                        : ""
                  }`}
                >
                  {validationFeedback
                    ? `${validationFeedback.delta > 0 ? "+" : ""}${validationFeedback.delta}`
                    : validationItems.length}
                </span>
              </span>
            </button>
          ) : validationFeedback ? (
            <span
              key={validationFeedback.key}
              className={`ember-page-nav-validation-feedback-pill ${
                validationFeedback.delta < 0
                  ? "ember-page-nav-validation-feedback-pill--minus"
                  : "ember-page-nav-validation-feedback-pill--plus"
              }`}
              title="Controlelijst bijgewerkt"
            >
              {validationFeedback.delta > 0 ? "+" : ""}
              {validationFeedback.delta}
            </span>
          ) : null}

          <button
            type="button"
            className={`icon-btn ember-page-nav-toggle ${
              bookmarksOpen ? "ember-page-nav-toggle--open" : ""
            }`}
            onClick={() => {
              const nextOpen = !bookmarksOpen;
              onToggleBookmarks?.(nextOpen);
              if (nextOpen) onToggleValidation?.(false);
            }}
            title={bookmarksOpen ? "Bladwijzerlijst inklappen" : "Bladwijzerlijst uitklappen"}
            onMouseEnter={() => bookmarksIconRef.current?.startAnimation?.()}
            onMouseLeave={() => bookmarksIconRef.current?.stopAnimation?.()}
            aria-label={bookmarksOpen ? "Bladwijzerlijst inklappen" : "Bladwijzerlijst uitklappen"}
          >
            {bookmarksOpen ? (
              <PanelLeftCloseIcon ref={bookmarksIconRef} size={18} />
            ) : (
              <PanelLeftOpenIcon ref={bookmarksIconRef} size={18} />
            )}
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

      {validationOpen && hasValidationItems ? (
        <div className="card ember-page-nav-validation">
          <div className="ember-page-nav-validation-head">
            <div>
              <div className="ember-page-nav-validation-title">
                Controleer eerst de volgende velden
              </div>
              <div className="muted ember-page-nav-validation-subtitle">
                Klik op een regel om naar het betreffende onderdeel te gaan.
              </div>
            </div>

            <span className="ember-page-nav-badge ember-page-nav-badge--blocking">
              {validationItems.length}
            </span>
          </div>

          <div className="ember-page-nav-validation-list">
            {validationItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ember-page-nav-validation-row"
                onClick={() => onOpenValidationItem?.(item)}
                title={formatValidationTitle(item)}
              >
                <span className="ember-page-nav-validation-row-main">
                  <span className="ember-page-nav-validation-row-title">
                    {item.pageTitle}
                    {" ; "}
                    {item.questionTitle}
                  </span>
                  <span className="ember-page-nav-validation-row-message">
                    {item.message}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
