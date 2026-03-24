// /src/pages/Admin/AdminPage.jsx

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import SaveButton from "../../components/SaveButton.jsx";
import AdminFormsTab from "./AdminFormsTab.jsx";
import { BrainIcon } from "@/components/ui/brain";

export default function AdminPage() {
  const formsRef = useRef(null);

  const [activeTab, setActiveTab] = useState("forms");

  const [headerSaveState, setHeaderSaveState] = useState({
    visible: false,
    disabled: true,
    saving: false,
    saved: false,
    pulse: false,
  });

  useEffect(() => {
    function onBeforeUnload(e) {
      if (activeTab === "forms" && formsRef.current?.hasUnsavedChanges?.()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [activeTab]);

  useEffect(() => {
    function onKeyDown(e) {
      const key = String(e.key || "");

      if (e.altKey && (key === "s" || key === "S")) {
        if (activeTab === "forms" && formsRef.current?.canSaveActiveTab?.()) {
          e.preventDefault();
          formsRef.current?.saveActiveTab?.();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab]);

  const tabs = useMemo(() => {
    return [
      {
        key: "forms",
        label: "Formulieren",
        Icon: BrainIcon,
        content: (
          <AdminFormsTab
            ref={formsRef}
            onHeaderSaveStateChange={setHeaderSaveState}
          />
        ),
      },
    ];
  }, []);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  const showHeaderSave = activeTab === "forms" && headerSaveState.visible;

  return (
    <div>
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <div className="inst-title">
              <h1>Beheer</h1>
              <div className="muted" style={{ fontSize: 13 }}>
                Configuratie van Ember
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {showHeaderSave && (
              <SaveButton
                disabled={headerSaveState.disabled}
                saving={headerSaveState.saving}
                saved={headerSaveState.saved}
                pulse={headerSaveState.pulse}
                onClick={() => formsRef.current?.saveActiveTab?.()}
              />
            )}
          </div>
        </div>

        <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      <div className="inst-body">{activeContent}</div>
    </div>
  );
}