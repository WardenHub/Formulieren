// /src/pages/Admin/AdminFormsTab.jsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import AdminFormsVersionsTab from "./AdminFormsVersionsTab.jsx";
import AdminFormsConfigTab from "./AdminFormsConfigTab.jsx";
import { FileTextIcon } from "@/components/ui/file-text";
import { CogIcon } from "@/components/ui/cog";

const MOCK_FORMS = [
  {
    form_id: "11111111-1111-1111-1111-111111111111",
    code: "MAINT_BMI_OAI_TYPE_A",
    name: "Onderhoud BMI + OAI (type B)",
    description: "POC formulier voor onderhoud BMI/OAI",
    status: "A",
    sort_order: 20,
    latest_version: 3,
    latest_version_label: "1.2",
    version_count: 3,
    active_survey_json: {
      title: "Onderhoud BMI + OAI (type B)",
      pages: [],
    },
    versions: [
      {
        form_version_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        version: 3,
        version_label: "1.2",
        published_at: "2026-03-24T08:30:00Z",
        published_by: "admin@ember.local",
        is_latest: true,
        survey_json: {
          title: "Onderhoud BMI + OAI (type B)",
          pages: [],
        },
      },
      {
        form_version_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        version: 2,
        version_label: "1.1",
        published_at: "2026-03-10T11:00:00Z",
        published_by: "admin@ember.local",
        is_latest: false,
        survey_json: {
          title: "Onderhoud BMI + OAI (type B) v1.1",
          pages: [],
        },
      },
      {
        form_version_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
        version: 1,
        version_label: "1.0",
        published_at: null,
        published_by: null,
        is_latest: false,
        survey_json: {
          title: "Onderhoud BMI + OAI (type B) v1.0",
          pages: [],
        },
      },
    ],
    applicability_type_keys: ["BMI", "BMI_OAI"],
    preflight: {
      requires_type: true,
      perf_min_rows: 1,
      perf_severity: "blocking",
      energy_min_rows: 1,
      energy_severity: "warning",
      custom_min_filled: 1,
      custom_severity: "warning",
      is_active: true,
    },
  },
  {
    form_id: "22222222-2222-2222-2222-222222222222",
    code: "MEETRESULTATEN_B",
    name: "Meetresultaten (B)",
    description: "Meetresultaten batterij en melders",
    status: "M",
    sort_order: 10,
    latest_version: 2,
    latest_version_label: "2.0",
    version_count: 2,
    active_survey_json: {
      title: "Meetresultaten (B)",
      pages: [],
    },
    versions: [
      {
        form_version_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        version: 2,
        version_label: "2.0",
        published_at: "2026-03-22T12:00:00Z",
        published_by: "admin@ember.local",
        is_latest: true,
        survey_json: {
          title: "Meetresultaten (B)",
          pages: [],
        },
      },
      {
        form_version_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        version: 1,
        version_label: "1.0",
        published_at: null,
        published_by: null,
        is_latest: false,
        survey_json: {
          title: "Meetresultaten (B) v1.0",
          pages: [],
        },
      },
    ],
    applicability_type_keys: [],
    preflight: {
      requires_type: true,
      perf_min_rows: null,
      perf_severity: "warning",
      energy_min_rows: 1,
      energy_severity: "blocking",
      custom_min_filled: null,
      custom_severity: "warning",
      is_active: true,
    },
  },
];

const MOCK_INSTALLATION_TYPES = [
  { installation_type_key: "BMI", display_name: "BMI", is_active: true },
  { installation_type_key: "BMI_OAI", display_name: "BMI + OAI", is_active: true },
  { installation_type_key: "OAI_TYPE_A", display_name: "OAI Type A", is_active: true },
  { installation_type_key: "IBC", display_name: "IBC", is_active: false },
];

