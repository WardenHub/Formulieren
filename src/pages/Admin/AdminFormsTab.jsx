// /src/pages/Admin/AdminFormsTab.jsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
    sort_order: 10,
    latest_version: 3,
    latest_version_label: "1.2",
    version_count: 3,
    versions: [
      {
        form_version_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        version: 3,
        version_label: "1.2",
        published_at: "2026-03-24T08:30:00Z",
        published_by: "admin@ember.local",
        is_latest: true,
      },
      {
        form_version_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        version: 2,
        version_label: "1.1",
        published_at: "2026-03-10T11:00:00Z",
        published_by: "admin@ember.local",
        is_latest: false,
      },
      {
        form_version_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
        version: 1,
        version_label: "1.0",
        published_at: null,
        published_by: null,
        is_latest: false,
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
    sort_order: 20,
    latest_version: 2,
    latest_version_label: "2.0",
    version_count: 2,
    versions: [
      {
        form_version_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        version: 2,
        version_label: "2.0",
        published_at: "2026-03-22T12:00:00Z",
        published_by: "admin@ember.local",
        is_latest: true,
      },
      {
        form_version_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        version: 1,
        version_label: "1.0",
        published_at: null,
        published_by: null,
        is_latest: false,
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

export default function AdminFormsTab() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("versions");
  const [forms, setForms] = useState(MOCK_FORMS);
  const [selectedFormId, setSelectedFormId] = useState(MOCK_FORMS[0]?.form_id ?? null);

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

  const tabs = useMemo(() => {
    return [
      {
        key: "versions",
        label: "Versies",
        Icon: FileTextIcon,
        content: (
          <AdminFormsVersionsTab
            forms={forms}
            selectedFormId={selectedFormId}
            onSelectForm={setSelectedFormId}
            onOpenFormDev={(form) => {
              navigate("/dev/formdev", {
                state: {
                  source: "admin",
                  form_id: form?.form_id ?? null,
                  form_code: form?.code ?? null,
                },
              });
            }}
            onCreateVersion={(form) => {
              const latestVersion = Number(form?.latest_version || 0);
              const nextVersion = latestVersion + 1;

              setForms((prev) =>
                prev.map((item) => {
                  if (item.form_id !== form.form_id) return item;

                  const nextVersionRow = {
                    form_version_id: crypto.randomUUID(),
                    version: nextVersion,
                    version_label: `${nextVersion}.0`,
                    published_at: null,
                    published_by: null,
                    is_latest: true,
                  };

                  const older = (item.versions || []).map((v) => ({ ...v, is_latest: false }));

                  return {
                    ...item,
                    latest_version: nextVersion,
                    latest_version_label: nextVersionRow.version_label,
                    version_count: older.length + 1,
                    versions: [nextVersionRow, ...older],
                  };
                })
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
            forms={forms}
            selectedFormId={selectedFormId}
            selectedForm={selectedForm}
            installationTypes={installationTypes}
            onSelectForm={setSelectedFormId}
            onSaveConfig={(nextConfig) => {
              setForms((prev) =>
                prev.map((item) => {
                  if (item.form_id !== nextConfig.form_id) return item;
                  return {
                    ...item,
                    name: nextConfig.name,
                    description: nextConfig.description,
                    status: nextConfig.status,
                    sort_order: nextConfig.sort_order,
                    applicability_type_keys: nextConfig.applicability_type_keys,
                    preflight: {
                      ...item.preflight,
                      ...nextConfig.preflight,
                    },
                  };
                })
              );
            }}
          />
        ),
      },
    ];
  }, [forms, navigate, selectedFormId, selectedForm, installationTypes]);

  const activeContent = useMemo(() => {
    return tabs.find((t) => t.key === activeTab)?.content ?? null;
  }, [tabs, activeTab]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      {activeContent}
    </div>
  );
}