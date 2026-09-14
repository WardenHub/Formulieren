// De vragenlijst per processtap.
//
// Dit bestand bepaalt uitsluitend welke vraag de gebruiker nu krijgt en welke
// knop daarbij hoort. De API en de database blijven leidend voor wat werkelijk
// mag; een vraag die hier verschijnt is dus een uitnodiging, geen garantie.
// Alles is puur zodat het zonder browser te testen is.

import { INSPECTION_STATUS_LABELS } from "./inspectionJourney.js";
import { inspectionPhase, INSPECTION_PHASES } from "./inspectionProcess.js";

// Per checklistregel een gewone vraag in plaats van een tabelrij met codes.
const CHECKLIST_QUESTIONS = {
  LAST_MAINTENANCE_REPORT: {
    question: "Is het laatste onderhoudsrapport beschikbaar?",
    help: "Bij een BMI-installatie is dit het ingevulde onderhoudsformulier uit Ember.",
  },
  MAINTENANCE_CERTIFICATE: {
    question: "Is het onderhoudscertificaat beschikbaar?",
    help: "Het certificaat dat hoort bij het actieve onderhoudscontract.",
  },
  PROGRAM_OF_REQUIREMENTS: {
    question: "Is er een actueel Programma van Eisen?",
    help: "De keuringsinstantie toetst de installatie tegen het PvE.",
  },
  NOTICE_OF_ADDITION: {
    question: "Is er een Nota van Aanvulling op het PvE?",
    help: "Niet elke installatie heeft er een; kies dan Niet van toepassing.",
  },
  CURRENT_DRAWINGS: {
    question: "Zijn de actuele tekeningen beschikbaar?",
    help: "De revisietekeningen die de huidige situatie tonen.",
  },
  CURRENT_INSPECTION_CERTIFICATE: {
    question: "Is het huidige inspectiecertificaat beschikbaar?",
    help: "Het certificaat van de vorige inspectieronde.",
  },
  RELEVANT_INSPECTION_REPORT: {
    question: "Is er een eerder inspectierapport dat relevant is?",
    help: "Bijvoorbeeld het rapport waarop tekortkomingen zijn hersteld.",
  },
  OTHER_INSPECTION_DOCUMENT: {
    question: "Zijn er nog andere documenten die mee moeten?",
    help: "Alles wat de keuringsinstantie verder nodig heeft.",
  },
};

const CHECKLIST_ANSWERS = {
  MISSING: "Nog niet beschikbaar",
  AVAILABLE: "Beschikbaar",
  CHECKED: "Gecontroleerd",
  SENT: "Verzonden naar de keuringsinstantie",
  WAIVED: "Niet van toepassing",
};

const ROUND_LABELS = { INITIAL: "Eerste inspectieronde", FOLLOW_UP: "Vervolgronde", REINSPECTION: "Herinspectieronde" };

// De statussen waarvoor de database een datum en keuringsinstantie afdwingt.
const PLANNED_STATUSES = ["PLANNED_UNCONFIRMED", "PLANNED_CONFIRMED", "EXECUTED_AWAITING_REPORT"];

function documentLabel(document) {
  return String(document?.title || document?.file_name || "Naamloos document").trim();
}

// Alleen aanbieden wat de database ook echt toestaat vanuit de huidige status.
function statusOption(step, value, label, description) {
  return step.allowed.has(value) ? { value, label, description } : null;
}

function checklistQuestion(row, documentChoices, phaseId) {
  const copy = CHECKLIST_QUESTIONS[row.requirement_key] || {
    question: `Is "${String(row.requirement_key).replaceAll("_", " ").toLowerCase()}" beschikbaar?`,
    help: null,
  };
  const options = documentChoices.filter(
    (document) => document.document_type_key === row.document_type_key || document.document_id === row.installation_document_id,
  );
  const optional = row.requirement_level === "OPTIONAL";
  const linked = Boolean(row.installation_document_id);
  const waived = row.status === "WAIVED";
  // Eén actief document van het juiste type is vrijwel altijd het goede antwoord.
  const suggestion = !linked && !waived && options.length === 1
    ? { documentId: options[0].document_id, label: documentLabel(options[0]) }
    : null;
  return {
    id: `checklist-${row.inspection_case_document_requirement_id}`,
    group: "checklist",
    question: copy.question,
    help: copy.help,
    required: !optional,
    // De checklist slaat zichzelf direct op en houdt de stapknop dus niet tegen.
    blocking: false,
    answered: waived || linked,
    answer: waived
      ? CHECKLIST_ANSWERS.WAIVED
      : linked
        ? `${CHECKLIST_ANSWERS[row.status] || row.status}; ${row.document_title || row.file_name || "gekoppeld document"}`
        : CHECKLIST_ANSWERS.MISSING,
    control: {
      kind: "document",
      requirementId: row.inspection_case_document_requirement_id,
      documentId: row.installation_document_id || "",
      status: row.status,
      optional,
      phaseId,
      emptyText: "Nog geen document van dit type bij deze installatie in Ember.",
      hasAction: Boolean(row.follow_up_action_id),
      canCreateAction: !linked && !waived && row.status === "MISSING",
      suggestion,
      options: options.map((document) => ({ value: document.document_id, label: documentLabel(document) })),
    },
  };
}

