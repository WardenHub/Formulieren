import clsx from "clsx";

export default function StatusBadge({ label, tone = "neutral", compact = false }) {
  return (
    <span className={clsx("eo-badge", `eo-badge--${tone}`, compact && "eo-badge--compact")}>
      {label}
    </span>
  );
}
