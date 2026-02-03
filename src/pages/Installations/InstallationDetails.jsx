// /src/pages/Installations/InstallationDetails.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import AtriumTab from "./AtriumTab.jsx";
import DocumentsTab from "./DocumentsTab.jsx";
import CustomFieldsTab from "./CustomFieldsTab.jsx";
import EnergySupplyTab from "./EnergySupplyTab.jsx";
import SaveButton from "../../components/SaveButton.jsx";

import { ChevronLeftIcon } from "@/components/ui/chevron-left";
import { IdCardIcon } from "@/components/ui/id-card";
import { TornadoIcon } from "@/components/ui/tornado";
import { FileStackIcon } from "@/components/ui/file-stack";
import { BatteryIcon } from "@/components/ui/battery";

import { ChevronsDownUpIcon } from "@/components/ui/chevrons-down-up";
import { ChevronsUpDownIcon } from "@/components/ui/chevrons-up-down";

import {
  getInstallation,
  getCatalog,
  getCustomValues,
  getDocuments,
  getInstallationTypes,
  setInstallationType,
  getEnergySupplies,
  getEnergySupplyBrandTypes,
} from "../../api/emberApi.js";

import Tabs from "../../components/Tabs.jsx";
import InstallationTypeRequiredPanel from "../../components/InstallationTypeRequiredPanel.jsx";
import InstallationTypeTag from "../../components/InstallationTypeTag.jsx";

