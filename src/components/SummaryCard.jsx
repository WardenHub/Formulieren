import StatusBadge from "./StatusBadge.jsx";

export default function SummaryCard({ label, value, tone = "neutral", hint, active = false, onClick }) {
  const TagName = onClick ? "button" : "section";

  return (
    <TagName
      type={onClick ? "button" : undefined}
      className={`eo-summary-card${active ? " eo-summary-card--active" : ""}${onClick ? " eo-summary-card--clickable" : ""}`}
      onClick={onClick}
    >
      <div className="eo-summary-card__head">
        <span>{label}</span>
        <StatusBadge label={String(value)} tone={tone} compact />
      </div>
      {hint ? <p className="eo-summary-card__hint">{hint}</p> : null}
    </TagName>
  );
}
