import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FolderSync, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import {
  createOfflinePackage,
  downloadInstallationDocument,
  getFormStartPreflight,
  getFormsCatalog,
  getInstallationCatalog,
  getInstallationFormInstances,
  searchInstallations,
  startChildFormInstance,
  startFormInstance,
} from "../lib/emberOfflineApi.js";
import { saveOfflineDocuments } from "../lib/offlineStore.js";
import { saveDocumentOnDevice } from "../lib/offlineFiles.js";
import {
  clearDesktopAuthSession,
  cancelMicrosoftSignIn,
  getDesktopAuthConfig,
  getDesktopAuthSession,
  isDesktopRuntime,
  signInWithMicrosoft,
} from "../lib/desktopAuth.js";

const MODE_OPTIONS = [
  { key: "existing", label: "Bestaand formulier" },
  { key: "new", label: "Nieuw formulier" },
  { key: "child", label: "Vervolgformulier" },
];

function formatSignInError(error) {
  const message = String(error?.message || "");
  if (/AADSTS50020/i.test(message)) {
    return "Dit account heeft geen toegang tot Ember Offline. Meld je aan met je Wardenburg-account; Hefas-gebruikers gebruiken hun Wardenburg-gastaccount.";
  }
  if (/AADSTS9002326|Cross-origin token redemption/i.test(message)) {
    return "Aanmelden kon niet worden afgerond. Kies Opnieuw proberen. Blijft dit gebeuren, herstart Ember Offline.";
  }
  if (/afgebroken|geannuleerd/i.test(message)) {
    return "De aanmeldpoging is afgebroken. Kies Opnieuw proberen om opnieuw aan te melden.";
  }
  if (/duurt te lang/i.test(message)) {
    return "Aanmelden duurt te lang. Kies Opnieuw proberen om opnieuw aan te melden.";
  }
  return "Aanmelden is niet afgerond. Kies Opnieuw proberen om opnieuw aan te melden.";
}

function installationTitle(item) {
  return item?.installation_name || item?.installatie_naam || item?.name || item?.atrium_installation_code || "Installatie";
}

function installationAddress(item) {
  return item?.object_address || item?.object_adres || item?.installatie_locatie || "";
}

function formTitle(item) {
  return item?.instance_title || item?.form_name || item?.label || item?.form_code || "Formulier";
}

