export const ROOT_MENU_ID = "root";
export const MAX_ROOT_ACTIONS = 6;

const DEFAULT_OUTER_RADIUS = 128;
const COMPACT_OUTER_RADIUS = 108;
const DEFAULT_INNER_RADIUS = 52;
const COMPACT_INNER_RADIUS = 45;
const BOUNDARY_PADDING = 10;

function visibleActions(actions) {
  return (Array.isArray(actions) ? actions : []).filter(
    (action) => action?.id && action.permission !== false,
  );
}

export function prepareRootActions(actions, maxRootActions = MAX_ROOT_ACTIONS) {
  const prepared = visibleActions(actions);
  if (prepared.length <= maxRootActions) return prepared;

  const directActionCount = Math.max(1, maxRootActions - 1);
  return [
    ...prepared.slice(0, directActionCount),
    {
      id: "__more__",
      label: "Meer",
      tone: "neutral",
      children: prepared.slice(directActionCount),
    },
  ];
}

export function findAction(actions, actionId) {
  for (const action of visibleActions(actions)) {
    if (String(action.id) === String(actionId)) return action;
    const nested = findAction(action.children, actionId);
    if (nested) return nested;
  }
  return null;
}

export function findParentMenuId(actions, actionId, parentMenuId = ROOT_MENU_ID) {
  for (const action of visibleActions(actions)) {
    if (String(action.id) === String(actionId)) return parentMenuId;
    const nestedParent = findParentMenuId(action.children, actionId, action.id);
    if (nestedParent) return nestedParent;
  }
  return null;
}

export function actionsForMenu(actions, activeMenuId = ROOT_MENU_ID) {
  const rootActions = prepareRootActions(actions);
  if (!activeMenuId || activeMenuId === ROOT_MENU_ID) return rootActions;
  return visibleActions(findAction(rootActions, activeMenuId)?.children);
}

export function menuMetrics(compact = false, boundarySize = null) {
  const baseOuterRadius = compact ? COMPACT_OUTER_RADIUS : DEFAULT_OUTER_RADIUS;
  const baseInnerRadius = compact ? COMPACT_INNER_RADIUS : DEFAULT_INNER_RADIUS;
  const shortestSide = Math.min(
    Number(boundarySize?.width) || Number.POSITIVE_INFINITY,
    Number(boundarySize?.height) || Number.POSITIVE_INFINITY,
  );
  const availableRadius = Number.isFinite(shortestSide)
    ? Math.max(82, (shortestSide - BOUNDARY_PADDING * 2) / 2)
    : baseOuterRadius;
  const outerRadius = Math.min(baseOuterRadius, availableRadius);
  const innerRadius = Math.min(baseInnerRadius, Math.max(36, outerRadius * 0.42));

  return { innerRadius, outerRadius, boundaryPadding: BOUNDARY_PADDING };
}

export function clampRadialMenuCenter(anchorPosition, boundarySize, outerRadius, padding = BOUNDARY_PADDING) {
  const width = Math.max(0, Number(boundarySize?.width) || 0);
  const height = Math.max(0, Number(boundarySize?.height) || 0);
  const requestedX = Math.max(0, Number(anchorPosition?.x ?? anchorPosition?.left) || 0);
  const requestedY = Math.max(0, Number(anchorPosition?.y ?? anchorPosition?.top) || 0);
  const minimum = outerRadius + padding;

  function clamp(value, size) {
    if (size <= minimum * 2) return size / 2;
    return Math.min(size - minimum, Math.max(minimum, value));
  }

  return {
    x: clamp(requestedX, width),
    y: clamp(requestedY, height),
  };
}

export function splitRadialLabel(label) {
  const text = String(label || "").trim();
  if (text.length <= 10) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const midpoint = Math.ceil(words.length / 2);
    return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
  }

  const splitAt = Math.ceil(text.length / 2);
  return [text.slice(0, splitAt), text.slice(splitAt)];
}