function offerQuestions(step) {
  const { editor } = step;
  const questions = [
    {
      id: "due-date",
      question: "Wanneer moet de inspectie uiterlijk zijn uitgevoerd?",
      help: "De uiterste datum uit het contract of de vorige certificering.",
      required: false,
      blocking: false,
      answered: Boolean(editor.due_date),
      answer: editor.due_date || "Nog niet vastgelegd",
      control: { kind: "date", field: "due_date", value: editor.due_date || "" },
    },
    {
      id: "inspection-body",
      question: "Welke keuringsinstantie gaat deze inspectieronde uitvoeren?",
      help: "Eén keuringsinstantie per ronde. Verderop in het traject wordt hier niet opnieuw naar gevraagd.",
      required: false,
      blocking: false,
      answered: Boolean(String(editor.inspection_body || "").trim()),
      answer: editor.inspection_body || "Nog niet gekozen",
      control: { kind: "text", field: "inspection_body", value: editor.inspection_body || "", list: "inspection-bodies", placeholder: "Bijvoorbeeld Kiwa" },
    },
  ];
  const route = [
    statusOption(step, "OFFER_REQUIRED", "Ja, er moet eerst een offerte uit"),
    statusOption(step, "ORDERED", "Nee, de opdracht is er al"),
  ].filter(Boolean);
  if (route.length) {
    questions.push({
      id: "offer-route",
      question: step.status === "OFFER_REQUIRED"
        ? "Is de offerte inmiddels geaccepteerd?"
        : "Moet er eerst een offerte gemaakt worden?",
      help: "Calculeren en offreren gebeurt in Syntess; Ember volgt alleen waar het dossier staat.",
      required: true,
      blocking: false,
      answered: false,
      answer: INSPECTION_STATUS_LABELS[editor.status] || editor.status,
      control: {
        kind: "choice", field: "status", value: editor.status,
        options: step.status === "OFFER_REQUIRED"
          ? [{ value: "ORDERED", label: "Ja, de opdracht is binnen" }, { value: "OFFER_REQUIRED", label: "Nog niet" }]
          : route,
      },
    });
  }
  return questions;
}