function sortForms(items) {
  return [...items].sort((a, b) => {
    const sa = Number(a?.sort_order ?? 0);
    const sb = Number(b?.sort_order ?? 0);
    if (sa !== sb) return sa - sb;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

const AdminFormsTab = forwardRef(function AdminFormsTab(
  { onHeaderSaveStateChange },
  ref
) {
  const versionsRef = useRef(null);
  const configRef = useRef(null);

  const [activeTab, setActiveTab] = useState("versions");
  const [forms, setForms] = useState(sortForms(MOCK_FORMS));
  const [selectedFormId, setSelectedFormId] = useState(MOCK_FORMS[0]?.form_id ?? null);

  const [versionsDirty, setVersionsDirty] = useState(false);
  const [versionsSaving, setVersionsSaving] = useState(false);
  const [versionsSaveOk, setVersionsSaveOk] = useState(false);

  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaveOk, setConfigSaveOk] = useState(false);

  const installationTypes = useMemo(() => {
    return MOCK_INSTALLATION_TYPES.filter((x) => x.is_active);
  }, []);

  const selectedForm = useMemo(() => {
    return forms.find((x) => x.form_id === selectedFormId) ?? null;
  }, [forms, selectedFormId]);

  useEffect(() => {
    if (!selectedFormId && forms.length > 0) {
      setSelectedFormId(forms[0].form_id);
    }
  }, [forms, selectedFormId]);

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
            onSelectForm={setSelectedFormId}
            onDirtyChange={setVersionsDirty}
            onSavingChange={setVersionsSaving}
            onSaveOk={() => {
              setVersionsSaveOk(true);
              window.setTimeout(() => setVersionsSaveOk(false), 2000);
            }}
            onPersistFormOrder={(orderedItems) => {
              setForms(sortForms(orderedItems));
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
              window.open("/dev/formdev", "_blank", "noopener,noreferrer");
            }}
            onCreateForm={(payload) => {
              const nextId = crypto.randomUUID();
              const nextItem = {
                form_id: nextId,
                code: payload.code,
                name: payload.name,
                description: payload.description || "",
                status: "M",
                sort_order: (forms.length + 1) * 10,
                latest_version: 0,
                latest_version_label: "-",
                version_count: 0,
                active_survey_json: {
                  title: payload.name,
                  pages: [],
                },
                versions: [],
                applicability_type_keys: [],
                preflight: {
                  requires_type: true,
                  perf_min_rows: null,
                  perf_severity: "warning",
                  energy_min_rows: null,
                  energy_severity: "warning",
                  custom_min_filled: null,
                  custom_severity: "warning",
                  is_active: true,
                },
              };

              setForms((prev) => sortForms([...prev, nextItem]));
              setSelectedFormId(nextId);
            }}
            onCreateVersionFromJsonText={(form, jsonText) => {
              const parsed = JSON.parse(String(jsonText || "{}"));

              setForms((prev) =>
                sortForms(
                  prev.map((item) => {
                    if (item.form_id !== form.form_id) return item;

                    const nextVersion = Number(item.latest_version || 0) + 1;
                    const nextVersionLabel = `${nextVersion}.0`;

                    const newVersionRow = {
                      form_version_id: crypto.randomUUID(),
                      version: nextVersion,
                      version_label: nextVersionLabel,
                      published_at: new Date().toISOString(),
                      published_by: "admin@ember.local",
                      is_latest: true,
                      survey_json: parsed,
                    };

                    const olderVersions = (item.versions || []).map((v) => ({
                      ...v,
                      is_latest: false,
                    }));

                    return {
                      ...item,
                      latest_version: nextVersion,
                      latest_version_label: nextVersionLabel,
                      version_count: olderVersions.length + 1,
                      active_survey_json: parsed,
                      versions: [newVersionRow, ...olderVersions],
                    };
                  })
                )
              );
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
            onSelectForm={setSelectedFormId}
            onDirtyChange={setConfigDirty}
            onSavingChange={setConfigSaving}
            onSaveOk={() => {
              setConfigSaveOk(true);
              window.setTimeout(() => setConfigSaveOk(false), 2000);
            }}
            onSaveConfig={(nextConfig) => {
              setForms((prev) =>
                sortForms(
                  prev.map((item) => {
                    if (item.form_id !== nextConfig.form_id) return item;
                    return {
                      ...item,
                      name: nextConfig.name,
                      description: nextConfig.description,
                      status: nextConfig.status,
                      applicability_type_keys: nextConfig.applicability_type_keys,
                      preflight: {
                        ...item.preflight,
                        ...nextConfig.preflight,
                      },
                    };
                  })
                )
              );
            }}
          />
        ),
      },
    ];
  }, [forms, selectedFormId, selectedForm, installationTypes]);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Tabs tabs={tabs} activeKey={activeTab} onChange={handleTabChange} />
      {activeContent}
    </div>
  );
});

export default AdminFormsTab;