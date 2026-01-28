// /src/pages/Installations/InstallationDetails.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import AtriumTab from "./AtriumTab.jsx";
import DocumentsTab from "./DocumentsTab.jsx";
import CustomFieldsTab from "./CustomFieldsTab.jsx";

import {
  getInstallation,
  getCatalog,
  getCustomValues,
  getDocuments,
  getInstallationTypes,
  setInstallationType,
} from "../../api/emberApi.js";

import { Save, Loader2, Check } from "lucide-react";

import Tabs from "../../components/Tabs.jsx";
import InstallationTypeRequiredPanel from "../../components/InstallationTypeRequiredPanel.jsx";
import InstallationTypeTag from "../../components/InstallationTypeTag.jsx";

export default function InstallationDetails() {
  const { code } = useParams();

  const [activeTab, setActiveTab] = useState("documents");
  const saveOkTimerRef = useRef(null);

  const [installation, setInstallation] = useState(null);
  const [catalog, setCatalogState] = useState(null);
  const [customValues, setCustomValuesState] = useState(null);
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);

  const [customDirty, setCustomDirty] = useState(false);
  const [customSaving, setCustomSaving] = useState(false);
  const [customSaveOk, setCustomSaveOk] = useState(false);

  const [installationTypes, setInstallationTypesState] = useState([]);
  const [typeSaving, setTypeSaving] = useState(false);

  const customSaveRef = useRef(null);

  const typeIsSet = Boolean(installation?.installation_type_key);

  async function reloadCustomValues() {
    const vals = await getCustomValues(code);
    setCustomValuesState(vals?.values || []);
  }

  async function handleSetType(typeKey) {
    try {
      setTypeSaving(true);
      await setInstallationType(code, typeKey);

      const refreshed = await getInstallation(code);
      setInstallation(refreshed.installation || null);

      // optioneel: zet user meteen naar eigenschappen
      setActiveTab("custom");
    } finally {
      setTypeSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);

    // types (frontend filter op is_active)
    getInstallationTypes()
      .then((res) => {
        if (cancelled) return;
        setInstallationTypesState((res?.types || []).filter((t) => t.is_active));
      })
      .catch(() => {});

    Promise.all([getInstallation(code), getCatalog(code), getCustomValues(code), getDocuments(code)])
      .then(([inst, cat, vals, docData]) => {
        if (cancelled) return;
        setInstallation(inst.installation || null);
        setCatalogState(cat || null);
        setCustomValuesState(vals?.values || []);
        setDocs(docData || null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    return () => {
      if (saveOkTimerRef.current) {
        clearTimeout(saveOkTimerRef.current);
        saveOkTimerRef.current = null;
      }
    };
  }, []);

  const title = useMemo(() => {
    const name =
      installation?.name ||
      installation?.obj_naam ||
      installation?.atrium_installation_code ||
      code;
    return `Installatie ${name}`;
  }, [installation, code]);

  const tabs = useMemo(() => {
    return [
      {
        key: "atrium",
        label: "Atriumdata",
        content: <AtriumTab catalog={catalog} installation={installation} />,
      },
      {
        key: "custom",
        // label aanpassen als type nog niet gezet is
        label: typeIsSet ? "Eigenschappen" : "Eigenschappen (kies type)",
        content: typeIsSet ? (
          <CustomFieldsTab
            ref={customSaveRef}
            code={code}
            catalog={catalog}
            customValues={customValues || []}
            onDirtyChange={setCustomDirty}
            onSavingChange={setCustomSaving}
            onSaveOk={() => {
              setCustomSaveOk(true);
              if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
              saveOkTimerRef.current = setTimeout(() => setCustomSaveOk(false), 2500);
            }}
            onSaved={reloadCustomValues}
          />
        ) : (
          <InstallationTypeRequiredPanel
            types={installationTypes}
            saving={typeSaving}
            onSelect={handleSetType}
          />
        ),
      },
      {
        key: "documents",
        label: "Documenten",
        content: <DocumentsTab docs={docs} />,
      },
    ];
  }, [catalog, installation, docs, code, customValues, typeIsSet, installationTypes, typeSaving]);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  const showHeaderSave = activeTab === "custom" && typeIsSet;

  return (
    <div>
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-title">
            <h1>{title}</h1>
            <div
              className="muted"
              style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}
            >
              <span>code: {code}</span>
              <InstallationTypeTag
                typeKey={installation?.installation_type_key}
                label={installation?.installation_type_name}
              />
            </div>
          </div>

          {showHeaderSave && (
            <button
              className="btn-save"
              disabled={!customDirty || customSaving}
              onClick={() => customSaveRef.current?.save?.()}
              title={customSaving ? "opslaan..." : customDirty ? "opslaan" : "geen wijzigingen"}
            >
              {customSaving ? (
                <Loader2 size={18} className="spin" />
              ) : customSaveOk ? (
                <Check size={18} className="icon-success" />
              ) : (
                <Save size={18} />
              )}
              <span className="btn-save-text">Opslaan</span>
            </button>
          )}
        </div>

        <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      <div className="inst-body">
        {error && <p style={{ color: "salmon" }}>{error}</p>}
        {!installation && !catalog && !customValues && !docs && !error && <p>laden</p>}
        {activeContent}
      </div>
    </div>
  );
}
