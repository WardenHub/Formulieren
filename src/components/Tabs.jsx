// /src/components/Tabs.jsx
import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/ui/chevron-down";

/* De tabbalk van een installatie of een dossier.

   Op een breed scherm staan alle tabs naast elkaar; dat werkt en blijft zo. Op een telefoon
   liepen veertien tabs uit tot vijf regels, waardoor de inhoud pas onder de vouw begon en je
   bij elke wisseling eerst langs de hele balk moest scrollen.

   Daarom daar een andere vorm: één regel met de tab waar je nu staat, en een vel met alle
   tabs zodra je erop tikt. Twee kolommen, dezelfde iconen en tellers, ruime raakvlakken voor
   wie met handschoenen werkt. Eén tik erheen, één tik terug.

   De keuze tussen beide vormen gebeurt met CSS en niet met een schermmeting in JavaScript;
   zo staat er bij het eerste beeld meteen het goede en klapt er niets om. */

function TabIcon({ tab, onIconRef }) {
  const Icon = tab.Icon || null;
  if (!Icon) return null;

  const iconToneStyle =
    tab.iconTone === "warning"
      ? { color: "#d97706" }
      : tab.iconTone === "danger"
        ? { color: "var(--danger-text)" }
        : undefined;

  return (
    <Icon
      ref={onIconRef}
      size={18}
      className={`nav-anim-icon${tab.iconTone ? ` tab-icon--${tab.iconTone}` : ""}`}
      style={iconToneStyle}
    />
  );
}

function TabCount({ tab }) {
  const hasCount = tab.count !== null && tab.count !== undefined && Number.isFinite(Number(tab.count));
  if (!hasCount) return null;

  const countValue = tab.countDelta
    ? `${Number(tab.countDelta) > 0 ? "+" : ""}${tab.countDelta}`
    : tab.count;

  return (
    <span
      key={`${tab.key}:${tab.countDelta ?? tab.count}`}
      className={`tab-btn__count${tab.countDelta ? " tab-btn__count--delta" : ""}`}
      aria-label={
        tab.countDelta
          ? `${countValue} bijlagen gewijzigd`
          : tab.countAriaLabel
            ? `${tab.count} ${tab.countAriaLabel}`
            : `${tab.count} bijlagen`
      }
    >
      {countValue}
    </span>
  );
}

export default function Tabs({ tabs, activeKey, onChange }) {
  const iconRefs = useRef({});
  const [sheetOpen, setSheetOpen] = useState(false);

  function registerIcon(key, element) {
    iconRefs.current[key] = element;
  }

  const active = tabs.find((tab) => tab.key === activeKey) || tabs[0] || null;

  // Het vel sluit met Escape. Sluiten bij een tabwissel gebeurt in choose zelf; een effect
  // dat op activeKey reageert zou hetzelfde doen, maar dan met een extra render erachteraan.
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  function choose(key) {
    setSheetOpen(false);
    onChange(key);
  }

  return (
    <div className="tabs">
      <div className="tabs-row">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={tab.key === activeKey ? "tab-btn active" : "tab-btn"}
            onMouseEnter={() => iconRefs.current[tab.key]?.startAnimation?.()}
            onMouseLeave={() => iconRefs.current[tab.key]?.stopAnimation?.()}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <TabIcon tab={tab} onIconRef={(el) => registerIcon(tab.key, el)} />
            <span>{tab.label}</span>
            <TabCount tab={tab} />
          </button>
        ))}
      </div>

      <div className="tabs-compact">
        <button
          type="button"
          className="tabs-compact__trigger"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((current) => !current)}
        >
          <span className="tabs-compact__current">
            {active ? <TabIcon tab={active} /> : null}
            <span>{active?.label || "Kies een onderdeel"}</span>
            {active ? <TabCount tab={active} /> : null}
          </span>
          <span className="tabs-compact__hint">
            <span className="muted">{tabs.length}</span>
            <ChevronDownIcon size={18} aria-hidden="true" />
          </span>
        </button>

        {sheetOpen ? (
          <>
            <button
              type="button"
              className="tabs-compact__backdrop"
              aria-label="Onderdelen sluiten"
              onClick={() => setSheetOpen(false)}
            />
            <div className="tabs-compact__sheet" role="dialog" aria-label="Kies een onderdeel">
              <div className="tabs-compact__grid">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`tabs-compact__item${tab.key === activeKey ? " is-active" : ""}`}
                    aria-current={tab.key === activeKey ? "true" : undefined}
                    onClick={() => choose(tab.key)}
                  >
                    <TabIcon tab={tab} />
                    <span className="tabs-compact__label">{tab.label}</span>
                    <TabCount tab={tab} />
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
