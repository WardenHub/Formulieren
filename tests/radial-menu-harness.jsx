import React, { useState, useSyncExternalStore } from "react";
import ReactDOM from "react-dom/client";
import {
  FilePenLine,
  Info,
  Link2,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  TriangleAlert,
} from "lucide-react";

import EmberRadialActionMenu from "../src/components/radial/EmberRadialActionMenu.jsx";
import {
  applyAppearancePreference,
  getResolvedAppearance,
  subscribeAppearance,
} from "../src/theme/appearance.js";
import "../src/styles/layout.css";
import "./radial-menu-harness.css";

const baseActions = [
  { id: "pin", label: "Pin", icon: MapPin, tone: "primary" },
  { id: "note", label: "Opmerking", icon: MessageSquareText, tone: "note" },
  { id: "defect", label: "Tekortkoming", icon: TriangleAlert, tone: "danger" },
];

const extendedActions = [
  ...baseActions,
  {
    id: "more",
    label: "Meer",
    icon: MoreHorizontal,
    tone: "neutral",
    children: [
      { id: "edit", label: "Pin bewerken", icon: FilePenLine, tone: "neutral" },
      { id: "link", label: "Actie koppelen", icon: Link2, tone: "note" },
      { id: "info", label: "Informatie", icon: Info, tone: "neutral" },
    ],
  },
];

const positions = {
  center: { x: 450, y: 300 },
  right: { x: 888, y: 300 },
  leftBottom: { x: 8, y: 592 },
  left: { x: 8, y: 300 },
  top: { x: 450, y: 8 },
  bottom: { x: 450, y: 592 },
  topLeft: { x: 8, y: 8 },
  topRight: { x: 892, y: 8 },
  bottomRight: { x: 892, y: 592 },
};

export function Harness() {
  const [boundaryElement, setBoundaryElement] = useState(null);
  const [open, setOpen] = useState(true);
  const [positionName, setPositionName] = useState("center");
  const [submenuEnabled, setSubmenuEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState("root");
  const [lastAction, setLastAction] = useState("geen");
  const theme = useSyncExternalStore(subscribeAppearance, getResolvedAppearance, () => "dark");

  const applyTheme = (preference) => applyAppearancePreference(preference);

  return (
    <main className="radial-harness">
      <header className="radial-harness__toolbar">
        <strong>Ember radial menu</strong>
        <button id="theme-light" type="button" onClick={() => applyTheme("light")}>Light</button>
        <button id="theme-dark" type="button" onClick={() => applyTheme("dark")}>Dark</button>
        <button id="theme-system" type="button" onClick={() => applyTheme("system")}>Systeem</button>
        <button id="toggle-submenu" type="button" onClick={() => {
          setSubmenuEnabled((value) => !value);
          setActiveMenuId("root");
        }}>Submenu {submenuEnabled ? "uit" : "aan"}</button>
        <button id="toggle-motion" type="button" onClick={() => setReducedMotion((value) => !value)}>
          Reduced motion {reducedMotion ? "uit" : "aan"}
        </button>
        <select id="position" value={positionName} onChange={(event) => {
          setPositionName(event.target.value);
          setOpen(true);
        }}>
          {Object.keys(positions).map((name) => <option key={name}>{name}</option>)}
        </select>
        <button id="toggle-open" type="button" onClick={() => setOpen((value) => !value)}>{open ? "Sluiten" : "Openen"}</button>
        <span id="state">theme={theme}; menu={activeMenuId}; action={lastAction}</span>
      </header>

      <section ref={setBoundaryElement} id="boundary" className="radial-harness__boundary" aria-label="PDF-viewer testvlak">
        <div className="radial-harness__sheet">
          <strong>PDF-tekening</strong>
          <span>Lokale visuele validatie; geen API- of datawrites</span>
        </div>
        <span
          className="radial-harness__requested-point"
          style={{ left: positions[positionName].x, top: positions[positionName].y }}
          title="Oorspronkelijke klikpositie"
        />
        <EmberRadialActionMenu
          open={open}
          anchorPosition={positions[positionName]}
          actions={submenuEnabled ? extendedActions : baseActions}
          activeMenuId={activeMenuId}
          onActiveMenuChange={setActiveMenuId}
          onSelect={(action) => {
            setLastAction(action.id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          onBack={() => setLastAction("terug")}
          ariaLabel="Lokale radial menu test"
          reducedMotion={reducedMotion}
          resolvedTheme={theme}
          boundaryElement={boundaryElement}
        />
      </section>
    </main>
  );
}

applyAppearancePreference("light");
const root = globalThis.__emberRadialMenuHarnessRoot
  || ReactDOM.createRoot(document.getElementById("root"));
globalThis.__emberRadialMenuHarnessRoot = root;
root.render(<Harness />);
