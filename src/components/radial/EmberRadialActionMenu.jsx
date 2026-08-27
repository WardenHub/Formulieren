import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, MenuItem } from "@spaceymonk/react-radial-menu";
import { ArrowLeft, Ellipsis, X } from "lucide-react";

import {
  ROOT_MENU_ID,
  actionsForMenu,
  clampRadialMenuCenter,
  findParentMenuId,
  menuMetrics,
  prepareRootActions,
  splitRadialLabel,
} from "./radialActionMenuModel.js";

function useBoundarySize(boundaryElement, open) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!open || !boundaryElement) return undefined;

    const measure = () => {
      setSize({
        width: boundaryElement.clientWidth,
        height: boundaryElement.clientHeight,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(boundaryElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [boundaryElement, open]);

  return size;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  ));

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

function actionHasSubmenu(action) {
  return Array.isArray(action?.children)
    && action.children.filter((child) => child?.id && child.permission !== false).length >= 2;
}

function ActionContent({ action, compact }) {
  const Icon = action.icon || (action.id === "__more__" ? Ellipsis : null);
  const labelLines = compact ? [] : splitRadialLabel(action.label);

  return (
    <span className="ember-radial-action-menu__content" title={action.disabledReason || action.label}>
      {Icon ? <Icon aria-hidden="true" size={compact ? 20 : 22} strokeWidth={2.1} /> : null}
      {labelLines.length ? (
        <span className="ember-radial-action-menu__label" aria-hidden="true">
          {labelLines.map((line) => <span key={line}>{line}</span>)}
        </span>
      ) : null}
    </span>
  );
}

export default function EmberRadialActionMenu({
  open,
  anchorPosition,
  actions,
  activeMenuId,
  onActiveMenuChange,
  onSelect,
  onClose,
  onBack,
  ariaLabel = "Actiemenu",
  compact = false,
  reducedMotion,
  resolvedTheme = "dark",
  boundaryElement,
}) {
  const wrapperRef = useRef(null);
  const [internalMenuId, setInternalMenuId] = useState(ROOT_MENU_ID);
  const currentMenuId = activeMenuId ?? internalMenuId;
  const rootActions = useMemo(() => prepareRootActions(actions), [actions]);
  const currentActions = useMemo(
    () => actionsForMenu(rootActions, currentMenuId),
    [currentMenuId, rootActions],
  );
  const boundarySize = useBoundarySize(boundaryElement, open);
  const systemReducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion ?? systemReducedMotion;
  const metrics = menuMetrics(compact, boundarySize);
  const center = clampRadialMenuCenter(
    anchorPosition,
    boundarySize,
    metrics.outerRadius,
    metrics.boundaryPadding,
  );
  const isSubmenu = currentMenuId !== ROOT_MENU_ID;

  function setMenu(menuId) {
    if (activeMenuId === undefined) setInternalMenuId(menuId);
    onActiveMenuChange?.(menuId);
  }

  function closeMenu() {
    setMenu(ROOT_MENU_ID);
    onClose?.();
  }

  function backToParent() {
    const parentMenuId = findParentMenuId(rootActions, currentMenuId) || ROOT_MENU_ID;
    setMenu(parentMenuId);
    onBack?.(parentMenuId);
  }

  function activateAction(action) {
    if (action.disabled) return;
    if (actionHasSubmenu(action)) {
      setMenu(action.id);
      return;
    }
    setMenu(ROOT_MENU_ID);
    action.onSelect?.(action);
    onSelect?.(action);
  }

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        wrapperRef.current
          ?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')
          ?.focus();
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentMenuId, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) closeMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  if (!open || currentActions.length < 2 || !boundaryElement) return null;

  return (
    <div
      ref={wrapperRef}
      className={`ember-radial-action-menu ember-radial-action-menu--${resolvedTheme}${shouldReduceMotion ? " is-reduced-motion" : ""}`}
      style={{
        "--radial-center-x": `${center.x}px`,
        "--radial-center-y": `${center.y}px`,
        "--radial-inner-radius": `${metrics.innerRadius}px`,
        "--radial-outer-radius": `${metrics.outerRadius}px`,
      }}
      data-active-menu-id={currentMenuId}
      data-testid="ember-radial-action-menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Menu
        key={currentMenuId}
        centerX={center.x}
        centerY={center.y}
        innerRadius={metrics.innerRadius}
        outerRadius={metrics.outerRadius}
        show
        animation={shouldReduceMotion ? "fade" : ["fade", "scale"]}
        animationTimeout={shouldReduceMotion ? 45 : 165}
        theme={resolvedTheme === "light" ? "light" : "dark"}
        drawBackground
        role="menu"
        aria-label={ariaLabel}
      >
        {currentActions.map((action) => {
          const disabledReason = action.disabledReason || (action.disabled ? "Actie niet beschikbaar" : "");
          const ariaActionLabel = disabledReason
            ? `${action.label}; niet beschikbaar; ${disabledReason}`
            : actionHasSubmenu(action)
              ? `${action.label}; submenu openen`
              : action.label;

          return (
            <MenuItem
              key={action.id}
              data={action}
              className={`ember-radial-action-menu__action ember-radial-action-menu__action--${action.tone || "neutral"}${action.disabled ? " is-disabled" : ""}`}
              role="menuitem"
              tabIndex={action.disabled ? -1 : 0}
              aria-label={ariaActionLabel}
              aria-disabled={action.disabled ? "true" : undefined}
              onItemClick={(event) => {
                event.stopPropagation();
                activateAction(action);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  activateAction(action);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMenu();
                }
              }}
            >
              <ActionContent action={action} compact={compact} />
            </MenuItem>
          );
        })}
      </Menu>

      <button
        type="button"
        className="ember-radial-action-menu__hub"
        style={{ left: center.x, top: center.y }}
        aria-label={isSubmenu ? "Terug" : "Menu sluiten"}
        title={isSubmenu ? "Terug" : "Menu sluiten"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (isSubmenu) backToParent(); else closeMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeMenu();
          }
        }}
      >
        {isSubmenu ? <ArrowLeft aria-hidden="true" size={23} /> : <X aria-hidden="true" size={22} />}
      </button>
    </div>
  );
}
