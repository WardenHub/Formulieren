// src/pages/Forms/shared/FormAssistantPanel.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { MicIcon } from "@/components/ui/mic";
import { MicOffIcon } from "@/components/ui/mic-off";
import { BrainIcon } from "@/components/ui/brain";
import { CheckIcon } from "@/components/ui/check";
import { FrownIcon } from "@/components/ui/frown";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { RotateCCWIcon } from "@/components/ui/rotate-ccw";
import {
  applyFormAssistantPatches,
  interpretFormAssistantText,
  rejectFormAssistantPatches,
  transcribeFormAssistantAudio,
} from "../../../api/emberApi.js";
import { useAssistantAudioRecorder } from "./assistantAudio.jsx";
import {
  applyAssistantPatchesToSurvey,
  buildAssistantFieldMapFromSurvey,
  summarizeAssistantPatch,
} from "./assistantFieldMap.jsx";

function getErrorMessage(error, fallback = "Onbekende fout") {
  return String(error?.message || error || fallback);
}

function getPatchIds(patches) {
  return (Array.isArray(patches) ? patches : [])
    .map((patch) => patch?.assistant_patch_id)
    .filter((id) => id != null);
}

function formatValue(value) {
  if (value == null || value === "") return "leeg";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function minPatchConfidence(patches) {
  const values = (Array.isArray(patches) ? patches : [])
    .map((patch) => Number(patch?.confidence))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return null;
  return Math.min(...values);
}

function AssistantStep({ active, done, selected, label, meta, onClick }) {
  return (
    <button
      type="button"
      className={[
        "form-assistant-step",
        active ? "is-active" : "",
        done ? "is-done" : "",
        selected ? "is-selected" : "",
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      title={`${label} bekijken`}
    >
      <span className="form-assistant-step-dot" />
      <span className="form-assistant-step-label">{label}</span>
      {meta ? <span className="form-assistant-step-meta">{meta}</span> : null}
    </button>
  );
}

function getCurrentPageInfo(surveyModel, fallbackPageName) {
  const currentPage = surveyModel?.currentPage || null;
  const visiblePages = Array.isArray(surveyModel?.visiblePages) ? surveyModel.visiblePages : [];
  const pageIndex = currentPage ? visiblePages.indexOf(currentPage) : -1;

  return {
    activePageName: currentPage?.name || fallbackPageName || null,
    activePageTitle: currentPage?.title || currentPage?.name || null,
    activePageNo: pageIndex >= 0 ? pageIndex + 1 : null,
  };
}

function compactFieldMapForAssistant(fieldMap, pageInfo) {
  const activePageName = pageInfo?.activePageName || null;

  return (Array.isArray(fieldMap) ? fieldMap : []).map((field) => ({
    kind: field.kind,
    name: field.name,
    questionName: field.questionName,
    matrixName: field.matrixName,
    matrixRowIndex: field.matrixRowIndex,
    matrixRowKey: field.matrixRowKey,
    matrixColumnName: field.matrixColumnName,
    target_path: field.target_path,
    targetLabel: field.targetLabel,
    title: field.title,
    itemCode: field.itemCode,
    rowTitle: field.rowTitle,
    onderwerp: field.onderwerp,
    value: field.value,
    choices: field.choices,
    pageNumber: field.pageNumber,
    pageName: field.pageName,
    pageTitle: field.pageTitle,
    panelName: field.panelName,
    panelTitle: field.panelTitle,
    visible: field.visible,
    readOnly: field.readOnly,
    isActivePage: Boolean(activePageName && field.pageName === activePageName),
  }));
}


function normalizeSpeechPhrase(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function sanitizeAssistantTranscriptText(value) {
  return String(value || "")
    .replace(/[?¿]/g, "")
    .replace(/\s+([,.;:!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnsafeStandalonePhrase(value) {
  const text = normalizeSpeechPhrase(value);
  const lower = text.toLowerCase();

  if (!text) return true;

  // Losse letters zijn gevaarlijk: "Zet" kan dan "Z" worden.
  if (/^[a-z]$/i.test(text)) return true;

  // Losse cijfers zijn gevaarlijk: "nee" kan dan "9" worden.
  if (/^\d+$/.test(text)) return true;

  // Losse telwoorden zijn te ambigu.
  if (
    [
      "nul",
      "een",
      "één",
      "twee",
      "drie",
      "vier",
      "vijf",
      "zes",
      "zeven",
      "acht",
      "negen",
      "tien",
      "elf",
      "twaalf",
      "dertien",
      "veertien",
      "vijftien",
      "zestien",
      "zeventien",
      "achttien",
      "negentien",
      "twintig",
    ].includes(lower)
  ) {
    return true;
  }

  // Losse antwoordwoorden liever niet als hint. Wel in commandocontext zoals "op nee".
  if (["ja", "nee", "nvt", "n.v.t."].includes(lower)) return true;

  // Letterwoorden die normale woorden kunnen vervormen.
  // Let op: "zet" staat hier bewust niet in, want dat is een kerncommando.
  if (["de", "die", "bee", "dee", "vee"].includes(lower)) return true;

  return false;
}

function pushSpeechPhrase(out, seen, value) {
  const text = normalizeSpeechPhrase(value);
  if (!text || text.length > 90) return;
  if (isUnsafeStandalonePhrase(text)) return;

  const key = text.toLowerCase();
  if (seen.has(key)) return;

  seen.add(key);
  out.push(text);
}

function spokenNumberNl(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;

  return {
    0: "nul",
    1: "een",
    2: "twee",
    3: "drie",
    4: "vier",
    5: "vijf",
    6: "zes",
    7: "zeven",
    8: "acht",
    9: "negen",
    10: "tien",
    11: "elf",
    12: "twaalf",
    13: "dertien",
    14: "veertien",
    15: "vijftien",
    16: "zestien",
    17: "zeventien",
    18: "achttien",
    19: "negentien",
    20: "twintig",
  }[n] || null;
}

function addItemCodeSpeechVariants(out, seen, value) {
  const code = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return;

  pushSpeechPhrase(out, seen, code);
  pushSpeechPhrase(out, seen, `vraag ${code}`);
  pushSpeechPhrase(out, seen, `zet ${code}`);
  pushSpeechPhrase(out, seen, `zet vraag ${code}`);
  pushSpeechPhrase(out, seen, `bij ${code}`);
  pushSpeechPhrase(out, seen, `naast ${code}`);
  pushSpeechPhrase(out, seen, `opmerking bij ${code}`);
  pushSpeechPhrase(out, seen, `opmerking naast ${code}`);

  const letterDigit = code.match(/^([A-Z])(\d{1,3})$/);
  if (letterDigit) {
    const letter = letterDigit[1];
    const digits = letterDigit[2];
    const spoken = spokenNumberNl(digits);

    pushSpeechPhrase(out, seen, `${letter} ${digits}`);
    pushSpeechPhrase(out, seen, `vraag ${letter} ${digits}`);
    pushSpeechPhrase(out, seen, `zet ${letter} ${digits}`);
    pushSpeechPhrase(out, seen, `zet vraag ${letter} ${digits}`);
    pushSpeechPhrase(out, seen, `bij ${letter} ${digits}`);
    pushSpeechPhrase(out, seen, `naast ${letter} ${digits}`);

    if (spoken) {
      pushSpeechPhrase(out, seen, `${letter} ${spoken}`);
      pushSpeechPhrase(out, seen, `vraag ${letter} ${spoken}`);
      pushSpeechPhrase(out, seen, `zet ${letter} ${spoken}`);
      pushSpeechPhrase(out, seen, `zet vraag ${letter} ${spoken}`);
      pushSpeechPhrase(out, seen, `bij ${letter} ${spoken}`);
      pushSpeechPhrase(out, seen, `naast ${letter} ${spoken}`);
    }

    return;
  }

  const decimalCode = code.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (decimalCode) {
    const left = decimalCode[1];
    const right = decimalCode[2];
    const leftSpoken = spokenNumberNl(left);
    const rightSpoken = spokenNumberNl(right);

    pushSpeechPhrase(out, seen, code);
    pushSpeechPhrase(out, seen, `vraag ${code}`);
    pushSpeechPhrase(out, seen, `zet ${code}`);
    pushSpeechPhrase(out, seen, `zet vraag ${code}`);
    pushSpeechPhrase(out, seen, `bij ${code}`);
    pushSpeechPhrase(out, seen, `naast ${code}`);

    pushSpeechPhrase(out, seen, `${left} punt ${right}`);
    pushSpeechPhrase(out, seen, `vraag ${left} punt ${right}`);
    pushSpeechPhrase(out, seen, `zet ${left} punt ${right}`);
    pushSpeechPhrase(out, seen, `zet vraag ${left} punt ${right}`);
    pushSpeechPhrase(out, seen, `bij ${left} punt ${right}`);

    if (leftSpoken && rightSpoken) {
      pushSpeechPhrase(out, seen, `${leftSpoken} punt ${rightSpoken}`);
      pushSpeechPhrase(out, seen, `vraag ${leftSpoken} punt ${rightSpoken}`);
      pushSpeechPhrase(out, seen, `zet ${leftSpoken} punt ${rightSpoken}`);
      pushSpeechPhrase(out, seen, `zet vraag ${leftSpoken} punt ${rightSpoken}`);
      pushSpeechPhrase(out, seen, `bij ${leftSpoken} punt ${rightSpoken}`);
    }
  }
}

function addTextPhrase(out, seen, value) {
  const text = normalizeSpeechPhrase(value);
  if (!text) return;

  // Alleen hele titels of betekenisvolle zinsdelen, geen losse korte woorden.
  if (text.length >= 4) {
    pushSpeechPhrase(out, seen, text);
  }
}

function buildSpeechPhrasesForAssistant(fieldMap, pageInfo) {
  const out = [];
  const seen = new Set();

  [
    // Kerncommando's expliciet helpen. Geen losse "Z" of losse cijfers toevoegen.
    "Zet",
    "Zet vraag",
    "Zet alles",
    "Zet alles op",
    "Zet alles op ja",
    "Zet alles op nee",
    "Zet alles op n.v.t.",
    "Zet alle vragen",
    "Zet alle vragen op",
    "Zet alle vragen op ja",
    "Zet alle vragen op nee",
    "Zet alle vragen op n.v.t.",
    "Zet alle vragen op deze pagina",
    "Zet alle vragen op deze pagina op ja",
    "Zet alle vragen op deze pagina op nee",
    "Zet alle vragen op deze pagina op n.v.t.",
    "Zet melders allemaal op ja",
    "Zet melders allemaal op nee",
    "Zet melders allemaal op n.v.t.",
    "Zet bij",
    "Zet naast",
    "Zet de opmerking bij",
    "Zet de opmerking naast",
    "Voeg bij",
    "Voeg aanvullende opmerking toe",
    "Maak aanvullende opmerking",

    // Veilige antwoordcontexten.
    "op ja",
    "op nee",
    "op n.v.t.",
    "naar ja",
    "naar nee",
    "naar n.v.t.",
    "antwoord ja",
    "antwoord nee",
    "antwoord n.v.t.",
    "niet van toepassing",

    // Domeintermen.
    "voldoet",
    "opmerking",
    "aanvullende opmerking",
    "brandmelders",
    "automatische brandmelders",
    "handbrandmelders",
    "nevenindicatoren",
    "brandweerpanelen",
    "nevenpanelen",
    "brandweer- en nevenpanelen",
    "brandalarmeringsapparatuur",
    "melders",
    "projectie",
    "besturingen",
  ].forEach((phrase) => pushSpeechPhrase(out, seen, phrase));

  if (pageInfo?.activePageName) pushSpeechPhrase(out, seen, pageInfo.activePageName);
  if (pageInfo?.activePageTitle) addTextPhrase(out, seen, pageInfo.activePageTitle);
  if (pageInfo?.activePageNo != null) {
    pushSpeechPhrase(out, seen, `pagina ${pageInfo.activePageNo}`);
    pushSpeechPhrase(out, seen, `bladzijde ${pageInfo.activePageNo}`);
  }

  const activeFirst = [...(Array.isArray(fieldMap) ? fieldMap : [])].sort((a, b) => {
    const aActive = pageInfo?.activePageName && a?.pageName === pageInfo.activePageName ? 0 : 1;
    const bActive = pageInfo?.activePageName && b?.pageName === pageInfo.activePageName ? 0 : 1;
    return aActive - bActive;
  });

  for (const field of activeFirst) {
    addItemCodeSpeechVariants(out, seen, field?.itemCode || field?.matrixRowKey);
    addTextPhrase(out, seen, field?.rowTitle || field?.onderwerp);
    addTextPhrase(out, seen, field?.pageTitle);
    addTextPhrase(out, seen, field?.panelTitle);

    if (out.length >= 350) break;
  }

  return out.slice(0, 350);
}

function restoreAppliedSnapshotToSurvey(model, snapshot) {
  const items = Array.isArray(snapshot?.results) ? snapshot.results : [];

  for (const item of items) {
    const patch = item?.patch || null;
    const result = item?.result || null;
    if (!patch || !result?.changed) continue;

    const op = String(patch.patch_op || patch.patchOp || "SET").toUpperCase();
    const targetKind = String(patch.target_kind || patch.targetKind || "").toUpperCase();

    if (op === "APPEND_ROW" || targetKind === "MATRIX_ROW") {
      const matrixName = patch.matrix_name || patch.matrixName || patch.target_path || patch.targetPath;
      if (!matrixName) continue;

      const currentRows = model.getValue(matrixName);
      const rows = Array.isArray(currentRows) ? [...currentRows] : [];
      rows.pop();
      model.setValue(matrixName, rows);
      continue;
    }

    const matrixName = patch.matrix_name || patch.matrixName || null;
    const rowIndexRaw = patch.matrix_row_index ?? patch.matrixRowIndex;
    const columnName = patch.matrix_column_name || patch.matrixColumnName || null;

    if (matrixName && rowIndexRaw != null && columnName) {
      const rowIndex = Number(rowIndexRaw);
      const rows = Array.isArray(model.getValue(matrixName))
        ? model.getValue(matrixName).map((row) => ({ ...(row || {}) }))
        : [];

      if (rows[rowIndex]) {
        rows[rowIndex] = {
          ...(rows[rowIndex] || {}),
          [columnName]: result.oldValue,
        };
        model.setValue(matrixName, rows);
      }

      continue;
    }

    const questionName = patch.question_name || patch.questionName || patch.target_path || patch.targetPath;
    if (questionName) model.setValue(questionName, result.oldValue);
  }
}

export default function FormAssistantPanel({
  code,
  instanceId,
  surveyModel,
  canEdit,
  draftRev,
  activePageName,
  onApplied,
}) {
  const recorder = useAssistantAudioRecorder({ maxDurationMs: 60000 });

  const micIconRef = useRef(null);
  const micOffIconRef = useRef(null);
  const brainIconRef = useRef(null);
  const checkIconRef = useRef(null);
  const rejectIconRef = useRef(null);
  const helpIconRef = useRef(null);
  const undoIconRef = useRef(null);
  const helpWrapRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [selectedStep, setSelectedStep] = useState("transcript");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState("");
  const [assistantSessionId, setAssistantSessionId] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [normalized, setNormalized] = useState("");
  const [editableText, setEditableText] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [patches, setPatches] = useState([]);
  const [applied, setApplied] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const [lastApplySnapshot, setLastApplySnapshot] = useState(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoMessage, setUndoMessage] = useState("");
  const [applyStatusMessage, setApplyStatusMessage] = useState("");

  const summaries = useMemo(() => patches.map(summarizeAssistantPatch), [patches]);
  const minConfidence = useMemo(() => minPatchConfidence(patches), [patches]);

  useEffect(() => {
    if (!recorder.recording) {
      micOffIconRef.current?.stopAnimation?.();
      return;
    }

    micOffIconRef.current?.startAnimation?.();

    return () => {
      micOffIconRef.current?.stopAnimation?.();
    };
  }, [recorder.recording]);

  useEffect(() => {
    if (!helpOpen) return undefined;

    function onMouseDown(e) {
      const el = helpWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setHelpOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") setHelpOpen(false);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [helpOpen]);

  async function interpretText(text, sessionId) {
    const pageInfo = getCurrentPageInfo(surveyModel, activePageName);
    const rawFieldMap = buildAssistantFieldMapFromSurvey(surveyModel);
    const fieldMap = compactFieldMapForAssistant(rawFieldMap, pageInfo);

    setPhase("analyzing");
    setSelectedStep("analysis");

    const res = await interpretFormAssistantText(code, instanceId, {
      assistant_session_id: sessionId || assistantSessionId,
      transcript_text: text,
      field_map: fieldMap,
      entry_point: "form_runner",
      active_page_name: pageInfo.activePageName,
      active_question_name: null,
      active_section_key: null,
      client_context: {
        source: "FormAssistantPanel",
        field_map_count: fieldMap.length,
        auto_apply: autoApply,
        active_page_name: pageInfo.activePageName,
        active_page_title: pageInfo.activePageTitle,
        active_page_no: pageInfo.activePageNo,
      },
    });

    const nextPatches = Array.isArray(res?.patches) ? res.patches : [];

    setAssistantSessionId(res?.assistant_session_id || sessionId || assistantSessionId || null);
    setAssistantMessage(res?.assistant_message || "");
    setPatches(nextPatches);
    setApplied(false);
    setUndoVisible(false);
    setUndoMessage("");
    setApplyStatusMessage("");

    return {
      ...res,
      patches: nextPatches,
    };
  }

  async function applyPatches(nextPatches = patches) {
    if (!surveyModel) {
      setError("Survey model ontbreekt.");
      return null;
    }

    if (!nextPatches.length) {
      setError("Er zijn geen voorstellen om toe te passen.");
      return null;
    }

    setPhase("applying");
    setSelectedStep("apply");

    const result = applyAssistantPatchesToSurvey(surveyModel, nextPatches);
    const patchIds = getPatchIds(nextPatches);

    if (patchIds.length) {
      await applyFormAssistantPatches(code, instanceId, {
        patch_ids: patchIds,
        applied_draft_rev: draftRev ?? null,
      });
    }

    setApplied(true);
    setPhase("done");
    setLastApplySnapshot({ patches: nextPatches, result });
    setUndoVisible(true);
    setUndoMessage("");
    setApplyStatusMessage("");
    checkIconRef.current?.startAnimation?.();

    const applyFeedback = await onApplied?.({
      changed: result.changed,
      changedCount: result.changedCount,
      patches: nextPatches,
      result,
    });

    setApplyStatusMessage(
      applyFeedback?.message ||
        (result.changed
          ? "Wijzigingen zijn toegepast en opgeslagen."
          : "Geen wijzigingen toegepast.")
    );

    return result;
  }

  async function undoLastApply() {
    if (!surveyModel || !lastApplySnapshot) return;

    try {
      restoreAppliedSnapshotToSurvey(surveyModel, lastApplySnapshot.result);
      setApplied(false);
      setUndoVisible(false);
      setApplyStatusMessage("");
      undoIconRef.current?.startAnimation?.();

      const undoFeedback = await onApplied?.({
        changed: true,
        changedCount: lastApplySnapshot?.result?.changedCount || 1,
        patches: [],
        result: {
          changed: true,
          changedCount: lastApplySnapshot?.result?.changedCount || 1,
        },
      });

      setUndoMessage(
        undoFeedback?.message ||
          "Laatste toepassing is ongedaan gemaakt en opgeslagen."
      );
    } catch (e) {
      setError(getErrorMessage(e, "Terugdraaien mislukt."));
    }
  }

  async function startRecording() {
    if (!canEdit) {
      setError("De assistent kan alleen wijzigingen toepassen in Concept.");
      return;
    }

    setError("");
    setPhase("recording");
    setSelectedStep("transcript");
    setTranscript("");
    setNormalized("");
    setEditableText("");
    setAssistantMessage("");
    setPatches([]);
    setApplied(false);
    setEditingTranscript(false);
    setUndoVisible(false);
    setUndoMessage("");
    setApplyStatusMessage("");

    try {
      await recorder.start();
    } catch (e) {
      setPhase("idle");
      setError(getErrorMessage(e, "Opname starten mislukt."));
    }
  }

  async function stopAndProcess() {
    setBusy(true);
    setError("");

    try {
      const clip = await recorder.stop();

      if (!clip?.file) {
        setPhase("idle");
        setError("Geen audio opgenomen.");
        return;
      }

      const pageInfo = getCurrentPageInfo(surveyModel, activePageName);
      const rawFieldMap = buildAssistantFieldMapFromSurvey(surveyModel);
      const speechPhrases = buildSpeechPhrasesForAssistant(rawFieldMap, pageInfo);

      setPhase("transcribing");
      setSelectedStep("transcript");

      const transcribe = await transcribeFormAssistantAudio(code, instanceId, clip.file, {
        assistant_session_id: assistantSessionId || undefined,
        duration_ms: clip.durationMs,
        entry_point: "form_runner",
        active_page_name: pageInfo.activePageName,
        active_question_name: null,
        active_section_key: null,
        client_context_json: {
          source: "FormAssistantPanel",
          sample_rate: clip.sampleRate,
          file_size: clip.size,
          active_page_name: pageInfo.activePageName,
          active_page_title: pageInfo.activePageTitle,
          active_page_no: pageInfo.activePageNo,
          speech_phrases: speechPhrases,
          speech_phrase_count: speechPhrases.length,
        },
      });

      const rawTranscript = sanitizeAssistantTranscriptText(transcribe?.transcript_text || "");
      const normalizedTranscript = sanitizeAssistantTranscriptText(transcribe?.normalized_text || "");
      const text = normalizedTranscript || rawTranscript;

      setAssistantSessionId(transcribe?.assistant_session_id || null);
      setTranscript(rawTranscript);
      setNormalized(normalizedTranscript);
      setEditableText(text);

      if (!text) {
        setPhase("idle");
        setAssistantMessage("Ik heb geen tekst herkend.");
        return;
      }

      const interpreted = await interpretText(text, transcribe?.assistant_session_id || null);
      const nextPatches = interpreted?.patches || [];

      if (nextPatches.length && autoApply) {
        const confidence = minPatchConfidence(nextPatches);

        if (confidence == null || confidence >= 0.9) {
          await applyPatches(nextPatches);
          return;
        }

        setPhase("proposal");
        setSelectedStep("analysis");
        setAssistantMessage(
          interpreted?.assistant_message ||
            "Ik heb voorstellen gevonden, maar de zekerheid is te laag voor automatisch toepassen."
        );
        return;
      }

      setPhase(nextPatches.length ? "proposal" : "idle");
      setSelectedStep(nextPatches.length ? "analysis" : "transcript");
    } catch (e) {
      setPhase("idle");
      setError(getErrorMessage(e, "Assistent verwerking mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function reInterpret() {
    const text = sanitizeAssistantTranscriptText(editableText || normalized || transcript || "");
    setEditableText(text);

    if (!text) {
      setError("Er is nog geen opdracht om te analyseren.");
      return;
    }

    setBusy(true);
    setError("");
    setEditingTranscript(false);
    setPatches([]);
    setApplied(false);
    setUndoVisible(false);
    setUndoMessage("");
    setApplyStatusMessage("");

    try {
      const interpreted = await interpretText(text, assistantSessionId);
      setPhase(interpreted?.patches?.length ? "proposal" : "idle");
      setSelectedStep(interpreted?.patches?.length ? "analysis" : "transcript");
    } catch (e) {
      setPhase("idle");
      setError(getErrorMessage(e, "Interpretatie mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function applyCurrentPatches() {
    setBusy(true);
    setError("");

    try {
      await applyPatches(patches);
    } catch (e) {
      setPhase("proposal");
      setError(getErrorMessage(e, "Voorstellen toepassen mislukt."));
    } finally {
      setBusy(false);
    }
  }

  async function rejectPatches() {
    if (!patches.length) return;

    setBusy(true);
    setError("");

    try {
      const patchIds = getPatchIds(patches);

      if (patchIds.length) {
        await rejectFormAssistantPatches(code, instanceId, {
          patch_ids: patchIds,
          reason: "Afgewezen door gebruiker in FormRunner.",
        });
      }

      setPatches([]);
      setPhase("idle");
      setSelectedStep("analysis");
      setAssistantMessage("Voorstellen afgewezen.");
      rejectIconRef.current?.startAnimation?.();
    } catch (e) {
      setError(getErrorMessage(e, "Voorstellen afwijzen mislukt."));
    } finally {
      setBusy(false);
    }
  }

  const statusText = (() => {
    if (recorder.recording) return "Luistert...";
    if (phase === "transcribing") return "Transcriptie...";
    if (phase === "analyzing") return "Analyse...";
    if (phase === "applying") return "Toepassen...";
    if (phase === "done") return "Toegepast";
    if (patches.length) return "Voorstel klaar";
    return "Klaar voor opdracht";
  })();

  return (
    <div className="form-assistant-panel">
      <div className="form-assistant-panel-head">
        <div>
          <div className="form-assistant-title">Ember assistent</div>
          <div className="form-assistant-subtitle">
            Spreek een korte opdracht in. Ember transcribeert, analyseert en past veilige voorstellen direct toe.
          </div>
        </div>

        <div ref={helpWrapRef} className="form-assistant-help-wrap">
          <button
            type="button"
            className="icon-btn form-assistant-help-btn"
            title="Wat kan de assistent?"
            onClick={() => setHelpOpen((v) => !v)}
            onMouseEnter={() => helpIconRef.current?.startAnimation?.()}
            onMouseLeave={() => helpIconRef.current?.stopAnimation?.()}
          >
            <CircleHelpIcon ref={helpIconRef} size={18} />
          </button>

          {helpOpen ? (
            <div
              className="panel form-assistant-help-popover"
              role="dialog"
              aria-label="Uitleg Ember assistent"
            >
              <div className="form-assistant-help-title">Voorbeelden van opdrachten</div>
              <ul className="form-assistant-help-list">
                <li>Zet alles op ja.</li>
                <li>Zet alle vragen op deze pagina op ja.</li>
                <li>Zet melders allemaal op ja.</li>
                <li>Zet vraag 1.3 op nee.</li>
                <li>Zet D6 op ja.</li>
                <li>Zet de opmerking naast D6 op ja, toelichting hier.</li>
                <li>Zet bij 1.2 deze opmerking neer: melder is vervuild.</li>
                <li>Voeg aanvullende opmerking toe: offerte nodig voor extra paneel.</li>
              </ul>
              <div className="muted" style={{ fontSize: 12 }}>
                Direct toepassen voert zekere voorstellen meteen uit en Ember slaat ze daarna automatisch op.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="form-assistant-status-row">
        <span className="form-assistant-status-pill">{statusText}</span>

        <label className="form-assistant-toggle">
          <input
            type="checkbox"
            checked={autoApply}
            disabled={busy || recorder.recording}
            onChange={(e) => setAutoApply(e.target.checked)}
          />
          <span>Direct toepassen</span>
        </label>
      </div>

      <div className="form-assistant-steps">
        <AssistantStep
          label="Transcriptie"
          active={phase === "transcribing" || recorder.recording}
          done={Boolean(transcript || editableText)}
          selected={selectedStep === "transcript"}
          onClick={() => {
            setSelectedStep("transcript");
            if (editableText || transcript || normalized) setEditingTranscript(true);
          }}
        />
        <AssistantStep
          label="Analyse"
          active={phase === "analyzing"}
          done={Boolean(assistantMessage || patches.length)}
          selected={selectedStep === "analysis"}
          meta={patches.length ? `${patches.length} voorstel(len)` : null}
          onClick={() => setSelectedStep("analysis")}
        />
        <AssistantStep
          label="Toepassen"
          active={phase === "applying"}
          done={applied}
          selected={selectedStep === "apply"}
          meta={applied ? `${patches.length} wijziging(en)` : null}
          onClick={() => setSelectedStep("apply")}
        />
      </div>

      <div className="form-assistant-actions">
        {!recorder.recording ? (
          <button
            type="button"
            className="btn btn-primary form-assistant-main-btn"
            disabled={!canEdit || busy || recorder.busy || !recorder.supported}
            onClick={startRecording}
            onMouseEnter={() => micIconRef.current?.startAnimation?.()}
            onMouseLeave={() => micIconRef.current?.stopAnimation?.()}
            title="Start opname"
          >
            <MicIcon ref={micIconRef} size={18} />
            Spreek opdracht in
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-danger form-assistant-main-btn"
            disabled={busy}
            onClick={stopAndProcess}
            onMouseEnter={() => micOffIconRef.current?.startAnimation?.()}
            onMouseLeave={() => {
              if (!recorder.recording) micOffIconRef.current?.stopAnimation?.();
            }}
            title="Stop opname, analyseer en pas toe"
          >
            <MicOffIcon ref={micOffIconRef} size={18} />
            Stop en verwerk
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canEdit || busy || !String(editableText || normalized || transcript || "").trim()}
          onClick={reInterpret}
          onMouseEnter={() => brainIconRef.current?.startAnimation?.()}
          onMouseLeave={() => brainIconRef.current?.stopAnimation?.()}
          title="Opdracht opnieuw analyseren"
        >
          <BrainIcon ref={brainIconRef} size={18} />
          Analyseer opnieuw
        </button>
      </div>

      {!canEdit ? (
        <div className="form-assistant-muted">
          De assistent kan alleen wijzigingen toepassen wanneer het formulier in Concept staat.
        </div>
      ) : null}

      {error || recorder.lastError ? (
        <div className="form-assistant-error">
          {error || recorder.lastError}
        </div>
      ) : null}

      {selectedStep === "transcript" && (editableText || transcript || normalized || editingTranscript) ? (
        <div className="form-assistant-box">
          <button
            type="button"
            className="form-assistant-box-label form-assistant-inline-button"
            onClick={() => setEditingTranscript(true)}
            title="Transcript aanpassen"
          >
            Transcriptie
          </button>

          {editingTranscript ? (
            <textarea
              className="input form-assistant-transcript-input"
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              onBlur={() => {
                setEditingTranscript(false);
                setEditableText((prev) => sanitizeAssistantTranscriptText(prev));
              }}
              autoFocus
              rows={4}
              placeholder="Typ of corrigeer de opdracht..."
            />
          ) : (
            <button
              type="button"
              className="form-assistant-transcript form-assistant-transcript-button"
              onClick={() => setEditingTranscript(true)}
              title="Klik om de opdracht te wijzigen"
            >
              {editableText || normalized || transcript}
            </button>
          )}
        </div>
      ) : null}

      {selectedStep === "analysis" ? (
        <>
          {assistantMessage ? (
            <div className="form-assistant-muted">{assistantMessage}</div>
          ) : (
            <div className="form-assistant-muted">
              Na transcriptie zie je hier wat Ember heeft herkend.
            </div>
          )}

          {summaries.length ? (
            <div className="form-assistant-proposals">
              <div className="form-assistant-proposals-head">
                <strong>Voorstellen</strong>
                <span>{summaries.length}</span>
                {minConfidence != null ? <span>zekerheid {Math.round(minConfidence * 100)}%</span> : null}
              </div>

              <div className="form-assistant-proposal-list">
                {summaries.map((item, idx) => (
                  <div key={`${item.id || "patch"}-${idx}`} className="form-assistant-proposal">
                    <div className="form-assistant-proposal-title">{item.label}</div>
                    <div className="form-assistant-proposal-meta">
                      {item.op} ; {formatValue(item.oldValue)} → {formatValue(item.newValue)}
                    </div>
                    {item.reason ? <div className="form-assistant-proposal-reason">{item.reason}</div> : null}
                  </div>
                ))}
              </div>

              <div className="form-assistant-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || applied}
                  onClick={applyCurrentPatches}
                  onMouseEnter={() => checkIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => checkIconRef.current?.stopAnimation?.()}
                >
                  <CheckIcon ref={checkIconRef} size={18} />
                  {applied ? "Toegepast" : "Toepassen"}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || applied}
                  onClick={rejectPatches}
                  onMouseEnter={() => rejectIconRef.current?.startAnimation?.()}
                  onMouseLeave={() => rejectIconRef.current?.stopAnimation?.()}
                >
                  <FrownIcon ref={rejectIconRef} size={18} />
                  Afwijzen
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {selectedStep === "apply" ? (
        applied ? (
          <div className="form-assistant-success">
            {applyStatusMessage || "Wijzigingen zijn toegepast en opgeslagen."}
          </div>
        ) : (
          <div className="form-assistant-muted">
            Er is nog niets toegepast. Zet direct toepassen aan of bevestig voorstellen handmatig.
          </div>
        )
      ) : null}

      {undoMessage ? <div className="form-assistant-muted">{undoMessage}</div> : null}

      {undoVisible ? (
        <div className="form-assistant-undo-row">
          <button
            type="button"
            className="btn btn-secondary form-assistant-undo-btn"
            disabled={busy}
            onClick={undoLastApply}
            onMouseEnter={() => undoIconRef.current?.startAnimation?.()}
            onMouseLeave={() => undoIconRef.current?.stopAnimation?.()}
            title="Laatste toepassing lokaal terugdraaien"
          >
            <RotateCCWIcon ref={undoIconRef} size={16} />
            Terugdraaien
          </button>
        </div>
      ) : null}

      {!recorder.supported ? (
        <div className="form-assistant-error">
          Deze browser ondersteunt microfoonopname niet.
        </div>
      ) : null}
    </div>
  );
}
