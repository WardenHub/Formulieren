// /src/pages/Admin/AdminFormsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import { BrainIcon } from "@/components/ui/brain";
import { CogIcon } from "@/components/ui/cog";

import {
  createAdminForm,
  createAdminFormVersion,
  getAdminForm,
  getAdminForms,
  getAdminInstallationsCatalog,
  saveAdminFormConfig,
  saveAdminFormsOrder,
} from "../../api/emberApi.js";

import AdminFormsVersionsTab from "./AdminFormsVersionsTab.jsx";
import AdminFormsConfigTab from "./AdminFormsConfigTab.jsx";

const EMPTY_HEADER_STATE = {
  visible: false,
  disabled: true,
  saving: false,
  saved: false,
  pulse: false,
};

function normalizeFormsResponse(res) {
  return Array.isArray(res?.items) ? res.items : [];
}

function normalizeInstallationTypesResponse(res) {
  return Array.isArray(res?.installationTypes) ? res.installationTypes : [];
}

function getErrorMessage(error, fallback = "Onbekende fout") {
  return String(error?.message || error || fallback);
}

const AdminFormsTab = forwardRef(function AdminFormsTab({ onHeaderSaveStateChange }, ref) {
  const versionsRef = useRef(null);
  const configRef = useRef(null);

  const [activeTab, setActiveTab] = useState("versions");

  const [forms, setForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [selectedForm, setSelectedForm] = useState(null);
  const [installationTypes, setInstallationTypes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  const [versionsDirty, setVersionsDirty] = useState(false);
  const [versionsSaving, setVersionsSaving] = useState(false);
  const [versionsSaveOk, setVersionsSaveOk] = useState(false);

  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaveOk, setConfigSaveOk] = useState(false);

  async function refreshFormsList(preferredFormId = selectedFormId) {
    const res = await getAdminForms();
    const nextForms = normalizeFormsResponse(res);

    setForms(nextForms);

    const preferred =
      preferredFormId &&
      nextForms.some((form) => String(form.form_id) === String(preferredFormId))
        ? preferredFormId
        : null;

    const nextSelectedFormId = preferred || nextForms[0]?.form_id || null;
    setSelectedFormId(nextSelectedFormId);

    if (!nextSelectedFormId) {
      setSelectedForm(null);
    }

    return {
      forms: nextForms,
      selectedFormId: nextSelectedFormId,
    };
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [formsResult, installationCatalogResult] = await Promise.allSettled([
        getAdminForms(),
        getAdminInstallationsCatalog(),
      ]);

      if (formsResult.status === "rejected") {
        throw formsResult.reason;
      }

      const nextForms = normalizeFormsResponse(formsResult.value);
      setForms(nextForms);

      const nextSelectedFormId =
        selectedFormId &&
        nextForms.some((form) => String(form.form_id) === String(selectedFormId))
          ? selectedFormId
          : nextForms[0]?.form_id || null;

      setSelectedFormId(nextSelectedFormId);

      if (installationCatalogResult.status === "fulfilled") {
        setInstallationTypes(normalizeInstallationTypesResponse(installationCatalogResult.value));
      } else {
        setInstallationTypes([]);
        setError(
          `Formulieren geladen, maar installatietypes konden niet worden geladen; ${getErrorMessage(
            installationCatalogResult.reason
          )}`
        );
      }
    } catch (e) {
      setForms([]);
      setSelectedFormId(null);
      setSelectedForm(null);
      setError(`Formulieren laden mislukt; ${getErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedForm() {
      if (!selectedFormId) {
        setSelectedForm(null);
        return;
      }

      setDetailLoading(true);

      try {
        const res = await getAdminForm(selectedFormId);
        if (cancelled) return;

        setSelectedForm(res?.item || null);
      } catch (e) {
        if (cancelled) return;

        setSelectedForm(null);
        setError(`Formulierdetails laden mislukt; ${getErrorMessage(e)}`);
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadSelectedForm();

    return () => {
      cancelled = true;
    };
  }, [selectedFormId]);

  function hasUnsavedChanges() {
    if (activeTab === "versions") return versionsDirty && !versionsSaving;
    if (activeTab === "config") return configDirty && !configSaving;
    return false;
  }

  function canSaveActiveTab() {
    if (activeTab === "versions") return versionsDirty && !versionsSaving;
    if (activeTab === "config") return configDirty && !configSaving;
    return false;
  }

  function saveActiveTab() {
    if (activeTab === "versions") {
      versionsRef.current?.save?.();
      return;
    }

    if (activeTab === "config") {
      configRef.current?.save?.();
    }
  }

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges,
    canSaveActiveTab,
    saveActiveTab,
  }));

  function confirmLeaveTab(nextTabKey) {
    if (nextTabKey === activeTab) return true;
    if (!hasUnsavedChanges()) return true;
    return window.confirm("Je hebt niet-opgeslagen wijzigingen. Weet je zeker dat je wilt doorgaan?");
  }

  function handleTabChange(nextTabKey) {
    if (!confirmLeaveTab(nextTabKey)) return;
    setActiveTab(nextTabKey);
  }

  useEffect(() => {
    const nextState =
      activeTab === "versions"
        ? {
            visible: true,
            disabled: !versionsDirty,
            saving: versionsSaving,
            saved: versionsSaveOk,
            pulse: versionsDirty,
          }
        : {
            visible: true,
            disabled: !configDirty,
            saving: configSaving,
            saved: configSaveOk,
            pulse: configDirty,
          };

    onHeaderSaveStateChange?.(nextState);
  }, [
    activeTab,
    versionsDirty,
    versionsSaving,
    versionsSaveOk,
    configDirty,
    configSaving,
    configSaveOk,
    onHeaderSaveStateChange,
  ]);

  useEffect(() => {
    return () => {
      onHeaderSaveStateChange?.(EMPTY_HEADER_STATE);
    };
  }, [onHeaderSaveStateChange]);

  async function handlePersistFormOrder(items) {
    try {
      setError(null);
      await saveAdminFormsOrder(items);
      await refreshFormsList(selectedFormId);
    } catch (e) {
      const message = `Sorteervolgorde opslaan mislukt; ${getErrorMessage(e)}`;
      setError(message);
      window.alert(message);
    }
  }

  async function handleCreateForm(payload) {
    try {
      setError(null);

      const res = await createAdminForm(payload);
      const item = res?.item || null;

      const nextFormId = item?.form_id || null;
      await refreshFormsList(nextFormId);

      if (item) {
        setSelectedForm(item);
        setSelectedFormId(item.form_id);
      }

      setActiveTab("config");
    } catch (e) {
      const message = `Formulier aanmaken mislukt; ${getErrorMessage(e)}`;
      setError(message);
      window.alert(message);
    }
  }

  async function handleSaveConfig(payload) {
    if (!payload?.form_id) {
      const message = "Formulierconfiguratie opslaan mislukt; form_id ontbreekt";
      setError(message);
      window.alert(message);
      return;
    }

    try {
      setError(null);

      const res = await saveAdminFormConfig(payload.form_id, payload);
      const item = res?.item || null;

      await refreshFormsList(payload.form_id);

      if (item) {
        setSelectedForm(item);
        setSelectedFormId(item.form_id);
      }
    } catch (e) {
      const message = `Formulierconfiguratie opslaan mislukt; ${getErrorMessage(e)}`;
      setError(message);
      window.alert(message);
    }
  }

  async function handleCreateVersionFromJsonText(form, surveyJsonText) {
    const formId = form?.form_id;

    if (!formId) {
      const message = "Nieuwe versie toevoegen mislukt; form_id ontbreekt";
      setError(message);
      window.alert(message);
      return;
    }

    try {
      setError(null);

      const res = await createAdminFormVersion(formId, {
        survey_json: surveyJsonText,
      });

      const item = res?.item || null;

      await refreshFormsList(formId);

      if (item) {
        setSelectedForm(item);
        setSelectedFormId(item.form_id);
      }
    } catch (e) {
      const message = `Nieuwe formulierdefinitie toevoegen mislukt; ${getErrorMessage(e)}`;
      setError(message);
      window.alert(message);
    }
  }

  function handleOpenFormDev(form) {
    if (!form) return;

    const activeSurveyJson =
      form.active_survey_json ||
      (Array.isArray(form.versions) && form.versions.length > 0
        ? form.versions[0]?.survey_json
        : null) ||
      {
        title: form.name || form.code || "Nieuw formulier",
        pages: [],
      };

    const bootstrap = {
      source: "admin",
      form_id: form.form_id,
      code: form.code,
      name: form.name,
      description: form.description ?? null,
      survey_json: activeSurveyJson,
    };

    window.sessionStorage.setItem("ember.formDesigner.bootstrap", JSON.stringify(bootstrap));
    window.open("/dev/formdev", "_blank", "noopener,noreferrer");
  }

  const tabs = useMemo(() => {
    return [
      {
        key: "versions",
        label: "Versies",
        Icon: BrainIcon,
        content: (
          <AdminFormsVersionsTab
            ref={versionsRef}
            forms={forms}
            selectedFormId={selectedFormId}
            selectedForm={selectedForm}
            loading={loading || detailLoading}
            onSelectForm={setSelectedFormId}
            onDirtyChange={setVersionsDirty}
            onSavingChange={setVersionsSaving}
            onSaveOk={() => {
              setVersionsSaveOk(true);
              window.setTimeout(() => setVersionsSaveOk(false), 2000);
            }}
            onPersistFormOrder={handlePersistFormOrder}
            onOpenFormDev={handleOpenFormDev}
            onCreateForm={handleCreateForm}
            onCreateVersionFromJsonText={handleCreateVersionFromJsonText}
          />
        ),
      },
      {
        key: "config",
        label: "Configuratie",
        Icon: CogIcon,
        content: (
          <AdminFormsConfigTab
            ref={configRef}
            forms={forms}
            selectedFormId={selectedFormId}
            selectedForm={selectedForm}
            installationTypes={installationTypes}
            loading={loading || detailLoading}
            onSelectForm={setSelectedFormId}
            onDirtyChange={setConfigDirty}
            onSavingChange={setConfigSaving}
            onSaveOk={() => {
              setConfigSaveOk(true);
              window.setTimeout(() => setConfigSaveOk(false), 2000);
            }}
            onSaveConfig={handleSaveConfig}
          />
        ),
      },
    ];
  }, [
    forms,
    selectedFormId,
    selectedForm,
    installationTypes,
    loading,
    detailLoading,
  ]);

  const activeContent = useMemo(() => {
    return tabs.find((tab) => tab.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Tabs tabs={tabs} activeKey={activeTab} onChange={handleTabChange} />

      {error ? <div className="ember-error-text">{error}</div> : null}

      {activeContent}
    </div>
  );
});

export default AdminFormsTab;