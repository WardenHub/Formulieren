// /src/pages/Admin/AdminPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import SaveButton from "../../components/SaveButton.jsx";
import AdminFormsTab from "./AdminFormsTab.jsx";
import AdminInstallationsTab from "./AdminInstallationsTab.jsx";
import { BrainIcon } from "@/components/ui/brain";
import { CogIcon } from "@/components/ui/cog";

export default function AdminPage() {
  const formsRef = useRef(null);
  const installationsRef = useRef(null);

  const [activeTab, setActiveTab] = useState("forms");

  const [headerSaveState, setHeaderSaveState] = useState({
    visible: false,
    disabled: true,
    saving: false,
    saved: false,
    pulse: false,
  });

  useEffect(() => {
    function getActiveRef() {
      if (activeTab === "forms") return formsRef.current;
      if (activeTab === "installations") return installationsRef.current;
      return null;
    }

    function onBeforeUnload(e) {
      const ref = getActiveRef();
      if (ref?.hasUnsavedChanges?.()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [activeTab]);

  useEffect(() => {
    function getActiveRef() {
      if (activeTab === "forms") return formsRef.current;
      if (activeTab === "installations") return installationsRef.current;
      return null;
    }

    function onKeyDown(e) {
      const key = String(e.key || "");

      if (e.altKey && (key === "s" || key === "S")) {
        const ref = getActiveRef();
        if (ref?.canSaveActiveTab?.()) {
          e.preventDefault();
          ref.saveActiveTab?.();
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
      {
        key: "installations",
        label: "Installaties",
        Icon: CogIcon,
        content: (
          <AdminInstallationsTab
            ref={installationsRef}
            onHeaderSaveStateChange={setHeaderSaveState}
          />
        ),
      },
    ];
  }, []);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  const showHeaderSave =
    (activeTab === "forms" || activeTab === "installations") &&
    headerSaveState.visible;

  function handleSaveClick() {
    if (activeTab === "forms") {
      formsRef.current?.saveActiveTab?.();
      return;
    }
    if (activeTab === "installations") {
      installationsRef.current?.saveActiveTab?.();
    }
  }

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
                onClick={handleSaveClick}
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