export default function OnlineFormPickupPanel({ onPackagePrepared, onOpenOfflineWorklist }) {
  const [session, setSession] = useState(() => getDesktopAuthSession());
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [installation, setInstallation] = useState(null);
  const [mode, setMode] = useState("existing");
  const [catalog, setCatalog] = useState([]);
  const [instances, setInstances] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [selectedFormCode, setSelectedFormCode] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [parentInstanceId, setParentInstanceId] = useState("");
  const [selectedDocumentTypeKeys, setSelectedDocumentTypeKeys] = useState([]);
  const [preflight, setPreflight] = useState(null);
  const [loadingInstallation, setLoadingInstallation] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparationResult, setPreparationResult] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const authAttemptRef = useRef(0);
  const searchAbortRef = useRef(null);

  const authConfig = getDesktopAuthConfig();
  const desktopRuntime = isDesktopRuntime();
  const selectedForm = useMemo(
    () => catalog.find((item) => String(item.code) === String(selectedFormCode)) || null,
    [catalog, selectedFormCode]
  );

  const selectedExisting = useMemo(
    () => instances.find((item) => String(item.form_instance_id) === String(selectedExistingId)) || null,
    [instances, selectedExistingId]
  );

  async function signIn() {
    const attemptId = authAttemptRef.current + 1;
    authAttemptRef.current = attemptId;
    setError("");
    setIsSigningIn(true);

    try {
      const nextSession = await signInWithMicrosoft();
      if (attemptId !== authAttemptRef.current) return;
      setSession(nextSession);
    } catch (err) {
      if (attemptId !== authAttemptRef.current) return;
      setError(formatSignInError(err));
    } finally {
      if (attemptId === authAttemptRef.current) setIsSigningIn(false);
    }
  }

  async function cancelSignIn() {
    authAttemptRef.current += 1;
    await cancelMicrosoftSignIn();
    setIsSigningIn(false);
    setError("De aanmeldpoging is afgebroken. Kies Opnieuw proberen om opnieuw aan te melden.");
  }

  async function restartOffline() {
    authAttemptRef.current += 1;
    await cancelMicrosoftSignIn();
    window.location.reload();
  }

  function signOut() {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    clearDesktopAuthSession();
    setSession(null);
    setInstallation(null);
    setResults([]);
    setSearching(false);
    setError("");
    setMessage("");
  }

  async function runSearch(event) {
    event?.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || !session?.accessToken) return;
    searchAbortRef.current?.abort();
    const abortController = new AbortController();
    searchAbortRef.current = abortController;
    const activeToken = session.accessToken;
    setSearching(true);
    setError("");
    try {
      const response = await searchInstallations(activeToken, cleanQuery, { signal: abortController.signal });
      if (abortController.signal.aborted || session.accessToken !== activeToken) return;
      setResults(Array.isArray(response?.items) ? response.items : []);
    } catch (err) {
      if (err?.name !== "AbortError" && !abortController.signal.aborted) {
        setError(err?.message || "Installaties zoeken is niet gelukt.");
      }
    } finally {
      if (searchAbortRef.current === abortController) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  }

  async function selectInstallation(item) {
    const code = String(item?.atrium_installation_code || item?.installatie_code || "").trim();
    if (!code || !session?.accessToken) return;

    setInstallation(item);
    setResults([]);
    setSelectedExistingId("");
    setSelectedFormCode("");
    setParentInstanceId("");
    setPreflight(null);
    setError("");
    setMessage("");
    setLoadingInstallation(true);

    try {
      const [catalogResponse, instancesResponse, installationCatalogResponse] = await Promise.all([
        getFormsCatalog(session.accessToken, code),
        getInstallationFormInstances(session.accessToken, code),
        getInstallationCatalog(session.accessToken, code),
      ]);
      const nextCatalog = Array.isArray(catalogResponse?.items) ? catalogResponse.items : [];
      const nextInstances = Array.isArray(instancesResponse?.items) ? instancesResponse.items : [];
      const nextDocumentTypes = Array.isArray(installationCatalogResponse?.documentTypes)
        ? installationCatalogResponse.documentTypes
        : [];
      setCatalog(nextCatalog);
      setInstances(nextInstances);
      setDocumentTypes(nextDocumentTypes);
      setSelectedDocumentTypeKeys(Array.from(new Set(
        nextDocumentTypes
          .filter((documentType) => {
            const key = String(documentType?.document_type_key || "").toLowerCase();
            return documentType?.is_required === true || key === "pve" || key === "tekening";
          })
          .map((documentType) => String(documentType.document_type_key))
      )));
    } catch (err) {
      setError(err?.message || "Installatiegegevens laden is niet gelukt.");
    } finally {
      setLoadingInstallation(false);
    }
  }

  useEffect(() => {
    if (!installation || !selectedFormCode || mode === "existing" || !session?.accessToken) {
      setPreflight(null);
      return;
    }
    const code = String(installation.atrium_installation_code || installation.installatie_code || "");
    let active = true;
    getFormStartPreflight(session.accessToken, code, selectedFormCode)
      .then((response) => {
        if (active) setPreflight(response);
      })
      .catch((err) => {
        if (active) setError(err?.message || "Preflight controleren is niet gelukt.");
      });
    return () => {
      active = false;
    };
  }, [installation, mode, selectedFormCode, session]);

  function toggleDocumentType(key) {
    setSelectedDocumentTypeKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  async function preparePackage() {
    if (!installation || !session?.accessToken) return;
    const code = String(installation.atrium_installation_code || installation.installatie_code || "");
    let instanceId = selectedExistingId;

    if (mode !== "existing" && !selectedFormCode) {
      setError("Kies eerst een formulier.");
      return;
    }
    if (mode === "existing" && !instanceId) {
      setError("Kies eerst een bestaand formulier.");
      return;
    }
    if (mode === "child" && !parentInstanceId) {
      setError("Kies eerst het formulier waarop dit vervolgformulier aansluit.");
      return;
    }
    if (preflight && preflight.ok_to_start === false) {
      setError("Dit formulier kan nog niet worden gestart. Los eerst de blokkerende controles op in Ember.");
      return;
    }

    setPreparing(true);
    setPreparationResult(null);
    setError("");
    setMessage("");
    try {
      if (mode === "new") {
        const response = await startFormInstance(session.accessToken, code, selectedFormCode);
        instanceId = response?.item?.form_instance_id;
      }
      if (mode === "child") {
        const response = await startChildFormInstance(session.accessToken, code, parentInstanceId, selectedFormCode);
        instanceId = response?.item?.form_instance_id;
      }
      if (!instanceId) throw new Error("Ember gaf geen formulier-id terug.");

      const packageResponse = await createOfflinePackage(
        session.accessToken,
        code,
        instanceId,
        selectedDocumentTypeKeys
      );
      const packageData = packageResponse?.package;
      if (!packageData) throw new Error("Ember gaf geen offline package terug.");
      packageData.offline_origin = { created_by_offline: mode !== "existing" };
      const savedPackage = await onPackagePrepared(
        packageData,
        packageResponse?.file_name || `ember-offline-${code}-${instanceId}.json`
      );
      const documentsToCache = (packageData.selected_documents || []).filter((document) => document?.has_file && document?.download_endpoint);
      const cachedDocuments = await Promise.all(documentsToCache.map(async (document) => {
        const blob = await downloadInstallationDocument(session.accessToken, document.download_endpoint);
        return {
          id: `${savedPackage.id}::${document.document_id}`,
          document_id: document.document_id,
          title: document.title || document.file_name || "Document",
          file_name: document.file_name || "document",
          mime_type: document.mime_type || "application/octet-stream",
          blob,
          local_path: await saveDocumentOnDevice(savedPackage.id, document.file_name || "document", blob),
        };
      }));
      await saveOfflineDocuments(savedPackage.id, cachedDocuments);
      setMessage("Formulier staat lokaal klaar en is toegevoegd aan Offline formulieren.");
      setPreparationResult({
        kind: "success",
        message: "Het formulier en de gekozen bestanden zijn lokaal klaargezet.",
      });
    } catch (err) {
      const nextError = err?.message || "Formulier lokaal klaarzetten is niet gelukt.";
      setError(nextError);
      setPreparationResult({ kind: "error", message: nextError });
    } finally {
      setPreparing(false);
    }
  }

  if (!authConfig.configured) {
    return (
      <section className="eo-online-card eo-online-card--auth">
        <ShieldCheck size={24} />
        <div>
          <h2>Aanmelden instellen</h2>
          <p>De Entra-configuratie voor Ember Offline ontbreekt nog. Voeg de waarden toe aan <code>.env.local</code> voordat formulieren online kunnen worden opgehaald.</p>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="eo-online-card eo-online-card--auth">
        <ShieldCheck size={24} />
        <div className="eo-auth-copy">
          <h2>Meld je aan</h2>
          <p>Meld je aan om formulieren klaar te zetten voor offline werken.</p>
        </div>
        <div className="eo-auth-actions">
          <button
            type="button"
            className="eo-button eo-button--primary"
            onClick={isSigningIn ? cancelSignIn : signIn}
            disabled={!desktopRuntime}
            title={desktopRuntime ? undefined : "Open Ember Offline als desktopapp om aan te melden."}
          >
            {isSigningIn ? "Aanmelding afbreken" : error ? "Opnieuw proberen" : "Aanmelden"}
          </button>
          {isSigningIn || error ? (
            <button type="button" className="eo-button" onClick={restartOffline}>
              Herstart Ember Offline
            </button>
          ) : null}
          {error ? <button type="button" className="eo-button eo-button--quiet" onClick={signOut}>Afmelden</button> : null}
        </div>
        {isSigningIn ? (
          <p className="eo-auth-pending">
            Rond de Microsoft-aanmelding af in je browser. Gebruik je Wardenburg-account; Hefas-gebruikers gebruiken hun Wardenburg-gastaccount.
          </p>
        ) : null}
        {!desktopRuntime ? (
          <p className="eo-message eo-message--info">Aanmelden werkt in de Ember Offline desktopapp.</p>
        ) : null}
        {error ? (
          <div className="eo-message eo-message--error">
            <p>{error}</p>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="eo-online-flow">
      {preparing || preparationResult ? (
        <div className="eo-modal-backdrop" role="presentation">
          <div className="eo-modal eo-preparation-modal" role="dialog" aria-modal="true" aria-labelledby="eo-preparation-title">
            {preparing ? <LoaderCircle className="eo-spin eo-preparation-modal__icon" size={34} /> : null}
            {preparationResult?.kind === "success" ? <CheckCircle2 className="eo-preparation-modal__icon is-success" size={36} /> : null}
            {preparationResult?.kind === "error" ? <CircleAlert className="eo-preparation-modal__icon is-error" size={36} /> : null}
            <h2 id="eo-preparation-title">
              {preparing ? "Formulier lokaal klaarzetten" : preparationResult?.kind === "success" ? "Lokaal klaarzetten gelukt" : "Lokaal klaarzetten is niet gelukt"}
            </h2>
            <p>{preparing ? "We downloaden het formulier en de gekozen bestanden. Dit kan even duren." : preparationResult?.message}</p>
            {!preparing ? (
              <div className="eo-modal__actions">
                {preparationResult?.kind === "success" ? <button type="button" className="eo-button eo-button--primary" onClick={onOpenOfflineWorklist}>Naar offline formulieren</button> : <button type="button" className="eo-button eo-button--primary" onClick={preparePackage}>Opnieuw proberen</button>}
                <button type="button" className="eo-button" onClick={() => setPreparationResult(null)}>Sluiten</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="eo-online-card eo-online-card--identity">
        <div>
          <strong>{session.displayName}</strong>
          <span>{session.email}</span>
        </div>
        <button type="button" className="eo-button eo-button--quiet" onClick={signOut}>Afmelden</button>
      </div>

      {error ? (
        <div className="eo-message eo-message--error">
          <p>{error}</p>
          <div className="eo-auth-actions">
            <button type="button" className="eo-button" onClick={() => runSearch()}>Opnieuw proberen</button>
            <button type="button" className="eo-button eo-button--quiet" onClick={signOut}>Afmelden</button>
          </div>
        </div>
      ) : null}

      <div className="eo-online-card">
        <h2>Installatie zoeken</h2>
        <form className="eo-search-form" onSubmit={runSearch}>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op installatiecode of naam" />
          <button type="submit" className="eo-button eo-button--primary" disabled={searching}>
            {searching ? <LoaderCircle className="eo-spin" size={17} /> : <Search size={17} />}
            Zoeken
          </button>
        </form>
        {results.length > 0 ? (
          <div className="eo-search-results">
            {results.map((item) => {
              const code = item?.atrium_installation_code || item?.installatie_code;
              return <button type="button" key={String(code)} onClick={() => selectInstallation(item)}>
                <strong>{installationTitle(item)}</strong>
                <span>{code}{installationAddress(item) ? `; ${installationAddress(item)}` : ""}</span>
              </button>;
            })}
          </div>
        ) : null}
      </div>

      {installation ? (
        <div className="eo-online-card eo-online-card--prepare">
          <div className="eo-installation-heading">
            <div>
              <span className="eo-eyebrow">Gekozen installatie</span>
              <h2>{installationTitle(installation)}</h2>
              <p>{installation.atrium_installation_code || installation.installatie_code}{installationAddress(installation) ? `; ${installationAddress(installation)}` : ""}</p>
            </div>
            {loadingInstallation ? <LoaderCircle className="eo-spin" size={22} /> : null}
          </div>

          {!loadingInstallation ? <>
            {preflight ? <div className={`eo-preflight ${preflight.ok_to_start ? "is-ok" : "is-blocked"}`}><strong>{preflight.ok_to_start ? "Klaar om lokaal klaar te zetten" : "Controle vraagt aandacht"}</strong>{[...(preflight.blocking || []), ...(preflight.warnings || [])].map((item) => <p key={item.key}>{item.message}</p>)}</div> : null}
            <div className="eo-segmented-control">
              {MODE_OPTIONS.map((option) => (
                <button type="button" key={option.key} className={mode === option.key ? "is-active" : ""} onClick={() => setMode(option.key)}>{option.label}</button>
              ))}
            </div>

            {mode === "existing" ? (
              <div className="eo-choice-list">
                {instances.length ? instances.map((item) => (
                  <button type="button" key={item.form_instance_id} className={String(selectedExistingId) === String(item.form_instance_id) ? "is-selected" : ""} onClick={() => setSelectedExistingId(String(item.form_instance_id))}>
                    <strong>{formTitle(item)}</strong><span>#{item.form_instance_id} ; {item.status || "Concept"}</span>
                  </button>
                )) : <p className="eo-muted">Er zijn nog geen bestaande formulieren voor deze installatie.</p>}
              </div>
            ) : <>
              {mode === "child" ? <label className="eo-field"><span>Vervolg op formulier</span><select value={parentInstanceId} onChange={(event) => setParentInstanceId(event.target.value)}><option value="">Kies een formulier</option>{instances.map((item) => <option key={item.form_instance_id} value={item.form_instance_id}>#{item.form_instance_id} ; {formTitle(item)}</option>)}</select></label> : null}
              <div className="eo-choice-list">{catalog.filter((item) => item.is_applicable !== false).map((item) => <button type="button" key={item.code} className={String(selectedFormCode) === String(item.code) ? "is-selected" : ""} onClick={() => setSelectedFormCode(item.code)}><strong>{item.label}</strong><span>{item.description || item.code}</span></button>)}</div>
            </>}

            <div className="eo-document-selection">
              <div><h3>Documentinformatie meenemen</h3><p>De bestanden blijven online; de gekozen bestanden worden lokaal gedownload zodat ze offline beschikbaar zijn tijdens het invullen van het formulier.</p></div>
              {documentTypes.length ? <div className="eo-document-options">{documentTypes.map((documentType) => { const key = String(documentType.document_type_key); return <label key={key}><input type="checkbox" checked={selectedDocumentTypeKeys.includes(key)} onChange={() => toggleDocumentType(key)} /><span>{documentType.document_type_name || key}</span>{documentType.is_required ? <em>kritiek</em> : null}</label>; })}</div> : <p className="eo-muted">Voor deze installatie zijn geen documenttypes beschikbaar.</p>}
            </div>

            {message ? <p className="eo-message eo-message--success"><Check size={16} />{message}</p> : null}
            <div className="eo-online-actions"><button type="button" className="eo-button eo-button--primary" disabled={preparing || (mode !== "existing" && !selectedForm)} onClick={preparePackage}>{preparing ? <LoaderCircle className="eo-spin" size={18} /> : <FolderSync size={18} />}{preparing ? "Lokaal klaarzetten" : "Lokaal klaarzetten"}</button><span>Dit pakket blijft op dit apparaat beschikbaar.</span></div>
          </> : null}
        </div>
      ) : null}
    </section>
  );
}