function planQuestions(step) {
  const { editor, status } = step;
  const questions = [];
  if (status === "ORDERED") {
    questions.push({
      id: "ready-to-plan",
      question: "Is de opdracht verwerkt zodat er gepland kan worden?",
      help: "Zet het dossier op Planning nodig zodra de opdracht administratief klaarstaat.",
      required: true,
      blocking: false,
      answered: false,
      answer: INSPECTION_STATUS_LABELS[editor.status] || editor.status,
      control: {
        kind: "choice", field: "status", value: editor.status,
        options: [statusOption(step, "PLANNING_REQUIRED", "Ja, inplannen"), { value: "ORDERED", label: "Nog niet" }].filter(Boolean),
      },
    });
    return questions;
  }
  const needsPlanningData = PLANNED_STATUSES.includes(editor.status);
  // De keuringsinstantie hoort bij de ronde; staat hij al vast, dan vragen we er niet opnieuw naar.
  if (!step.caseInspectionBody) {
    questions.push({
      id: "inspection-body",
      question: "Welke keuringsinstantie voert deze inspectieronde uit?",
      help: "Eén keuringsinstantie per ronde; verderop wordt hier niet opnieuw naar gevraagd.",
      required: true,
      blocking: needsPlanningData,
      answered: Boolean(String(editor.inspection_body || "").trim()),
      answer: editor.inspection_body || "Nog niet gekozen",
      control: { kind: "text", field: "inspection_body", value: editor.inspection_body || "", list: "inspection-bodies", placeholder: "Bijvoorbeeld Kiwa" },
    });
  }
  questions.push({
    id: "planned-date",
    question: "Op welke datum staat de inspectie gepland?",
    help: "De datum die je met de keuringsinstantie hebt afgesproken.",
    required: true,
    blocking: needsPlanningData,
    answered: Boolean(editor.planned_date),
    answer: editor.planned_date || "Nog niet gepland",
    control: { kind: "date", field: "planned_date", value: editor.planned_date || "" },
  });
  const confirmOptions = [
    statusOption(step, "PLANNED_CONFIRMED", "Ja, de afspraak staat vast"),
    statusOption(step, "PLANNED_UNCONFIRMED", "Nee, nog niet bevestigd"),
  ].filter(Boolean);
  if (confirmOptions.length) {
    questions.push({
      id: "appointment-confirmed",
      question: "Heeft de keuringsinstantie de afspraak bevestigd?",
      help: null,
      required: true,
      blocking: false,
      answered: editor.status === "PLANNED_CONFIRMED",
      answer: INSPECTION_STATUS_LABELS[editor.status] || editor.status,
      control: { kind: "choice", field: "status", value: editor.status, options: confirmOptions },
    });
  }
  questions.push({
    id: "work-order",
    question: "Welke werkbon hoort bij deze inspectie?",
    help: "De werkbon komt live uit Syntess Atrium en is verplicht voordat je uitvoering vastlegt.",
    required: true,
    blocking: editor.status === "EXECUTED_AWAITING_REPORT",
    answered: Boolean(step.workOrderCode),
    answer: step.workOrderCode || "Nog niet gekoppeld",
    control: {
      kind: "workorder",
      value: step.workOrderKey || "",
      locked: !step.canRefreshWorkOrder,
      options: step.workOrders.map((row) => ({ value: row.atrium_work_order_key, label: `${row.atrium_work_order_code}; ${row.work_order_title || "zonder titel"}` })),
    },
  });
  for (const row of step.checklist) questions.push(checklistQuestion(row, step.documentChoices, "plan"));
  const executed = statusOption(step, "EXECUTED_AWAITING_REPORT", "Ja, de inspectie is uitgevoerd");
  if (executed) {
    questions.push({
      id: "executed",
      question: "Heeft de inspectie inmiddels plaatsgevonden?",
      help: "Kies dit pas na afloop; daarna verwacht Ember het inspectierapport.",
      required: false,
      blocking: false,
      answered: false,
      answer: INSPECTION_STATUS_LABELS[editor.status] || editor.status,
      control: { kind: "choice", field: "status", value: editor.status, options: [executed, { value: status, label: "Nog niet" }] },
    });
  }
  return questions;
}

function executeQuestions(step) {
  const { report } = step;
  const reportOptions = step.documentChoices
    .filter((document) => document.document_type_key === "inspectierapport")
    .map((document) => ({ value: document.document_id, label: documentLabel(document) }));
  return [
    {
      id: "report-file",
      question: "Welk bestand is het inspectierapport?",
      help: "Upload het rapport hierboven; daarna staat het in deze lijst.",
      required: true,
      blocking: true,
      answered: Boolean(report.document_id),
      answer: reportOptions.find((option) => option.value === report.document_id)?.label || "Nog geen rapport gekozen",
      control: { kind: "report-document", field: "document_id", value: report.document_id, options: reportOptions, emptyText: "Nog geen inspectierapport bij deze installatie in Ember." },
    },
    {
      id: "report-date",
      question: "Op welke datum is de inspectie uitgevoerd?",
      help: "Neem de datum over uit het rapport.",
      required: true,
      blocking: true,
      answered: Boolean(report.inspection_date),
      answer: report.inspection_date || "Nog niet ingevuld",
      control: { kind: "report-date", field: "inspection_date", value: report.inspection_date },
    },
    {
      id: "report-reference",
      question: "Heeft het rapport een kenmerk of nummer?",
      help: "Handig om later terug te vinden; niet verplicht.",
      required: false,
      blocking: false,
      answered: Boolean(String(report.report_reference || "").trim()),
      answer: report.report_reference || "Geen kenmerk",
      control: { kind: "report-text", field: "report_reference", value: report.report_reference, placeholder: "Bijvoorbeeld 2026-00123" },
    },
    {
      id: "report-conclusion",
      question: "Wat zegt het rapport over de installatie?",
      help: "Nog te beoordelen mag; je legt de definitieve uitkomst in de volgende stap vast.",
      required: true,
      blocking: false,
      answered: report.conclusion !== "PENDING",
      answer: { PENDING: "Nog te beoordelen", PASS: "Goedgekeurd", FAIL: "Tekortkomingen" }[report.conclusion] || report.conclusion,
      control: {
        kind: "report-choice", field: "conclusion", value: report.conclusion,
        options: [
          { value: "PENDING", label: "Nog te beoordelen" },
          { value: "PASS", label: "Goedgekeurd" },
          { value: "FAIL", label: "Tekortkomingen" },
        ],
      },
    },
  ];
}

