// src/pages/Admin/AdminInstallationsTab.jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Tabs from "../../components/Tabs.jsx";
import { CogIcon } from "@/components/ui/cog";
import { TornadoIcon } from "@/components/ui/tornado";
import { FileStackIcon } from "@/components/ui/file-stack";
import { BookTextIcon } from "@/components/ui/book-text.jsx";

import {
  getAdminInstallationsCatalog,
  saveAdminInstallationTypes,
  saveAdminInstallationSections,
  saveAdminInstallationFields,
  saveAdminInstallationDocuments,
  saveAdminInstallationExternalFields,
} from "../../api/emberApi.js";

import AdminInstallationTypesTab from "./AdminInstallationTypesTab.jsx";
import AdminInstallationFieldsTab from "./AdminInstallationFieldsTab.jsx";
import AdminInstallationDocumentsTab from "./AdminInstallationDocumentsTab.jsx";
import AdminInstallationExternalFieldsTab from "./AdminInstallationExternalFieldsTab.jsx";

const EMPTY_HEADER_STATE = {
  visible: false,
  disabled: true,
  saving: false,
  saved: false,
  pulse: false,
};

const AdminInstallationsTab = forwardRef(function AdminInstallationsTab(
  { onHeaderSaveStateChange },
  ref
) {
  const typesRef = useRef(null);
  const fieldsRef = useRef(null);
  const documentsRef = useRef(null);
  const externalFieldsRef = useRef(null);

  const [activeTab, setActiveTab] = useState("types");
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [typesDirty, setTypesDirty] = useState(false);
  const [typesSaving, setTypesSaving] = useState(false);
  const [typesSaveOk, setTypesSaveOk] = useState(false);

  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [fieldsSaving, setFieldsSaving] = useState(false);
  const [fieldsSaveOk, setFieldsSaveOk] = useState(false);

  const [documentsDirty, setDocumentsDirty] = useState(false);
  const [documentsSaving, setDocumentsSaving] = useState(false);
  const [documentsSaveOk, setDocumentsSaveOk] = useState(false);

  const [externalFieldsDirty, setExternalFieldsDirty] = useState(false);
  const [externalFieldsSaving, setExternalFieldsSaving] = useState(false);
  const [externalFieldsSaveOk, setExternalFieldsSaveOk] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const res = await getAdminInstallationsCatalog();
      setCatalog(res || null);
    } catch (e) {
      setError(e?.message || String(e));
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function hasUnsavedChanges() {
    if (activeTab === "types") return typesDirty && !typesSaving;
    if (activeTab === "fields") return fieldsDirty && !fieldsSaving;
    if (activeTab === "documents") return documentsDirty && !documentsSaving;
    if (activeTab === "external_fields") return externalFieldsDirty && !externalFieldsSaving;
    return false;
  }

  function canSaveActiveTab() {
    if (activeTab === "types") return typesDirty && !typesSaving;
    if (activeTab === "fields") return fieldsDirty && !fieldsSaving;
    if (activeTab === "documents") return documentsDirty && !documentsSaving;
    if (activeTab === "external_fields") return externalFieldsDirty && !externalFieldsSaving;
    return false;
  }

  function saveActiveTab() {
    if (activeTab === "types") {
      typesRef.current?.save?.();
      return;
    }
    if (activeTab === "fields") {
      fieldsRef.current?.save?.();
      return;
    }
    if (activeTab === "documents") {
      documentsRef.current?.save?.();
      return;
    }
    if (activeTab === "external_fields") {
      externalFieldsRef.current?.save?.();
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
      activeTab === "types"
        ? {
            visible: true,
            disabled: !typesDirty,
            saving: typesSaving,
            saved: typesSaveOk,
            pulse: typesDirty,
          }
        : activeTab === "fields"
          ? {
              visible: true,
              disabled: !fieldsDirty,
              saving: fieldsSaving,
              saved: fieldsSaveOk,
              pulse: fieldsDirty,
            }
          : activeTab === "documents"
            ? {
                visible: true,
                disabled: !documentsDirty,
                saving: documentsSaving,
                saved: documentsSaveOk,
                pulse: documentsDirty,
              }
            : {
                visible: true,
                disabled: !externalFieldsDirty,
                saving: externalFieldsSaving,
                saved: externalFieldsSaveOk,
                pulse: externalFieldsDirty,
              };

    onHeaderSaveStateChange?.(nextState);
  }, [
    activeTab,
    typesDirty,
    typesSaving,
    typesSaveOk,
    fieldsDirty,
    fieldsSaving,
    fieldsSaveOk,
    documentsDirty,
    documentsSaving,
    documentsSaveOk,
    externalFieldsDirty,
    externalFieldsSaving,
    externalFieldsSaveOk,
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
        key: "types",
        label: "Installatiesoorten",
        Icon: CogIcon,
        content: (
          <AdminInstallationTypesTab
            ref={typesRef}
            catalog={catalog}
            loading={loading}
            onDirtyChange={setTypesDirty}
            onSavingChange={setTypesSaving}
            onSaveOk={() => {
              setTypesSaveOk(true);
              window.setTimeout(() => setTypesSaveOk(false), 2000);
            }}
            onSave={async (items) => {
              const res = await saveAdminInstallationTypes(items);
              setCatalog(res || null);
            }}
          />
        ),
      },
      {
        key: "fields",
        label: "Eigenschappen",
        Icon: TornadoIcon,
        content: (
          <AdminInstallationFieldsTab
            ref={fieldsRef}
            catalog={catalog}
            loading={loading}
            onDirtyChange={setFieldsDirty}
            onSavingChange={setFieldsSaving}
            onSaveOk={() => {
              setFieldsSaveOk(true);
              window.setTimeout(() => setFieldsSaveOk(false), 2000);
            }}
            onSaveSections={async (items) => {
              const res = await saveAdminInstallationSections(items);
              setCatalog(res || null);
            }}
            onSaveFields={async (items) => {
              const res = await saveAdminInstallationFields(items);
              setCatalog(res || null);
            }}
          />
        ),
      },
      {
        key: "documents",
        label: "Documenttypes",
        Icon: FileStackIcon,
        content: (
          <AdminInstallationDocumentsTab
            ref={documentsRef}
            catalog={catalog}
            loading={loading}
            onDirtyChange={setDocumentsDirty}
            onSavingChange={setDocumentsSaving}
            onSaveOk={() => {
              setDocumentsSaveOk(true);
              window.setTimeout(() => setDocumentsSaveOk(false), 2000);
            }}
            onSave={async (items) => {
              const res = await saveAdminInstallationDocuments(items);
              setCatalog(res || null);
            }}
          />
        ),
      },
      {
        key: "external_fields",
        label: "Atriumvelden",
        Icon: BookTextIcon,
        content: (
          <AdminInstallationExternalFieldsTab
            ref={externalFieldsRef}
            catalog={catalog}
            loading={loading}
            onDirtyChange={setExternalFieldsDirty}
            onSavingChange={setExternalFieldsSaving}
            onSaveOk={() => {
              setExternalFieldsSaveOk(true);
              window.setTimeout(() => setExternalFieldsSaveOk(false), 2000);
            }}
            onSave={async (items) => {
              const res = await saveAdminInstallationExternalFields(items);
              setCatalog(res || null);
            }}
          />
        ),
      },
    ];
  }, [catalog, loading]);

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

export default AdminInstallationsTab;