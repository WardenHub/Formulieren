import { useEffect, useMemo, useState } from "react";
import { HardDriveDownload, Info, Trash2, WifiOff } from "lucide-react";
import OfflineDetailPanel from "./components/OfflineDetailPanel.jsx";
import OnlineFormPickupPanel from "./components/OnlineFormPickupPanel.jsx";
import OfflinePackageImportPanel from "./components/OfflinePackageImportPanel.jsx";
import OfflineRunnerPanel from "./components/OfflineRunnerPanel.jsx";
import OfflineWorklist from "./components/OfflineWorklist.jsx";
import SummaryCard from "./components/SummaryCard.jsx";
import { buildOfflineCounts, mergeOfflinePackage, normalizeOfflinePackage } from "./lib/packageParser.js";
import {
  deleteOfflinePackage,
  deleteOfflineDocuments,
  getOfflinePackage,
  listOfflinePackages,
  saveOfflinePackage,
} from "./lib/offlineStore.js";
import { removeDocumentFolder } from "./lib/offlineFiles.js";
import { withdrawFormInstance } from "./lib/emberOfflineApi.js";
import { getDesktopAuthSession } from "./lib/desktopAuth.js";

const HOW_IT_WORKS_STORAGE_KEY = "ember-offline-hide-how-it-works";

