import { useEffect, useMemo, useState } from "react";
import { HardDriveDownload, Info, Trash2, WifiOff } from "lucide-react";
import OfflineDetailPanel from "./components/OfflineDetailPanel.jsx";
import OnlineFormPickupPanel from "./components/OnlineFormPickupPanel.jsx";
import ConnectionStrip from "./components/ConnectionStrip.jsx";
import OfflinePackageImportPanel from "./components/OfflinePackageImportPanel.jsx";
import OfflineRunnerPanel from "./components/OfflineRunnerPanel.jsx";
import OfflineWorklist from "./components/OfflineWorklist.jsx";
import SummaryCard from "./components/SummaryCard.jsx";
import { buildOfflineCounts, mergeOfflinePackage, normalizeOfflinePackage } from "./lib/packageParser.js";
import {
  deleteOfflinePackage,
  deleteOfflineDocuments,
  deleteOfflinePhoto,
  deleteOfflinePhotos,
  getOfflinePackage,
  listOfflinePackages,
  listOfflinePhotos,
  saveOfflinePackage,
  saveOfflinePhoto,
} from "./lib/offlineStore.js";
import { removeDocumentFolder } from "./lib/offlineFiles.js";
import {
  createFormInstanceDocumentRow,
  linkDocumentToFollowUp,
  listFormInstanceDocuments,
  syncOfflineForm,
  uploadFormInstanceDocumentFile,
  withdrawFormInstance,
} from "./lib/emberOfflineApi.js";
import { buildOfflineReturnDocument, resolveClientSyncId } from "./lib/offlineSyncDocument.js";
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
  const [syncBezig, setSyncBezig] = useState(false);
  const [syncMelding, setSyncMelding] = useState("");
  const [syncToon, setSyncToon] = useState("success");
  const [photos, setPhotos] = useState([]);
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

  useEffect(() => {
    refreshPhotos(selectedId);
  }, [selectedId]);

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

  /* Alles waar lokaal aan gewerkt is mag terug; ook een formulier dat nog niet is
     afgerond, want tussentijds opslaan is bij Ember normaal en een concept dat thuis staat
     is veiliger dan een concept dat alleen op een laptop staat. Een conflict mag opnieuw
     worden geprobeerd, want misschien is het online intussen opgelost. */
  function heeftLokaalWerk(item) {
    const status = item?.local_status;

    /* Een formulier waarvan de antwoorden al geland zijn maar de foto's niet, hoort in de
       lijst te blijven staan. Zonder dit verdwijnt de knop zodra de antwoorden binnen zijn
       en blijven die foto's stil op het apparaat achter. */
    if (item?.local_runtime?.photos_pending) return true;

    return (
      status === "lokaal_in_bewerking" ||
      status === "lokaal_afgerond" ||
      status === "wacht_op_online_afronden" ||
      status === "conflict"
    );
  }

  /* De foto's van één pakket naar Ember brengen, nadat de antwoorden en de punten er zijn.
     Pas dan bestaat het actiepunt waar een foto aan hangt; eerder uploaden zou een bestand
     opleveren dat nergens bij hoort.

     Dezelfde drie stappen als online: documentregel, bestand, koppeling. Een foto die is
     geland krijgt uploaded_at en wordt daarna overgeslagen, zodat een tweede poging niet
     dezelfde foto nog een keer op kantoor zet. */
  async function stuurFotosTerug(item, accessToken, puntItems) {
    const code = item?.summary?.installation_code;
    const instanceId = item?.summary?.form_instance_id;

    const alleFotos = await listOfflinePhotos(item.id);
    const teSturen = alleFotos.filter((foto) => !foto.uploaded_at && foto.blob);
    if (!teSturen.length) return { verstuurd: 0, mislukt: 0 };

    const idPerPunt = new Map(
      (Array.isArray(puntItems) ? puntItems : [])
        .filter((punt) => punt?.local_id && punt?.follow_up_action_id)
        .map((punt) => [punt.local_id, punt.follow_up_action_id])
    );

    const punten = item?.local_runtime?.manual_points || [];
    let verstuurd = 0;
    let mislukt = 0;

    for (const foto of teSturen) {
      const actionId = idPerPunt.get(foto.point_local_id);
      if (!actionId) {
        mislukt += 1;
        continue;
      }

      try {
        const titel =
          punten.find((punt) => punt.local_id === foto.point_local_id)?.title || "Foto uit het veld";

        /* Welke documentregel er zojuist bij gekomen is, blijkt uit het verschil met de
           lijst van ervoor; de PUT geeft de hele set terug en niet alleen de nieuwe. */
        const voor = await listFormInstanceDocuments(accessToken, code, instanceId);
        const voorIds = new Set(
          (voor?.items || []).map((doc) => String(doc.form_instance_document_id || doc.document_id))
        );

        const na = await createFormInstanceDocumentRow(accessToken, code, instanceId, titel);
        const nieuw = (na?.items || []).find(
          (doc) => !voorIds.has(String(doc.form_instance_document_id || doc.document_id))
        );

        const documentId = nieuw?.form_instance_document_id || nieuw?.document_id || null;
        if (!documentId) {
          mislukt += 1;
          continue;
        }

        await uploadFormInstanceDocumentFile(
          accessToken,
          code,
          instanceId,
          documentId,
          foto.blob,
          foto.file_name
        );

        await linkDocumentToFollowUp(accessToken, code, instanceId, documentId, actionId);

        await saveOfflinePhoto({ ...foto, uploaded_at: new Date().toISOString() });
        verstuurd += 1;
      } catch {
        /* Een foto die niet landt mag de rest niet ophouden; de antwoorden staan al vast en
           de foto blijft hier staan voor een volgende poging. */
        mislukt += 1;
      }
    }

    return { verstuurd, mislukt };
  }

  async function handleSyncAll() {
    const teSturen = items.filter(heeftLokaalWerk);
    if (!teSturen.length || syncBezig) return;

    const session = getDesktopAuthSession();

    if (!session?.accessToken) {
      setError("Meld je eerst aan; daarna kun je je werk terugsturen naar Ember.");
      setWorkspaceMode("online");
      return;
    }

    setSyncBezig(true);
    setSyncMelding("");
    setError("");

    let verstuurd = 0;
    let conflicten = 0;
    let versieGewijzigd = 0;
    let fotosVerstuurd = 0;
    let fotosMislukt = 0;
    let gestopt = "";

    for (const item of teSturen) {
      const code = item?.summary?.installation_code;
      const instanceId = item?.summary?.form_instance_id;
      if (!code || instanceId == null) continue;

      const clientSyncId = resolveClientSyncId(item);

      try {
        const uitkomst = await syncOfflineForm(
          session.accessToken,
          code,
          instanceId,
          buildOfflineReturnDocument(item, { clientSyncId })
        );

        const geslaagd = Boolean(uitkomst?.ok);
        const nieuweVersie = !geslaagd && uitkomst?.result === "version_changed";

        let fotosBlijvenStaan = false;

        if (geslaagd) {
          const fotoResultaat = await stuurFotosTerug(
            item,
            session.accessToken,
            uitkomst?.payload?.points?.items
          );
          fotosVerstuurd += fotoResultaat.verstuurd;
          fotosMislukt += fotoResultaat.mislukt;
          fotosBlijvenStaan = fotoResultaat.mislukt > 0;
        }

        if (geslaagd) verstuurd += 1;
        else if (nieuweVersie) versieGewijzigd += 1;
        else conflicten += 1;

        const huidig = await getOfflinePackage(item.id);
        if (!huidig) continue;

        await saveOfflinePackage({
          ...huidig,
          local_status: geslaagd ? "gesynchroniseerd" : "conflict",
          needs_online_finish: !geslaagd,
          has_conflict: !geslaagd,
          local_updated_at: new Date().toISOString(),
          local_runtime: {
            ...huidig.local_runtime,
            // Dezelfde sleutel bij een volgende poging; anders maakt de server alles nog
            // een keer aan in plaats van te herkennen dat het er al is.
            client_sync_id: clientSyncId,
            last_sync_at: new Date().toISOString(),
            last_sync_result: geslaagd ? "accepted" : uitkomst?.result || "conflict",
            photos_pending: fotosBlijvenStaan,
          },
        });
      } catch (e) {
        /* Netwerk weg of sessie verlopen; dan heeft doorgaan met de rest geen zin en blijft
           alles gewoon lokaal staan. */
        gestopt = e?.message || "Het terugsturen is gestopt.";
        break;
      }
    }

    await refreshPackages(selectedId);
    setSyncBezig(false);

    if (gestopt) {
      setError(gestopt);
      return;
    }

    const delen = [];
    if (verstuurd) delen.push(`${verstuurd} ${verstuurd === 1 ? "formulier" : "formulieren"} teruggestuurd naar Ember`);
    if (conflicten) {
      delen.push(
        `${conflicten} ${conflicten === 1 ? "formulier is" : "formulieren zijn"} online gewijzigd; open ${conflicten === 1 ? "het" : "ze"} in Ember om te kijken wat er anders is`
      );
    }
    /* Een nieuwe definitieversie is iets anders dan een gewijzigd antwoord: de vragen zelf
       zijn veranderd, dus het ingevulde werk hoort bij een formulier dat niet meer bestaat.
       Dat verdient een eigen zin; "kijk wat er anders is" helpt hier niet. */
    if (versieGewijzigd) {
      delen.push(
        `${versieGewijzigd} ${versieGewijzigd === 1 ? "formulier heeft" : "formulieren hebben"} online een nieuwe versie gekregen; neem contact op met kantoor voordat je ${versieGewijzigd === 1 ? "het" : "ze"} opnieuw verstuurt`
      );
    }

    if (fotosVerstuurd) {
      delen.push(`${fotosVerstuurd} ${fotosVerstuurd === 1 ? "foto" : "foto's"} meegestuurd`);
    }
    if (fotosMislukt) {
      delen.push(
        `${fotosMislukt} ${fotosMislukt === 1 ? "foto staat" : "foto's staan"} nog op dit apparaat; probeer het straks opnieuw`
      );
    }

    setSyncMelding(delen.join(". ") + ".");
    setSyncToon(conflicten || versieGewijzigd || fotosMislukt ? "warning" : "success");

    await refreshPhotos(selectedId);
  }

  /* De foto's van het geopende pakket. Ze staan in hun eigen opslag, dus ze moeten apart
     worden geladen; het pakket zelf blijft daardoor klein genoeg om snel te lezen. */
  async function refreshPhotos(packageId) {
    if (!packageId) {
      setPhotos([]);
      return;
    }

    try {
      setPhotos(await listOfflinePhotos(packageId));
    } catch (e) {
      setError(e?.message || "De foto's konden niet worden geladen.");
    }
  }

  async function handleAddPhoto(packageId, pointLocalId, bestand) {
    const nu = new Date();
    const naam = String(bestand?.name || "").trim() || `foto-${nu.toISOString().slice(0, 19).replace(/[:T]/g, "")}.jpg`;

    await saveOfflinePhoto({
      id: `${packageId}::${pointLocalId}::${nu.getTime()}`,
      package_id: packageId,
      point_local_id: pointLocalId,
      file_name: naam,
      mime_type: bestand?.type || "image/jpeg",
      size_bytes: bestand?.size ?? null,
      /* Het blob zelf gaat mee de opslag in. Alleen een pad bewaren zou betekenen dat de
         foto verdwijnt zodra de camera-app of de gebruiker hem opruimt. */
      blob: bestand,
      created_at: nu.toISOString(),
      uploaded_at: null,
    });

    await refreshPhotos(packageId);
  }

  async function handleRemovePhoto(photoId) {
    await deleteOfflinePhoto(photoId);
    await refreshPhotos(selectedId);
  }

  /* Punten die in het veld zijn opgeschreven. Ze staan bij het pakket en reizen mee in het
     terugstuurdocument; de server maakt ze daar per stuk aan, met het lokale id als sleutel
     zodat een tweede poging niets dubbel aanmaakt. */
  async function handleSavePoints(id, punten) {
    const current = await getOfflinePackage(id);
    if (!current) return;

    await saveOfflinePackage({
      ...current,
      local_updated_at: new Date().toISOString(),
      local_runtime: {
        ...current.local_runtime,
        manual_points: Array.isArray(punten) ? punten : [],
      },
    });

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
    // Foto's staan in hun eigen opslag; zonder dit blijven ze achter bij een pakket dat er
    // niet meer is en raakt het apparaat langzaam vol met beeld dat niemand nog kan plaatsen.
    await deleteOfflinePhotos(item.id);
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
          onSavePoints={handleSavePoints}
          photos={photos}
          onAddPhoto={handleAddPhoto}
          onRemovePhoto={handleRemovePhoto}
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

      {/* Altijd zichtbaar, ook als alles goed gaat. De vraag "doet dit ding het wel zonder
          internet" hoort beantwoord te zijn voordat iemand hem stelt. */}
      <ConnectionStrip
        wachtendAantal={items.filter(heeftLokaalWerk).length}
        conflictAantal={items.filter((item) => item?.local_status === "conflict").length}
        onSync={handleSyncAll}
        syncBezig={syncBezig}
      />

      {syncMelding ? <p className={`eo-inline-note eo-inline-note--${syncToon}`}>{syncMelding}</p> : null}

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
