import { useState } from "react";
import { BadgeCheck, ClipboardCheck } from "lucide-react";
import CertificatesTab from "./CertificatesTab.jsx";
import InspectionCasesTab from "./InspectionCasesTab.jsx";

export default function CertificationTab({ code, readOnly = false, initialSubtab = "certificates" }) {
  const [subtab, setSubtab] = useState(initialSubtab === "inspections" ? "inspections" : "certificates");

  return (
    <div className="certification-domain">
      <div className="tabs certification-domain__tabs">
        <div className="tabs-row" role="tablist" aria-label="Certificering">
          <button
          type="button"
          role="tab"
          aria-selected={subtab === "certificates"}
          className={`tab-btn${subtab === "certificates" ? " active" : ""}`}
          onClick={() => setSubtab("certificates")}
        >
          <BadgeCheck size={16} /> Certificaten
          </button>
          <button
          type="button"
          role="tab"
          aria-selected={subtab === "inspections"}
          className={`tab-btn${subtab === "inspections" ? " active" : ""}`}
          onClick={() => setSubtab("inspections")}
        >
          <ClipboardCheck size={16} /> Inspecties
          </button>
        </div>
      </div>
      {subtab === "certificates" ? <CertificatesTab code={code} readOnly={readOnly} /> : <InspectionCasesTab code={code} />}
    </div>
  );
}