function downloadTextFile(fileName, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [activeView, setActiveView] = useState("detail");
  const [workspaceMode, setWorkspaceMode] = useState("werkvoorraad");
  const [onlineMode, setOnlineMode] = useState("online_ophalen");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [hideHowItWorks, setHideHowItWorks] = useState(false);
  const [showClearWorklist, setShowClearWorklist] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [legacyDeleteConfirmed, setLegacyDeleteConfirmed] = useState(false);

  useEffect(() => {
    const shouldHide = window.localStorage.getItem(HOW_IT_WORKS_STORAGE_KEY) === "1";
    setHideHowItWorks(shouldHide);
    setShowHowItWorks(!shouldHide);
  }, []);

  function closeHowItWorks() {
    if (hideHowItWorks) {
      window.localStorage.setItem(HOW_IT_WORKS_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(HOW_IT_WORKS_STORAGE_KEY);
    }
    setShowHowItWorks(false);
  }

  async function refreshPackages(preferredId = null) {
    setLoading(true);
    try {
      const nextItems = await listOfflinePackages();
      setItems(nextItems);
      setSelectedId((current) => {
        if (preferredId && nextItems.some((item) => item.id === preferredId)) return preferredId;
        if (current && nextItems.some((item) => item.id === current)) return current;
        return nextItems[0]?.id || null;
      });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshPackages();
  }, []);

  const counts = useMemo(() => buildOfflineCounts(items), [items]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      if (statusFilter !== "alle" && item.local_status !== statusFilter) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        item.summary?.title,
        item.summary?.installation_code,
        item.summary?.installation_name,
        item.summary?.form_code,
        item.summary?.bedrijf_unit,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [items, query, statusFilter]);
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    if (!selectedId && filteredItems[0]?.id) {
      setSelectedId(filteredItems[0].id);
      return;
    }
    if (selectedId && !filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id || null);
    }
  }, [filteredItems, selectedId]);

  useEffect(() => {
    if (!selectedItem && activeView !== "detail") {
      setActiveView("detail");
    }
  }, [activeView, selectedItem]);

  async function handleFilesSelected(files) {
    setBusy(true);
    setError("");
    setImportMessage("");

    try {
      let lastImportedId = null;

      for (const file of files) {
        const rawText = await file.text();
        const merged = await persistOfflinePackage(JSON.parse(rawText), file.name);
        lastImportedId = merged.id;
      }

      await refreshPackages(lastImportedId);
      setImportMessage(`${files.length} formulier(en) lokaal klaargezet.`);
    } catch (e) {
      setError(e?.message || "Het importeren van het offline formulier is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function persistOfflinePackage(packageData, sourceFileName) {
    const nextItem = normalizeOfflinePackage(packageData, sourceFileName);
    const existing = await getOfflinePackage(nextItem.id);
    const merged = mergeOfflinePackage(existing, nextItem);
    await saveOfflinePackage(merged);
    return merged;
  }

  async function handlePackagePrepared(packageData, sourceFileName) {
    setBusy(true);
    setError("");
    setImportMessage("");

    try {
      const merged = await persistOfflinePackage(packageData, sourceFileName);
      await refreshPackages(merged.id);
      setStatusFilter("alle");
      setActiveView("detail");
      setImportMessage("Formulier lokaal klaargezet.");
      return merged;
    } catch (e) {
      setError(e?.message || "Het lokaal klaarzetten van het formulier is mislukt.");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleSetStatus(id, nextStatus) {
    const current = await getOfflinePackage(id);
    if (!current) return;

    const updated = {
      ...current,
      local_status: nextStatus,
      needs_online_finish: nextStatus === "wacht_op_online_afronden",
      has_conflict: nextStatus === "conflict",
      local_updated_at: new Date().toISOString(),
      local_runtime: {
        ...current.local_runtime,
        last_local_saved_at:
          nextStatus === "lokaal_in_bewerking" || nextStatus === "lokaal_afgerond"
            ? new Date().toISOString()
            : current?.local_runtime?.last_local_saved_at || null,
        checklist: {
          package_checked: Boolean(current?.local_runtime?.checklist?.package_checked),
          documents_checked: Boolean(current?.local_runtime?.checklist?.documents_checked),
          ready_for_online_finish:
            nextStatus === "wacht_op_online_afronden"
              ? true
              : Boolean(current?.local_runtime?.checklist?.ready_for_online_finish),
        },
      },
    };

    await saveOfflinePackage(updated);
    await refreshPackages(id);
  }

  async function handleSaveNotes(id, runnerNotes) {
    const current = await getOfflinePackage(id);
    if (!current) return;

    await saveOfflinePackage({
      ...current,
      local_updated_at: new Date().toISOString(),
      local_runtime: {
        ...current.local_runtime,
        runner_notes: runnerNotes,
      },
    });

    await refreshPackages(id);
  }

  async function handleSaveChecklist(id, patch) {
    const current = await getOfflinePackage(id);
    if (!current) return;

    const nextChecklist = {
      package_checked: Boolean(current?.local_runtime?.checklist?.package_checked),
      documents_checked: Boolean(current?.local_runtime?.checklist?.documents_checked),
      ready_for_online_finish: Boolean(current?.local_runtime?.checklist?.ready_for_online_finish),
      ...patch,
    };

    let nextStatus = current.local_status;
    if (nextChecklist.ready_for_online_finish && nextStatus !== "gesynchroniseerd") {
      nextStatus = "wacht_op_online_afronden";
    }

    await saveOfflinePackage({
      ...current,
      local_status: nextStatus,
      needs_online_finish: nextChecklist.ready_for_online_finish || current.needs_online_finish,
      local_updated_at: new Date().toISOString(),
      local_runtime: {
        ...current.local_runtime,
        checklist: nextChecklist,
      },
    });

    await refreshPackages(id);
  }

  async function handleSaveAnswers(id, answersJson, savedAt) {
    const current = await getOfflinePackage(id);
    if (!current) return;

    const nextStatus =
      current.local_status === "klaargezet"
        ? "lokaal_in_bewerking"
        : current.local_status;

    await saveOfflinePackage({
      ...current,
      local_status: nextStatus,
      local_updated_at: savedAt || new Date().toISOString(),
      local_runtime: {
        ...current.local_runtime,
        answers_json: answersJson && typeof answersJson === "object" ? answersJson : {},
        last_local_saved_at: savedAt || new Date().toISOString(),
      },
    });

    await refreshPackages(id);
  }

  async function cancelOnlineFormBeforeRemoval(item, { allowLegacyLocalDelete = false } = {}) {
    const offlineOrigin = item?.package_data?.offline_origin;
    if (!offlineOrigin) {
      if (allowLegacyLocalDelete) return;
      throw new Error("Dit oudere pakket heeft geen herkomstinformatie. Het wordt niet verwijderd, omdat we niet veilig kunnen vaststellen of het online formulier eerst geannuleerd moet worden.");
    }
    if (!offlineOrigin.created_by_offline) return;
    const session = getDesktopAuthSession();
    const code = item?.summary?.installation_code;
    const instanceId = item?.summary?.form_instance_id;
    if (!session?.accessToken || !code || instanceId == null) {
      throw new Error("Dit lokale formulier is door Ember Offline aangemaakt. Meld je aan om het eerst online te annuleren.");
    }
    await withdrawFormInstance(session.accessToken, code, instanceId);
  }

  async function removeLocalItem(item, options) {
    await cancelOnlineFormBeforeRemoval(item, options);
    await removeDocumentFolder(item.id);
    await deleteOfflineDocuments(item.id);
    await deleteOfflinePackage(item.id);
  }

  async function handleDelete(item, options) {
    setBusy(true);
    setError("");
    try {
      await removeLocalItem(item, options);
      await refreshPackages();
      setDeleteCandidate(null);
    } catch (error) {
      setError(error?.message || "Het formulier kon niet veilig worden verwijderd.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearWorklist() {
    setBusy(true);
    setError("");
    try {
      for (const item of items) {
        await removeLocalItem(item);
      }
      await refreshPackages();
      setSelectedId(null);
      setShowClearWorklist(false);
    } catch (error) {
      setError(error?.message || "De lokale werkvoorraad kon niet volledig worden verwijderd.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadPackage(item) {
    downloadTextFile(item.source_file_name || `${item.id}.json`, JSON.stringify(item.package_data, null, 2));
  }

  function handleOpenOnline(item) {
    const target = item?.summary?.route_url;
    if (!target) return;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  if (workspaceMode === "werkvoorraad" && activeView === "runner") {
    return (
      <div className="eo-app eo-app--runner">
        <OfflineRunnerPanel
          item={selectedItem}
          onBack={() => setActiveView("detail")}
          onSaveAnswers={handleSaveAnswers}
          onSetStatus={handleSetStatus}
        />
      </div>
    );
  }

  return (
    <div className="eo-app">
      <header className="eo-hero">
        <div className="eo-hero__copy">
          <div className="eo-eyebrow">Ember Offline</div>
          <h1>Formulieren lokaal klaarzetten</h1>
          <p>
            Zet formulieren klaar, vul ze zonder internet in en rond ze later online af.
          </p>
        </div>

        <div className="eo-hero__status">
          <button type="button" className="eo-hero-chip eo-hero-chip--action" onClick={() => setShowHowItWorks(true)}>
            <Info size={18} />
            Info
          </button>
          <button
            type="button"
            className={`eo-hero-chip eo-hero-chip--action${workspaceMode === "werkvoorraad" ? " is-current" : ""}`}
            onClick={() => setWorkspaceMode("werkvoorraad")}
          >
            <WifiOff size={18} />
            Offline formulieren
          </button>
          <button
            type="button"
            className={`eo-hero-chip eo-hero-chip--action${workspaceMode === "online" ? " is-current" : ""}`}
            onClick={() => setWorkspaceMode("online")}
          >
            <HardDriveDownload size={18} />
            Formulieren ophalen
          </button>
        </div>
      </header>

      <section className="eo-summary-grid">
        <SummaryCard
          label="Totaal lokaal"
          value={counts.total}
          tone="neutral"
          hint="Alle offline formulieren op dit apparaat."
          active={workspaceMode === "werkvoorraad" && statusFilter === "alle"}
          onClick={workspaceMode === "werkvoorraad" ? () => setStatusFilter("alle") : undefined}
        />
        <SummaryCard
          label="In bewerking"
          value={counts.lokaal_in_bewerking}
          tone="info"
          hint="Formulieren waar lokaal nog aan gewerkt wordt."
          active={workspaceMode === "werkvoorraad" && statusFilter === "lokaal_in_bewerking"}
          onClick={workspaceMode === "werkvoorraad" ? () => setStatusFilter("lokaal_in_bewerking") : undefined}
        />
        <SummaryCard
          label="Klaar voor online"
          value={counts.wacht_op_online_afronden}
          tone="warning"
          hint="Lokaal werk is gedaan; laatste stap moet weer online."
          active={workspaceMode === "werkvoorraad" && statusFilter === "wacht_op_online_afronden"}
          onClick={workspaceMode === "werkvoorraad" ? () => setStatusFilter("wacht_op_online_afronden") : undefined}
        />
        <SummaryCard
          label="Conflict"
          value={counts.conflict}
          tone="danger"
          hint="Online wijziging of revisieverschil vraagt aandacht."
          active={workspaceMode === "werkvoorraad" && statusFilter === "conflict"}
          onClick={workspaceMode === "werkvoorraad" ? () => setStatusFilter("conflict") : undefined}
        />
      </section>

      {showHowItWorks ? (
        <section className="eo-modal-backdrop" role="presentation">
          <div className="eo-modal" role="dialog" aria-modal="true" aria-labelledby="eo-how-it-works-title">
            <div className="eo-card__header">
              <div>
                <div id="eo-how-it-works-title" className="eo-section-title">Zo werkt het</div>
                <div className="eo-section-subtitle">
                  Zet een formulier klaar, vul het zonder internet in en rond het later online af.
                </div>
              </div>
            </div>

            <div className="eo-helper-list">
              <div className="eo-helper-item">
                <div className="eo-helper-item__step">1</div>
                <div>
                  <div className="eo-helper-item__title">Kies een formulier</div>
                  <div className="eo-helper-item__copy">
                    Haal het formulier rechtstreeks op vanuit Ember; of laad een json-formulier wanneer dat een keer handiger is.
                  </div>
                </div>
              </div>
              <div className="eo-helper-item">
                <div className="eo-helper-item__step">2</div>
                <div>
                  <div className="eo-helper-item__title">Offline invullen</div>
                  <div className="eo-helper-item__copy">
                    Werk lokaal door; ook als er tijdelijk geen internet beschikbaar is.
                  </div>
                </div>
              </div>
              <div className="eo-helper-item">
                <div className="eo-helper-item__step">3</div>
                <div>
                  <div className="eo-helper-item__title">Online afronden</div>
                  <div className="eo-helper-item__copy">
                    Wanneer het formulier klaar is, rond je de laatste stap weer in Ember online af.
                  </div>
                </div>
              </div>
            </div>

            <label className="eo-check-toggle">
              <input
                type="checkbox"
                checked={hideHowItWorks}
                onChange={(event) => setHideHowItWorks(event.target.checked)}
              />
              <span>Dit niet meer tonen</span>
            </label>

            <div className="eo-modal__actions">
              <button type="button" className="eo-btn eo-btn--primary" onClick={closeHowItWorks}>
                Begrepen
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showClearWorklist ? (
        <section className="eo-modal-backdrop" role="presentation">
          <div className="eo-modal" role="dialog" aria-modal="true" aria-labelledby="eo-clear-worklist-title">
            <div id="eo-clear-worklist-title" className="eo-section-title">Lokale werkvoorraad wissen?</div>
            <p className="eo-section-subtitle">Elk door Ember Offline aangemaakt formulier wordt eerst online geannuleerd. Alleen daarna verwijderen we de lokale formulieren en bestanden.</p>
            {error ? <p className="eo-message eo-message--error">{error}</p> : null}
            <div className="eo-modal__actions">
              <button type="button" className="eo-btn eo-btn--ghost" onClick={() => setShowClearWorklist(false)} disabled={busy}>Annuleren</button>
              <button type="button" className="eo-btn eo-btn--danger" onClick={handleClearWorklist} disabled={busy}><Trash2 size={18} />{busy ? "Verwijderen" : "Werkvoorraad wissen"}</button>
            </div>
          </div>
        </section>
      ) : null}

      {deleteCandidate ? (
        <section className="eo-modal-backdrop" role="presentation">
          <div className="eo-modal" role="dialog" aria-modal="true" aria-labelledby="eo-delete-offline-title">
            <div id="eo-delete-offline-title" className="eo-section-title">Dit formulier verwijderen?</div>
            <p className="eo-section-subtitle">{deleteCandidate?.package_data?.offline_origin ? "Het formulier wordt eerst in Ember online geannuleerd. Alleen als dat lukt, verwijderen we de lokale kopie en bestanden." : "Dit is een ouder pakket zonder herkomstinformatie. De online status kan niet meer automatisch worden vastgesteld."}</p>
            {error ? <p className="eo-message eo-message--error">{error}</p> : null}
            {!deleteCandidate?.package_data?.offline_origin ? <label className="eo-check-toggle"><input type="checkbox" checked={legacyDeleteConfirmed} onChange={(event) => setLegacyDeleteConfirmed(event.target.checked)} /><span>Ik heb gecontroleerd dat het online formulier niet meer nodig is. Verwijder alleen deze lokale kopie.</span></label> : null}
            <div className="eo-modal__actions">
              <button type="button" className="eo-btn eo-btn--ghost" onClick={() => setDeleteCandidate(null)} disabled={busy}>Annuleren</button>
              <button type="button" className="eo-btn eo-btn--danger" onClick={() => handleDelete(deleteCandidate, { allowLegacyLocalDelete: !deleteCandidate?.package_data?.offline_origin && legacyDeleteConfirmed })} disabled={busy || (!deleteCandidate?.package_data?.offline_origin && !legacyDeleteConfirmed)}><Trash2 size={18} />{busy ? "Verwijderen" : deleteCandidate?.package_data?.offline_origin ? "Online annuleren en verwijderen" : "Lokaal verwijderen"}</button>
            </div>
          </div>
        </section>
      ) : null}

      {workspaceMode === "online" ? (
        <div className="eo-online-layout">
          <section className="eo-card eo-online-card">
            <div className="eo-card__header">
              <div>
                <div className="eo-section-title">Formulieren ophalen</div>
                <div className="eo-section-subtitle">
                  Haal het formulier rechtstreeks op vanuit Ember; of laad een json-formulier wanneer dat een keer handiger is.
                </div>
              </div>
            </div>

            <div className="eo-subnav">
              <button
                type="button"
                className={`eo-filter-pill${onlineMode === "online_ophalen" ? " is-current" : ""}`}
                onClick={() => setOnlineMode("online_ophalen")}
              >
                Online ophalen
              </button>
              <button
                type="button"
                className={`eo-filter-pill${onlineMode === "json_import" ? " is-current" : ""}`}
                onClick={() => setOnlineMode("json_import")}
              >
                Json importeren
              </button>
            </div>

            {onlineMode === "online_ophalen" ? (
              <OnlineFormPickupPanel
                onPackagePrepared={handlePackagePrepared}
                onOpenOfflineWorklist={() => setWorkspaceMode("werkvoorraad")}
              />
            ) : (
              <OfflinePackageImportPanel
                busy={busy}
                importMessage={importMessage}
                error={error}
                onFilesSelected={handleFilesSelected}
                onClearError={() => setError("")}
              />
            )}
          </section>
        </div>
      ) : (
        <div className="eo-workspace">
          <div className="eo-workspace__main">
            <div className="eo-workspace__worklist">
              <OfflineWorklist
                items={filteredItems}
                totalItems={items.length}
                selectedId={selectedId}
                query={query}
                onQueryChange={setQuery}
                onSelect={setSelectedId}
                onClearAll={items.length ? () => setShowClearWorklist(true) : undefined}
              />
            </div>

            <div className="eo-workspace__detail">
              {loading ? (
                <section className="eo-card eo-card--detail">
                  <div className="eo-empty-state">
                    <div className="eo-spinner" />
                    <div className="eo-empty-state__title">Offline werkvoorraad laden</div>
                    <div className="eo-empty-state__copy">We lezen de lokaal opgeslagen formulieren in.</div>
                  </div>
                </section>
              ) : (
                <OfflineDetailPanel
                  item={selectedItem}
                  onSetStatus={handleSetStatus}
                  onSaveChecklist={handleSaveChecklist}
                  onSaveNotes={handleSaveNotes}
                  onDelete={(item) => {
                    setError("");
                    setLegacyDeleteConfirmed(false);
                    setDeleteCandidate(item);
                  }}
                  onDownloadPackage={handleDownloadPackage}
                  onOpenOnline={handleOpenOnline}
                  onOpenRunner={() => setActiveView("runner")}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
