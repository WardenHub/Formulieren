// /src/pages/Installations/InstallationDetails.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams , useNavigate  } from "react-router-dom";

import AtriumTab from "./AtriumTab.jsx";
import DocumentsTab from "./DocumentsTab.jsx";
import CustomFieldsTab from "./CustomFieldsTab.jsx";
import SaveButton from "../../components/SaveButton.jsx";
import { ChevronLeftIcon } from "@/components/ui/chevron-left";

import {
  getInstallation,
  getCatalog,
  getCustomValues,
  getDocuments,
  getInstallationTypes,
  setInstallationType,
} from "../../api/emberApi.js";

import Tabs from "../../components/Tabs.jsx";
import InstallationTypeRequiredPanel from "../../components/InstallationTypeRequiredPanel.jsx";
import InstallationTypeTag from "../../components/InstallationTypeTag.jsx";

export default function InstallationDetails() {
  const { code } = useParams();
  const navigate = useNavigate();
  const backIconRef = useRef(null);

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

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typePickerRef = useRef(null);

  const customSaveRef = useRef(null);

  const typeIsSet = Boolean(installation?.installation_type_key);
  const docsSaveRef = useRef(null);

  const [docsDirty, setDocsDirty] = useState(false);
  const [docsSaving, setDocsSaving] = useState(false);
  const [docsSaveOk, setDocsSaveOk] = useState(false);

  async function reloadCustomValues() {
    const vals = await getCustomValues(code);
    setCustomValuesState(vals?.values || []);
  }

  async function handleSetType(typeKey) {
    try {
      setTypeSaving(true);

      // 1) update type
      await setInstallationType(code, typeKey);

      // 2) haal alles opnieuw op wat door type beïnvloed wordt
      const [inst, cat, vals, docData] = await Promise.all([
        getInstallation(code),
        getCatalog(code),
        getCustomValues(code),
        getDocuments(code),
      ]);

      setInstallation(inst.installation || null);
      setCatalogState(cat || null);
      setCustomValuesState(vals?.values || []);
      setDocs(docData || null);

      // 3) reset save-state (want je grid kan veranderen)
      setCustomDirty(false);
      setCustomSaveOk(false);

      // 4) ga naar eigenschappen
      setActiveTab("custom");
    } finally {
      setTypeSaving(false);
    }
  }


  // close popover on outside click + esc
  useEffect(() => {
    if (!typePickerOpen) return;

    function onMouseDown(e) {
      const el = typePickerRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setTypePickerOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") setTypePickerOpen(false);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [typePickerOpen]);

  useEffect(() => {
    let cancelled = false;
    setError(null);

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

  useEffect(() => {
    function onKeyDown(e) {
      // alt + s
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();

        // bepaal welke save actief is
        if (activeTab === "custom") {
          if (customDirty && !customSaving) {
            customSaveRef.current?.save?.();
          }
        }

        if (activeTab === "documents") {
          if (docsDirty && !docsSaving) {
            docsSaveRef.current?.save?.();
          }
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTab,
    customDirty,
    customSaving,
    docsDirty,
    docsSaving,
  ]);


  const title = useMemo(() => {
    const name =
      installation?.name ||
      installation?.obj_naam ||
      installation?.atrium_installation_code ||
      code;
    return `Installatie ${name}`;
  }, [installation, code]);

  const tabs = useMemo(() => {
    const customLabel = typeIsSet ? "Eigenschappen" : "Eigenschappen (kies type)";

    return [
      {
        key: "atrium",
        label: "Atriumdata",
        content: <AtriumTab catalog={catalog} installation={installation} />,
      },
      {
        key: "custom",
        label: customLabel,
        content: typeIsSet ? (
          <CustomFieldsTab
            key={installation?.installation_type_key || "no-type"}
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
            title="Installatiesoort kiezen"
            types={installationTypes}
            saving={typeSaving}
            onSelect={handleSetType}
          />
        ),
      },
      {
        key: "documents",
        label: "Documenten",
        content: (
          <DocumentsTab
            ref={docsSaveRef}
            code={code}
            docs={docs}
            onDirtyChange={setDocsDirty}
            onSavingChange={setDocsSaving}
            onSaveOk={() => {
              setDocsSaveOk(true);
              if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
              saveOkTimerRef.current = setTimeout(() => setDocsSaveOk(false), 2500);
            }}
            onSaved={async () => {
              const docData = await getDocuments(code);
              setDocs(docData || null);
            }}
          />
        ),
      },
    ];
  }, [catalog, installation, docs, code, customValues, typeIsSet, installationTypes, typeSaving]);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  const showHeaderSave = (activeTab === "custom" && typeIsSet) || activeTab === "documents";


  return (
    <div>
      <div className="inst-sticky">
        <div className="inst-sticky-row">
          <div className="inst-sticky-left">
            <button
              type="button"
              className="icon-btn"
              title="terug naar installaties"
              onClick={() => navigate("/installaties")}
              onMouseEnter={() => backIconRef.current?.startAnimation?.()}
              onMouseLeave={() => backIconRef.current?.stopAnimation?.()}
            >
              <ChevronLeftIcon ref={backIconRef} size={18} />
            </button>

            <div className="inst-title">
              <h1>{title}</h1>

              <div className="muted" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <span>code: {code}</span>

                <div className="type-picker-wrap" ref={typePickerRef}>
                  <button
                    type="button"
                    className="type-tag-btn"
                    onClick={() => setTypePickerOpen((v) => !v)}
                    title={typeIsSet ? "wijzig installatiesoort" : "kies installatiesoort"}
                  >
                    <InstallationTypeTag
                      typeKey={installation?.installation_type_key}
                      label={installation?.installation_type_name}
                    />
                  </button>

                  {typePickerOpen && (
                    <div className="type-popover" role="dialog" aria-label="installatiesoort kiezen">
                      <InstallationTypeRequiredPanel
                        title={typeIsSet ? "Wijzig installatiesoort" : "Installatiesoort kiezen"}
                        compact={typeIsSet}
                        types={installationTypes}
                        saving={typeSaving}
                        onSelect={async (typeKey) => {
                          await handleSetType(typeKey);
                          setTypePickerOpen(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {showHeaderSave && (
            <SaveButton
              disabled={activeTab === "custom" ? !customDirty : !docsDirty}
              saving={activeTab === "custom" ? customSaving : docsSaving}
              saved={activeTab === "custom" ? customSaveOk : docsSaveOk}
              pulse={activeTab === "custom" ? customDirty : docsDirty}
              onClick={() => {
                if (activeTab === "custom") customSaveRef.current?.save?.();
                if (activeTab === "documents") docsSaveRef.current?.save?.();
              }}
            />
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