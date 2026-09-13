import { useEffect, useMemo, useRef, useState } from "react";
import "@/styles/surveyjs-overrides.css";
import "@/styles/ember-form-runtime.css";
import EmberRuntimeSurvey from "@/pages/Forms/shared/EmberRuntimeSurvey.jsx";
import {
  collectValidationSummary,
  syncAllMatrixQuestionVisualErrors,
} from "@/pages/Forms/shared/validation.jsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  Save,
} from "lucide-react";
import { listOfflineDocuments } from "../lib/offlineStore.js";
import { openDocumentFolder } from "../lib/offlineFiles.js";
import { buildOfflineSurveySession } from "../lib/offlineRuntime.js";
import OfflineFieldPoints from "./OfflineFieldPoints.jsx";
import ConnectionStrip from "./ConnectionStrip.jsx";

function formatTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/* De opslagmelding zei voor de eerste opslag letterlijk "Opgeslagen; nog niet opgeslagen".
   Dat is precies het soort zin waardoor iemand gaat twijfelen of zijn werk wel bewaard is. */
function saveLabel(saveState, saveStamp) {
  if (saveState === "saving") return "Opslaan...";
  if (saveState === "error") return "Opslaan mislukt";

  const tijd = formatTime(saveStamp);
  return tijd ? `Opgeslagen om ${tijd}` : "Nog niet opgeslagen";
}

function documentTitle(document) {
  return document?.title || document?.file_name || "Document";
}

