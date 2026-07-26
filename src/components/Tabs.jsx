// /src/components/Tabs.jsx
import { useRef } from "react";

export default function Tabs({ tabs, activeKey, onChange }) {
  const iconRefs = useRef({});

  return (
    <div className="tabs">
      <div className="tabs-row">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          const Icon = t.Icon || null;
          const iconToneStyle =
            t.iconTone === "warning"
              ? { color: "#d97706" }
              : t.iconTone === "danger"
                ? { color: "var(--danger-text)" }
                : undefined;
          const hasCount =
            t.count !== null &&
            t.count !== undefined &&
            Number.isFinite(Number(t.count));
          const countValue = t.countDelta
            ? `${Number(t.countDelta) > 0 ? "+" : ""}${t.countDelta}`
            : t.count;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={active ? "tab-btn active" : "tab-btn"}
              onMouseEnter={() => iconRefs.current[t.key]?.startAnimation?.()}
              onMouseLeave={() => iconRefs.current[t.key]?.stopAnimation?.()}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              {Icon ? (
                <Icon
                  ref={(el) => {
                    iconRefs.current[t.key] = el;
                  }}
                  size={18}
                  className={`nav-anim-icon${t.iconTone ? ` tab-icon--${t.iconTone}` : ""}`}
                  style={iconToneStyle}
                />
              ) : null}

              <span>{t.label}</span>
              {hasCount ? (
                <span
                  key={`${t.key}:${t.countDelta ?? t.count}`}
                  className={`tab-btn__count${t.countDelta ? " tab-btn__count--delta" : ""}`}
                  aria-label={
                    t.countDelta
                      ? `${countValue} bijlagen gewijzigd`
                      : `${t.count} bijlagen`
                  }
                >
                  {countValue}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
