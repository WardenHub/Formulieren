import { useEffect, useMemo, useRef, useState } from "react";
import "@/styles/surveyjs-overrides.css";
import "@/styles/ember-form-runtime.css";
import EmberRuntimeSurvey from "@/pages/Forms/shared/EmberRuntimeSurvey.jsx";
import { ArrowLeft, CheckCircle2, FileText, FolderOpen, Save } from "lucide-react";
import { listOfflineDocuments } from "../lib/offlineStore.js";
import { openDocumentFolder } from "../lib/offlineFiles.js";
import { buildOfflineSurveySession } from "../lib/offlineRuntime.js";

function formatDateTime(value) {
  if (!value) return "nog niet opgeslagen";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function documentTitle(document) {
  return document?.title || document?.file_name || "Document";
}

export default function OfflineRunnerPanel({ item, onBack, onSaveAnswers, onSetStatus }) {
  const packageIdentity = `${item?.id || ""}:${item?.package_data?.generated_at || item?.imported_at || ""}`;
  /* Het model wordt bewust alleen opnieuw opgebouwd wanneer het pakket verandert en niet
     wanneer `item` verandert. `item` verandert bij elke lokale opslag, en een nieuw model zou
     de survey midden in het invullen terugzetten. De compiler kan dat niet zien en vraagt om
     `item` in de lijst; dat is hier precies wat niet moet. */
  const sessionResult = useMemo(() => {
    if (!item) return { model: null, error: null };
    try {
      return { ...buildOfflineSurveySession(item), error: null };
    } catch (error) {
      return { model: null, error: error?.message || "Het offline formulier kon niet worden opgebouwd." };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageIdentity]);

  const model = sessionResult.model;
  const itemRef = useRef(item);
  const saveTimerRef = useRef(null);
  const [saveState, setSaveState] = useState("idle");
  const [documents, setDocuments] = useState([]);

  /* De laatst bekende opslagtijd komt uit het item, en vlak na een opslag uit deze component
     zelf; de nieuwste van de twee telt, en ISO-tijden sorteren op tekst gelijk aan op tijd.
     Dit stond eerder in state die vanuit een effect opnieuw werd gezet bij elke wijziging van
     het item, en dat gaf een extra renderronde per autosave; precies in het scherm waarin
     getypt wordt. */
  const [eigenSaveStamp, setEigenSaveStamp] = useState(null);
  const saveStamp =
    [item?.local_runtime?.last_local_saved_at, eigenSaveStamp].filter(Boolean).sort().at(-1) || null;

  const [pageIndex, setPageIndex] = useState(() => Number(model?.currentPageNo || 0));
  const [paginaModel, setPaginaModel] = useState(model);

  /* Een ander pakket betekent een ander model en dus een andere paginateller. Dit is het
     patroon "state aanpassen wanneer een prop verandert": tijdens de render en niet in een
     effect, zodat er geen renderronde met een verouderde pagina tussen zit. */
  if (model !== paginaModel) {
    setPaginaModel(model);
    setPageIndex(Number(model?.currentPageNo || 0));
  }

  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  useEffect(() => {
    if (!item?.id) return undefined;
    let active = true;
    listOfflineDocuments(item.id).then((result) => {
      if (active) setDocuments(result);
    }).catch(() => {
      if (active) setDocuments([]);
    });
    return () => { active = false; };
  }, [item?.id]);

  useEffect(() => {
    if (!model || !item?.id) return undefined;
    const persist = async () => {
      setSaveState("saving");
      try {
        const savedAt = new Date().toISOString();
        await onSaveAnswers(itemRef.current.id, model.data && typeof model.data === "object" ? model.data : {}, savedAt);
        setEigenSaveStamp(savedAt);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    };
    const scheduleSave = async (delay) => {
      if (itemRef.current.local_status === "klaargezet") await onSetStatus(itemRef.current.id, "lokaal_in_bewerking");
      setSaveState("pending");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(persist, delay);
    };
    const handleValueChanged = () => { scheduleSave(900); };
    const handlePageChanged = () => {
      setPageIndex(Number(model.currentPageNo || 0));
      scheduleSave(250);
    };
    model.onValueChanged.add(handleValueChanged);
    model.onCurrentPageChanged.add(handlePageChanged);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      model.onValueChanged.remove(handleValueChanged);
      model.onCurrentPageChanged.remove(handlePageChanged);
    };
  }, [item?.id, model, onSaveAnswers, onSetStatus]);

  if (!item || !model) {
    return <main className="eo-runner eo-runner--full"><button type="button" className="eo-btn eo-btn--ghost" onClick={onBack}><ArrowLeft size={18} />Terug</button><div className="eo-empty-state"><div className="eo-empty-state__title">Offline formulier kon niet worden geopend</div><div className="eo-empty-state__copy">{sessionResult.error}</div></div></main>;
  }

  const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];
  const openDocument = (document) => {
    const url = URL.createObjectURL(document.blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <main className="eo-runner eo-runner--full">
      <header className="eo-runner__topbar">
        <button type="button" className="eo-btn eo-btn--ghost" onClick={onBack}><ArrowLeft size={18} />Werkvoorraad</button>
        <div className="eo-runner__topmeta"><div className="eo-runner__title">{item.summary?.title}</div><div className="eo-runner__subtitle">{item.summary?.installation_name} ; {item.summary?.installation_code}</div></div>
        <div className="eo-runner__finish-actions"><div className={`eo-runner__savebadge eo-runner__savebadge--${saveState}`}>{saveState === "saving" ? <Save size={16} /> : <CheckCircle2 size={16} />}{saveState === "saving" ? "Lokaal opslaan" : saveState === "error" ? "Opslaan mislukt" : `Opgeslagen; ${formatDateTime(saveStamp)}`}</div><button type="button" className="eo-btn eo-btn--primary" onClick={async () => { await onSetStatus(item.id, "wacht_op_online_afronden"); onBack(); }}>Lokaal afronden</button></div>
      </header>

      <div className="eo-runner__layout">
        <aside className="eo-runner__sidebar">
          <div className="eo-runner__side-title">Pagina's</div>
          <nav className="eo-runner__page-nav" aria-label="Formulierpagina's">
            {pages.map((page, index) => <button key={page.name || index} type="button" className={index === pageIndex ? "is-current" : ""} onClick={() => { model.currentPageNo = index; setPageIndex(index); }}>{index + 1}. {page.title || page.name || `Pagina ${index + 1}`}</button>)}
          </nav>
          <div className="eo-runner__side-title">Bestanden</div>
          {documents.length ? <div className="eo-runner__documents">{documents.map((document) => <button key={document.id} type="button" onClick={() => openDocument(document)}><FileText size={16} />{documentTitle(document)}</button>)}<button type="button" className="eo-runner__folder-button" onClick={() => openDocumentFolder(item.id)}><FolderOpen size={16} />Open in Verkenner</button></div> : <p className="eo-muted">Geen bestanden lokaal beschikbaar.</p>}
        </aside>
        <section className="eo-runner__form"><div className="eo-runner__pagebar"><div><div className="eo-runner__pageeyebrow">Pagina {pageIndex + 1} van {pages.length}</div><div className="eo-runner__pagetitle">{model.currentPage?.title || model.currentPage?.name || `Pagina ${pageIndex + 1}`}</div></div></div><div className="eo-runner__survey form-runner-survey-shell"><EmberRuntimeSurvey model={model} activePageIndex={pageIndex} installationCode={item.summary?.installation_code || ""} canEdit hasValidatedOnce={false} validationSummary={[]} guidanceByQuestion={item.package_data?.runtime?.guidance_by_question || {}} guidanceByMatrixRow={item.package_data?.runtime?.guidance_by_matrix_row || {}} /></div></section>
      </div>
    </main>
  );
}