function reviewQuestions(step) {
  if (step.status === "REPORT_RECEIVED") {
    return [
      {
        id: "verdict-certificates",
        question: "Welke inspectiecertificaten dekken dit dossier?",
        help: "Kies één combinatiecertificaat of de losse certificaten die samen alle scopes dekken. Alleen nodig bij goedkeuring.",
        required: false,
        blocking: false,
        answered: step.certificateIds.length > 0,
        answer: step.certificateIds.length ? `${step.certificateIds.length} certificaat(en) gekozen` : "Nog geen certificaat gekozen",
        control: {
          kind: "certificates", value: step.certificateIds,
          options: step.certificateChoices.map((certificate) => ({
            value: certificate.installation_certificate_id,
            label: certificate.certificate_number || certificate.description || "Certificaat zonder nummer",
          })),
          emptyText: "Nog geen geldig inspectiecertificaat geregistreerd. Registreer het certificaat hierboven.",
        },
      },
      {
        id: "verdict",
        question: "Wat is de uitkomst van de beoordeling?",
        help: "Goedkeuren kan alleen met de certificaten die de scopes dekken. Bij tekortkomingen maakt Ember een herstelactie aan en begint een nieuwe ronde rapport en herstel.",
        required: true,
        blocking: false,
        answered: false,
        answer: "Nog niet vastgelegd",
        control: {
          kind: "buttons",
          options: [
            { action: "conclude-pass", label: "Goedgekeurd vastleggen", tone: "primary", disabled: !step.certificateIds.length, disabledReason: "Kies eerst de dekkende inspectiecertificaten." },
            { action: "conclude-fail", label: "Tekortkomingen vastleggen", tone: "secondary" },
          ],
        },
      },
    ];
  }
  if (step.status === "REPAIR_REQUIRED" || step.status === "REINSPECTION_REQUIRED") {
    return [
      {
        id: "open-actions",
        question: "Welke herstelpunten staan nog open?",
        help: "Volg de acties op; de volledige lijst staat onder Volledig dossier.",
        required: false,
        blocking: false,
        answered: step.openActionCount === 0,
        answer: step.openActionCount ? `${step.openActionCount} open actie(s)` : "Geen open acties meer",
        control: { kind: "info", lines: step.openActions },
      },
      {
        id: "repair-route",
        question: "Hoe wordt het herstel opgepakt?",
        help: "Calculeren en offreren van het herstel gebeurt in Syntess, net als bij de oorspronkelijke opdracht. Ember legt die offerte nu nog niet als eigen stap vast.",
        required: false,
        blocking: false,
        answered: false,
        answer: "Wordt buiten Ember vastgelegd",
        control: {
          kind: "info",
          lines: [
            "Herstel calculeren en offreren in Syntess.",
            "Uitvoering van het herstel loopt via de bestaande werkbon of een nieuwe werkbon.",
            "Daarna een herinspectie aanmaken; dat wordt een eigen dossier met een eigen ronde.",
          ],
        },
      },
      {
        id: "reinspection",
        question: "Is het herstel klaar en moet er een herinspectie komen?",
        help: "Ember maakt dan een nieuw dossier aan dat aan dit dossier gekoppeld blijft.",
        required: false,
        blocking: false,
        answered: step.status === "REINSPECTION_REQUIRED",
        answer: step.status === "REINSPECTION_REQUIRED" ? "Herinspectie aangemaakt" : "Nog niet",
        control: { kind: "buttons", options: [{ action: "reinspection", label: "Herinspectie aanmaken", tone: "secondary", disabled: step.conclusion !== "FAIL", disabledReason: "Alleen mogelijk na een afgekeurd rapport." }] },
      },
    ];
  }
  return [];
}