export default function InstallationDetails() {
  const { code } = useParams();
  const navigate = useNavigate();

  const backIconRef = useRef(null);

  // hover animation for collapse/expand-all icon
  const collapseAllIconRef = useRef(null);

  const [activeTab, setActiveTab] = useState("documents");
  const saveOkTimerRef = useRef(null);

  const [installation, setInstallation] = useState(null);
  const [catalog, setCatalogState] = useState(null);
  const [customValues, setCustomValuesState] = useState(null);
  const [docs, setDocs] = useState(null);
  const [energySupplies, setEnergySupplies] = useState(null);
  const [energyBrandTypes, setEnergyBrandTypes] = useState(null);
  const [error, setError] = useState(null);

  const [customDirty, setCustomDirty] = useState(false);
  const [customSaving, setCustomSaving] = useState(false);
  const [customSaveOk, setCustomSaveOk] = useState(false);

  const [installationTypes, setInstallationTypesState] = useState([]);
  const [typeSaving, setTypeSaving] = useState(false);

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typePickerRef = useRef(null);

  const customSaveRef = useRef(null);
  const docsSaveRef = useRef(null);
  const energySaveRef = useRef(null);
  const atriumRef = useRef(null);

  const typeIsSet = Boolean(installation?.installation_type_key);

  const [docsDirty, setDocsDirty] = useState(false);
  const [docsSaving, setDocsSaving] = useState(false);
  const [docsSaveOk, setDocsSaveOk] = useState(false);

  const [energyDirty, setEnergyDirty] = useState(false);
  const [energySaving, setEnergySaving] = useState(false);
  const [energySaveOk, setEnergySaveOk] = useState(false);

  // per-tab: staat er iets open?
  const [anyOpenByTab, setAnyOpenByTab] = useState({
    atrium: false,
    custom: false,
    energy: false,
  });

  function setAnyOpen(tabKey, value) {
    setAnyOpenByTab((prev) => {
      if (prev[tabKey] === value) return prev;
      return { ...prev, [tabKey]: value };
    });
  }

  function getActiveExpandRef() {
    if (activeTab === "atrium") return atriumRef.current;
    if (activeTab === "custom") return customSaveRef.current;
    if (activeTab === "energy") return energySaveRef.current;
    return null;
  }

  const showCollapseAllToggle = activeTab !== "documents";
  const anyOpenInActiveTab = Boolean(anyOpenByTab[activeTab]);
  const collapseBtnTitle = anyOpenInActiveTab ? "Alles inklappen" : "Alles uitklappen";
  const CollapseIcon = anyOpenInActiveTab ? ChevronsDownUpIcon : ChevronsUpDownIcon;

  async function reloadCustomValues() {
    const vals = await getCustomValues(code);
    setCustomValuesState(vals?.values || []);
  }

  async function reloadEnergySupplies() {
    const [items, types] = await Promise.all([getEnergySupplies(code), getEnergySupplyBrandTypes()]);
    setEnergySupplies(items?.items || []);
    setEnergyBrandTypes(types?.types || []);
  }

  async function handleSetType(typeKey) {
    try {
      setTypeSaving(true);

      await setInstallationType(code, typeKey);

      const [inst, cat, vals, docData, energyData, brandTypes] = await Promise.all([
        getInstallation(code),
        getCatalog(code),
        getCustomValues(code),
        getDocuments(code),
        getEnergySupplies(code),
        getEnergySupplyBrandTypes(),
      ]);

      setInstallation(inst.installation || null);
      setCatalogState(cat || null);
      setCustomValuesState(vals?.values || []);
      setDocs(docData || null);
      setEnergySupplies(energyData?.items || []);
      setEnergyBrandTypes(brandTypes?.types || []);

      setCustomDirty(false);
      setCustomSaveOk(false);
      setEnergyDirty(false);
      setEnergySaveOk(false);

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

    Promise.allSettled([
      getInstallation(code),
      getCatalog(code),
      getCustomValues(code),
      getDocuments(code),
      getEnergySupplies(code),
      getEnergySupplyBrandTypes(),
    ]).then((results) => {
      if (cancelled) return;

      const [instR, catR, valsR, docR, energyR, brandR] = results;

      if (instR.status === "fulfilled") setInstallation(instR.value.installation || null);
      if (catR.status === "fulfilled") setCatalogState(catR.value || null);
      if (valsR.status === "fulfilled") setCustomValuesState(valsR.value?.values || []);
      if (docR.status === "fulfilled") setDocs(docR.value || null);

      if (energyR.status === "fulfilled") setEnergySupplies(energyR.value?.items || []);
      else setEnergySupplies([]);

      if (brandR.status === "fulfilled") setEnergyBrandTypes(brandR.value?.types || []);
      else setEnergyBrandTypes([]);

      const firstErr = results.find((x) => x.status === "rejected");
      if (firstErr) setError(firstErr.reason?.message || String(firstErr.reason));
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

        if (activeTab === "custom") {
          if (customDirty && !customSaving) customSaveRef.current?.save?.();
        }
        if (activeTab === "documents") {
          if (docsDirty && !docsSaving) docsSaveRef.current?.save?.();
        }
        if (activeTab === "energy") {
          if (energyDirty && !energySaving) energySaveRef.current?.save?.();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, customDirty, customSaving, docsDirty, docsSaving, energyDirty, energySaving]);

  const title = useMemo(() => {
    const name = installation?.name || installation?.obj_naam || installation?.atrium_installation_code || code;
    return `Installatie ${name}`;
  }, [installation, code]);

  // best-effort admin flag (pas aan als jij elders user info hebt)
  const isAdmin = Boolean(installation?.is_admin || installation?.isAdmin || installation?.user_is_admin);

  const tabs = useMemo(() => {
    const customLabel = typeIsSet ? "Eigenschappen" : "Eigenschappen (kies type)";

    return [
      {
        key: "atrium",
        label: "Atriumdata",
        Icon: IdCardIcon,
        content: (
          <AtriumTab
            ref={atriumRef}
            catalog={catalog}
            installation={installation}
            isAdmin={isAdmin}
            onAnyOpenChange={(v) => setAnyOpen("atrium", v)}
          />
        ),
      },
      {
        key: "custom",
        label: customLabel,
        Icon: TornadoIcon,
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
            onAnyOpenChange={(v) => setAnyOpen("custom", v)}
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
        Icon: FileStackIcon,
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
      {
        key: "energy",
        label: "Energievoorziening",
        Icon: BatteryIcon,
        content: (
          <EnergySupplyTab
            ref={energySaveRef}
            code={code}
            items={energySupplies || []}
            brandTypes={energyBrandTypes || []}
            onDirtyChange={setEnergyDirty}
            onSavingChange={setEnergySaving}
            onSaveOk={() => {
              setEnergySaveOk(true);
              if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current);
              saveOkTimerRef.current = setTimeout(() => setEnergySaveOk(false), 2500);
            }}
            onSaved={reloadEnergySupplies}
            onAnyOpenChange={(v) => setAnyOpen("energy", v)}
          />
        ),
      },
    ];
  }, [
    catalog,
    installation,
    docs,
    code,
    customValues,
    typeIsSet,
    installationTypes,
    typeSaving,
    energySupplies,
    energyBrandTypes,
    isAdmin,
  ]);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  const showHeaderSave = (activeTab === "custom" && typeIsSet) || activeTab === "documents" || activeTab === "energy";

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

          {/* rechts: collapse/expand all + save */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {showCollapseAllToggle && (
              <button
                type="button"
                className="icon-btn"
                title={collapseBtnTitle}
                onClick={() => {
                  const api = getActiveExpandRef();
                  if (!api) return;

                  if (anyOpenInActiveTab) api.collapseAll?.();
                  else api.expandAll?.();
                }}
                onMouseEnter={() => collapseAllIconRef.current?.startAnimation?.()}
                onMouseLeave={() => collapseAllIconRef.current?.stopAnimation?.()}
              >
                <CollapseIcon ref={collapseAllIconRef} size={18} className="nav-anim-icon" />
              </button>
            )}

            {showHeaderSave && (
              <SaveButton
                disabled={activeTab === "custom" ? !customDirty : activeTab === "documents" ? !docsDirty : !energyDirty}
                saving={activeTab === "custom" ? customSaving : activeTab === "documents" ? docsSaving : energySaving}
                saved={activeTab === "custom" ? customSaveOk : activeTab === "documents" ? docsSaveOk : energySaveOk}
                pulse={activeTab === "custom" ? customDirty : activeTab === "documents" ? docsDirty : energyDirty}
                onClick={() => {
                  if (activeTab === "custom") customSaveRef.current?.save?.();
                  if (activeTab === "documents") docsSaveRef.current?.save?.();
                  if (activeTab === "energy") energySaveRef.current?.save?.();
                }}
              />
            )}
          </div>
        </div>

        <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      <div className="inst-body">
        {error && <p style={{ color: "salmon" }}>{error}</p>}
        {!installation && !catalog && !customValues && !docs && !energySupplies && !energyBrandTypes && !error && (
          <p>laden</p>
        )}
        {activeContent}
      </div>
    </div>
  );
}
