// /src/components/Tabs.jsx

export default function Tabs({ tabs, activeKey, onChange }) {
  return (
    <div className="tabs">
      <div className="tabs-row">
        {tabs.map((t) => {
          const active = t.key === activeKey;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={active ? "tab-btn active" : "tab-btn"}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
