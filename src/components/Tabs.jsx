// /src/components/Tabs.jsx

export default function Tabs({ tabs, activeKey, onChange, renderContent = true }) {
  const activeTab = tabs.find((t) => t.key === activeKey);

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

      {renderContent ? <div>{activeTab?.content}</div> : null}
    </div>
  );
}