export default function OfflineRunnerPanel({
  item,
  onBack,
  onSaveAnswers,
  onSetStatus,
  onSavePoints,
  photos,
  onAddPhoto,
  onRemovePhoto,
}) {
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
     zelf; de nieuwste van de twee telt, en ISO-tijden sorteren op tekst gelijk aan op tijd. */
  const [eigenSaveStamp, setEigenSaveStamp] = useState(null);
  const saveStamp =
    [item?.local_runtime?.last_local_saved_at, eigenSaveStamp].filter(Boolean).sort().at(-1) || null;

  const [pageIndex, setPageIndex] = useState(() => Number(model?.currentPageNo || 0));
  const [paginaModel, setPaginaModel] = useState(model);

  /* Wat er nog mist. Zolang er niet één keer op afronden is gedrukt blijft dit leeg, want
     rode vlakken bij een formulier waar je net aan begonnen bent helpen niemand. */
  const [hasValidatedOnce, setHasValidatedOnce] = useState(false);
  const [validationSummary, setValidationSummary] = useState([]);
  const [controleOpen, setControleOpen] = useState(false);

  /* Een ander pakket betekent een ander model en dus een andere paginateller. Dit is het
     patroon "state aanpassen wanneer een prop verandert": tijdens de render en niet in een
     effect, zodat er geen renderronde met een verouderde pagina tussen zit. */
  if (model !== paginaModel) {
    setPaginaModel(model);
    setPageIndex(Number(model?.currentPageNo || 0));
    setHasValidatedOnce(false);
    setValidationSummary([]);
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
    return (
      <main className="eo-runner eo-runner--full">
        <button type="button" className="eo-btn eo-btn--ghost" onClick={onBack}><ArrowLeft size={18} />Terug</button>
        <div className="eo-empty-state">
          <div className="eo-empty-state__title">Offline formulier kon niet worden geopend</div>
          <div className="eo-empty-state__copy">{sessionResult.error}</div>
        </div>
      </main>
    );
  }

  const pages = Array.isArray(model.visiblePages) ? model.visiblePages : [];
  const laatstePagina = pageIndex >= pages.length - 1;

  const openDocument = (document) => {
    const url = URL.createObjectURL(document.blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  function gaNaarPagina(index) {
    const doel = Math.min(Math.max(0, index), Math.max(0, pages.length - 1));
    model.currentPageNo = doel;
    setPageIndex(doel);
  }

  /* Dezelfde controle als online: survey-core laat de fouten zien, de matrixvragen worden
     bijgewerkt, en daarna leest de gedeelde verzamelaar op wat er nog mist. Zo krijgt de
     monteur offline dezelfde lijst als op kantoor. */
  function controleer() {
    model.validate(true);
    syncAllMatrixQuestionVisualErrors(model);

    const summary = collectValidationSummary(model, item?.package_data?.runtime?.survey_json || null);
    setValidationSummary(summary);
    setHasValidatedOnce(true);
    return summary;
  }

  async function afronden() {
    await onSetStatus(item.id, "wacht_op_online_afronden");
    onBack();
  }

  function probeerAfteronden() {
    const summary = controleer();

    if (summary.length === 0) {
      afronden();
      return;
    }

    setControleOpen(true);
  }

  function springNaar(punt) {
    setControleOpen(false);
    gaNaarPagina(Number(punt?.pageIndex || 0));

    // Even wachten tot de pagina staat; anders bestaat het veld nog niet om heen te springen.
    window.setTimeout(() => {
      try {
        model.getQuestionByName?.(punt?.questionName)?.focus?.();
      } catch {
        // Niet kunnen focussen is geen reden om de gebruiker iets te melden; hij staat al
        // op de goede pagina.
      }
    }, 60);
  }

  return (
    <main className="eo-runner eo-runner--full">
      <header className="eo-runner__topbar">
        <button type="button" className="eo-btn eo-btn--ghost" onClick={onBack}><ArrowLeft size={18} />Werkvoorraad</button>
        <div className="eo-runner__topmeta">
          <div className="eo-runner__title">{item.summary?.title}</div>
          <div className="eo-runner__subtitle">{item.summary?.installation_name} ; {item.summary?.installation_code}</div>
        </div>
        <div className="eo-runner__finish-actions">
          <div className={`eo-runner__savebadge eo-runner__savebadge--${saveState}`}>
            {saveState === "saving" ? <Save size={16} /> : <CheckCircle2 size={16} />}
            {saveLabel(saveState, saveStamp)}
          </div>
          <button type="button" className="eo-btn eo-btn--primary" onClick={probeerAfteronden}>Lokaal afronden</button>
        </div>
      </header>

      <ConnectionStrip compact />

      <div className="eo-runner__layout">
        <aside className="eo-runner__sidebar">
          <div className="eo-runner__side-title">Pagina's</div>
          <nav className="eo-runner__page-nav" aria-label="Formulierpagina's">
            {pages.map((page, index) => (
              <button
                key={page.name || index}
                type="button"
                className={index === pageIndex ? "is-current" : ""}
                onClick={() => gaNaarPagina(index)}
              >
                {index + 1}. {page.title || page.name || `Pagina ${index + 1}`}
              </button>
            ))}
          </nav>

          <div className="eo-runner__side-title">Bestanden</div>
          {documents.length ? (
            <div className="eo-runner__documents">
              {documents.map((document) => (
                <button key={document.id} type="button" onClick={() => openDocument(document)}>
                  <FileText size={16} />{documentTitle(document)}
                </button>
              ))}
              <button type="button" className="eo-runner__folder-button" onClick={() => openDocumentFolder(item.id)}>
                <FolderOpen size={16} />Open in Verkenner
              </button>
            </div>
          ) : (
            <p className="eo-muted">Geen bestanden op dit apparaat.</p>
          )}

          {/* Staat bewust naast het formulier en niet op een pagina: wat je onderweg ziet,
              hoort niet te wachten tot je op de goede pagina bent. */}
          <div className="eo-runner__side-title">Punten voor kantoor</div>
          <OfflineFieldPoints
            points={item?.local_runtime?.manual_points || []}
            onChange={(punten) => onSavePoints?.(item.id, punten)}
            photos={photos}
            onAddPhoto={onAddPhoto ? (localId, bestand) => onAddPhoto(item.id, localId, bestand) : undefined}
            onRemovePhoto={onRemovePhoto}
            documents={documents}
          />
        </aside>

        <section className="eo-runner__form">
          {/* Alleen de teller; de paginatitel rendert de survey zelf, net als online. Hij
              stond hier twee keer. */}
          <div className="eo-runner__pagebar">
            <div className="eo-runner__pageeyebrow">Pagina {pageIndex + 1} van {pages.length}</div>
          </div>

          <div className="eo-runner__survey form-runner-survey-shell">
            <EmberRuntimeSurvey
              model={model}
              activePageIndex={pageIndex}
              installationCode={item.summary?.installation_code || ""}
              canEdit
              hasValidatedOnce={hasValidatedOnce}
              validationSummary={validationSummary}
              guidanceByQuestion={item.package_data?.runtime?.guidance_by_question || {}}
              guidanceByMatrixRow={item.package_data?.runtime?.guidance_by_matrix_row || {}}
            />
          </div>

          {/* Onderaan doorbladeren, waar je na de laatste vraag toch al staat. De lijst links
              blijft voor wie gericht ergens heen wil. */}
          <div className="eo-runner__pagefooter">
            <button
              type="button"
              className="eo-btn eo-btn--secondary"
              onClick={() => gaNaarPagina(pageIndex - 1)}
              disabled={pageIndex <= 0}
            >
              <ArrowLeft size={18} />Vorige
            </button>

            <span className="eo-runner__pagecount">Pagina {pageIndex + 1} van {pages.length}</span>

            {laatstePagina ? (
              <button type="button" className="eo-btn eo-btn--primary" onClick={probeerAfteronden}>
                <CheckCircle2 size={18} />Lokaal afronden
              </button>
            ) : (
              <button type="button" className="eo-btn eo-btn--primary" onClick={() => gaNaarPagina(pageIndex + 1)}>
                Volgende<ArrowRight size={18} />
              </button>
            )}
          </div>
        </section>
      </div>

      {controleOpen ? (
        <div className="eo-modal-backdrop" role="presentation">
          <div className="eo-modal" role="dialog" aria-modal="true" aria-labelledby="eo-controle-title">
            <div className="eo-card__header">
              <div>
                <div id="eo-controle-title" className="eo-section-title">
                  <AlertTriangle size={18} /> Er ontbreekt nog iets
                </div>
                <div className="eo-section-subtitle">
                  {validationSummary.length === 1
                    ? "Eén punt vraagt nog aandacht. Klik erop om er direct heen te gaan."
                    : `${validationSummary.length} punten vragen nog aandacht. Klik op een punt om er direct heen te gaan.`}
                </div>
              </div>
            </div>

            <ul className="eo-controle-lijst">
              {validationSummary.slice(0, 12).map((punt) => (
                <li key={punt.id}>
                  <button type="button" onClick={() => springNaar(punt)}>
                    <span className="eo-controle-lijst__vraag">{punt.questionTitle || punt.questionName}</span>
                    <span className="eo-controle-lijst__pagina">{punt.pageTitle}</span>
                    {punt.message ? <span className="eo-controle-lijst__melding">{punt.message}</span> : null}
                  </button>
                </li>
              ))}
              {validationSummary.length > 12 ? (
                <li className="eo-muted">En nog {validationSummary.length - 12} punten.</li>
              ) : null}
            </ul>

            <div className="eo-modal__actions">
              <button type="button" className="eo-btn eo-btn--secondary" onClick={() => setControleOpen(false)}>
                Terug naar het formulier
              </button>
              {/* Bewust mogelijk. Een monteur kan iets niet kunnen invullen omdat de gegevens
                  er in het veld niet zijn; dan moet hij verder kunnen en het online afmaken.
                  De poort bij het definitief indienen staat online en blijft dicht. */}
              <button type="button" className="eo-btn eo-btn--ghost" onClick={() => { setControleOpen(false); afronden(); }}>
                Toch afronden; ik vul de rest online aan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
