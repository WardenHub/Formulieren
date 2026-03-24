// /src/pages/Admin/AdminFormsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import AdminFormsVersionsTab from "./AdminFormsVersionsTab.jsx";
import AdminFormsConfigTab from "./AdminFormsConfigTab.jsx";
import { FileTextIcon } from "@/components/ui/file-text";
import { CogIcon } from "@/components/ui/cog";
import {
  getAdminForms,
  getAdminForm,
  createAdminForm,
  saveAdminFormsOrder,
  saveAdminFormConfig,
  createAdminFormVersion,
  getInstallationTypes,
} from "../../api/emberApi.js";

function sortForms(items) {
  return [...items].sort((a, b) => {
    const sa = Number(a?.sort_order ?? 0);
    const sb = Number(b?.sort_order ?? 0);
    if (sa !== sb) return sa - sb;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

const EMPTY_HEADER_STATE = {
  visible: false,
  disabled: true,
  saving: false,
  saved: false,
  pulse: false,
};

const AdminFormsTab = forwardRef(function AdminFormsTab(
  { onHeaderSaveStateChange },
  ref
) {
  const versionsRef = useRef(null);
  const configRef = useRef(null);

  const [activeTab, setActiveTab] = useState("versions");

  const [forms, setForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [selectedForm, setSelectedForm] = useState(null);
  const [installationTypes, setInstallationTypes] = useState([]);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);

  const [versionsDirty, setVersionsDirty] = useState(false);
  const [versionsSaving, setVersionsSaving] = useState(false);
  const [versionsSaveOk, setVersionsSaveOk] = useState(false);

  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaveOk, setConfigSaveOk] = useState(false);

  async function loadFormsList({ preferredFormId } = {}) {
    setLoadingList(true);
    setError(null);

    try {
      const res = await getAdminForms();
      const items = sortForms(Array.isArray(res?.items) ? res.items : []);
      setForms(items);

      const nextSelectedId =
        preferredFormId ||
        (items.some((x) => x.form_id === selectedFormId) ? selectedFormId : null) ||
        items[0]?.form_id ||
        null;

      setSelectedFormId(nextSelectedId);
      return { items, nextSelectedId };
    } catch (e) {
      setError(e?.message || String(e));
      setForms([]);
      setSelectedFormId(null);
      return { items: [], nextSelectedId: null };
    } finally {
      setLoadingList(false);
    }
  }

  async function loadFormDetail(formId) {
    const cleanId = String(formId || "").trim();
    if (!cleanId) {
      setSelectedForm(null);
      return null;
    }

    setLoadingDetail(true);
    setError(null);

    try {
      const res = await getAdminForm(cleanId);
      const item = res?.item || null;
      setSelectedForm(item);
      return item;
    } catch (e) {
      setError(e?.message || String(e));
      setSelectedForm(null);
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }

  async function reloadAll({ preferredFormId } = {}) {
    const { nextSelectedId } = await loadFormsList({ preferredFormId });
    if (nextSelectedId) {
      await loadFormDetail(nextSelectedId);
    } else {
      setSelectedForm(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [typesRes, formsRes] = await Promise.all([
          getInstallationTypes(),
          getAdminForms(),
        ]);

        if (cancelled) return;

        const activeTypes = Array.isArray(typesRes?.types)
          ? typesRes.types.filter((x) => x?.is_active)
          : [];
        setInstallationTypes(activeTypes);

        const items = sortForms(Array.isArray(formsRes?.items) ? formsRes.items : []);
        setForms(items);

        const firstId = items[0]?.form_id ?? null;
        setSelectedFormId(firstId);

        if (firstId) {
          setLoadingDetail(true);
          try {
            const detailRes = await getAdminForm(firstId);
            if (!cancelled) setSelectedForm(detailRes?.item || null);
          } finally {
            if (!cancelled) setLoadingDetail(false);
          }
        } else {
          setSelectedForm(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setForms([]);
          setSelectedFormId(null);
          setSelectedForm(null);
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedFormId) {
      setSelectedForm(null);
      return;
    }

    if (selectedForm?.form_id === selectedFormId) return;

    loadFormDetail(selectedFormId);
  }, [selectedFormId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const tabs = useMemo(() => {
    return [
      {
        key: "versions",
        label: "Versies",
        Icon: FileTextIcon,
        content: (
          <AdminFormsVersionsTab
            ref={versionsRef}
            forms={forms}
            selectedFormId={selectedFormId}
            selectedForm={selectedForm}
            loading={loadingList || loadingDetail}
            onSelectForm={setSelectedFormId}
            onDirtyChange={setVersionsDirty}
            onSavingChange={setVersionsSaving}
            onSaveOk={() => {
              setVersionsSaveOk(true);
              window.setTimeout(() => setVersionsSaveOk(false), 2000);
            }}
            onPersistFormOrder={async (orderedItems) => {
              const payload = orderedItems.map((item, index) => ({
                form_id: item.form_id,
                sort_order: Number(item?.sort_order ?? (index + 1) * 10),
              }));

              await saveAdminFormsOrder(payload);
              await reloadAll({ preferredFormId: selectedFormId });
            }}
            onOpenFormDev={(form) => {
              const bootstrap = {
                source: "admin",
                form_id: form?.form_id ?? null,
                form_code: form?.code ?? null,
                form_name: form?.name ?? null,
                survey_json: form?.active_survey_json ?? null,
                opened_at: new Date().toISOString(),
              };

              sessionStorage.setItem("admin.formdev.bootstrap", JSON.stringify(bootstrap));
              window.open("/dev/formdev", "_blank", "noopener");
            }}
            onCreateForm={async (payload) => {
              const res = await createAdminForm(payload);
              const newId = res?.item?.form_id || null;
              await reloadAll({ preferredFormId: newId });
            }}
            onCreateVersionFromJsonText={async (form, jsonText) => {
              await createAdminFormVersion(form.form_id, {
                survey_json: JSON.parse(String(jsonText || "{}")),
              });
              await reloadAll({ preferredFormId: form.form_id });
            }}
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
            loading={loadingList || loadingDetail}
            onSelectForm={setSelectedFormId}
            onDirtyChange={setConfigDirty}
            onSavingChange={setConfigSaving}
            onSaveOk={() => {
              setConfigSaveOk(true);
              window.setTimeout(() => setConfigSaveOk(false), 2000);
            }}
            onSaveConfig={async (nextConfig) => {
              await saveAdminFormConfig(nextConfig.form_id, nextConfig);
              await reloadAll({ preferredFormId: nextConfig.form_id });
            }}
          />
        ),
      },
    ];
  }, [
    forms,
    selectedFormId,
    selectedForm,
    installationTypes,
    loadingList,
    loadingDetail,
    activeTab,
  ]);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Tabs tabs={tabs} activeKey={activeTab} onChange={handleTabChange} />

      {error && <div style={{ color: "salmon" }}>{error}</div>}
      {activeContent}
    </div>
  );
});

export default AdminFormsTab;