function closeQuestions(step) {
  if (step.status === "COMPLETED" || step.status === "CANCELLED") {
    return [{
      id: "closed",
      question: "Dit dossier is afgerond.",
      help: "Rapporten, certificaten en historie blijven bewaard onder Volledig dossier.",
      required: false,
      blocking: false,
      answered: true,
      answer: INSPECTION_STATUS_LABELS[step.status] || step.status,
      control: { kind: "info", lines: [] },
    }];
  }
  const questions = step.checklist.map((row) => checklistQuestion(row, step.documentChoices, "close"));
  questions.push({
    id: "complete",
    question: "Is alles compleet zodat het dossier dicht kan?",
    help: "Afronden kan alleen met een actueel rapport en een geregistreerd certificaat.",
    required: true,
    blocking: false,
    answered: false,
    answer: "Nog niet afgerond",
    control: { kind: "buttons", options: [{ action: "complete", label: "Dossier afronden", tone: "primary" }] },
  });
  return questions;
}

const PHASE_BUILDERS = { offer: offerQuestions, plan: planQuestions, execute: executeQuestions, review: reviewQuestions, close: closeQuestions };

// De knop draagt de naam van de stap waar hij naartoe brengt, en gaat pas open
// wanneer de gegevens die hij wegschrijft compleet zijn.
function primaryAction(step, questions) {
  if (["COMPLETED", "CANCELLED"].includes(step.status)) return null;
  if (step.phaseId === "review" || step.phaseId === "close") return null;
  const blocker = questions.find((question) => question.blocking && !question.answered);
  const blockedReason = blocker ? `Beantwoord eerst: ${blocker.question}` : null;
  if (step.phaseId === "execute") {
    return { action: "register-report", label: "Volgende: rapport beoordelen", blockedReason };
  }
  const target = step.editor.status && step.editor.status !== step.status ? step.editor.status : null;
  return {
    action: "save-case",
    label: target ? `Volgende: ${(INSPECTION_STATUS_LABELS[target] || target).toLowerCase()}` : "Gegevens van deze stap opslaan",
    blockedReason,
  };
}

/**
 * Bouwt de vragen voor de stap waar het dossier nu staat.
 * Verwacht de gegevens zoals de detail-API ze teruggeeft.
 */
export function inspectionStepQuestions(input) {
  const caseItem = input?.caseItem || {};
  const status = String(caseItem.status || "");
  const phaseId = inspectionPhase(status) || "offer";
  const phase = INSPECTION_PHASES.find((item) => item.id === phaseId) || INSPECTION_PHASES[0];
  const actions = Array.isArray(input?.actions) ? input.actions : [];
  const step = {
    status,
    phaseId,
    editor: input?.editor || {},
    report: { document_id: "", conclusion: "PENDING", inspection_date: "", inspection_body: "", report_reference: "", ...(input?.report || {}) },
    checklist: Array.isArray(input?.checklist) ? input.checklist : [],
    documentChoices: Array.isArray(input?.documentChoices) ? input.documentChoices : [],
    workOrders: Array.isArray(input?.workOrders) ? input.workOrders : [],
    certificateChoices: Array.isArray(input?.certificateChoices) ? input.certificateChoices : [],
    certificateIds: Array.isArray(input?.certificateIds) ? input.certificateIds : [],
    allowed: new Set(Array.isArray(input?.editableStatuses) ? input.editableStatuses : []),
    workOrderKey: caseItem.atrium_work_order_key || "",
    workOrderCode: caseItem.atrium_work_order_code || "",
    caseInspectionBody: caseItem.inspection_body || "",
    conclusion: caseItem.conclusion || null,
    canRefreshWorkOrder: Boolean(input?.canRefreshWorkOrder),
    openActions: actions.map((action) => `${action.workflow_title || "Actie"}; ${action.status_display_name || action.status || ""}`.trim()),
    openActionCount: actions.length,
  };
  const questions = (PHASE_BUILDERS[phaseId] || offerQuestions)(step).filter(Boolean);
  const required = questions.filter((question) => question.required);
  // Wat voor de hele ronde geldt staat één keer bovenaan, niet als herhaalde vraag.
  const roundFacts = [
    { label: "Ronde", value: ROUND_LABELS[caseItem.inspection_type] || ROUND_LABELS.INITIAL },
    step.caseInspectionBody ? { label: "Keuringsinstantie", value: step.caseInspectionBody } : null,
    step.workOrderCode ? { label: "Werkbon", value: step.workOrderCode } : null,
  ].filter(Boolean);
  return {
    phaseId,
    stepNumber: INSPECTION_PHASES.findIndex((item) => item.id === phaseId) + 1,
    stepCount: INSPECTION_PHASES.length,
    title: phase.label,
    statusLabel: INSPECTION_STATUS_LABELS[status] || status,
    roundFacts,
    questions,
    openQuestionCount: required.filter((question) => !question.answered).length,
    primary: primaryAction(step, questions),
  };
}

export { CHECKLIST_QUESTIONS };
