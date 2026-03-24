// /src/pages/Admin/AdminPage.jsx

import { useMemo, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import AdminFormsTab from "./AdminFormsTab.jsx";
import { BrainIcon } from "@/components/ui/brain";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("forms");

  const tabs = useMemo(() => {
    return [
      {
        key: "forms",
        label: "Formulieren",
        Icon: BrainIcon,
        content: <AdminFormsTab />,
      },
    ];
  }, []);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

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
        </div>

        <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      <div className="inst-body">{activeContent}</div>
    </div>
  );
}