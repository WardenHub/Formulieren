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
                  className="nav-anim-icon"
                />
              ) : null}

              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
