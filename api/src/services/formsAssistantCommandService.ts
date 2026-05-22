// api/src/services/formsAssistantCommandService.ts

import { normalizeTranscriptText } from "./formsAssistantSpeechService.js";

type FieldMapItem = Record<string, any>;

type BuildArgs = {
  transcript: string;
  fieldMap: FieldMapItem[];
  activePageName?: string | null;
  clientContext?: any;
};

function cleanText(value: any) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function norm(value: any) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeItemCode(value: any) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

function normalizeAnswerValue(value: any) {
  const raw = norm(value).replace(/\./g, "");

  if (["ja", "yes", "akkoord", "ok", "oke", "goed"].includes(raw)) return "Ja";
  if (["nee", "no", "niet akkoord", "fout"].includes(raw)) return "Nee";
  if (["nvt", "nv t", "niet van toepassing"].includes(raw)) return "NVT";

  return cleanText(value);
}

function isAnswerValue(value: any) {
  return ["Ja", "Nee", "NVT"].includes(normalizeAnswerValue(value));
}

function getMatrixName(field: FieldMapItem) {
  return field?.matrixName || field?.matrix_name || field?.questionName || field?.question_name || null;
}

function getColumnName(field: FieldMapItem) {
  return field?.matrixColumnName || field?.matrix_column_name || field?.columnName || field?.column_name || null;
}

function getQuestionName(field: FieldMapItem) {
  return field?.questionName || field?.question_name || field?.name || null;
}

function getItemCode(field: FieldMapItem) {
  return field?.itemCode || field?.item_code || field?.rowItemCode || null;
}

function getPageNumber(field: FieldMapItem) {
  const n = Number(field?.pageNumber ?? field?.page_number);
  return Number.isInteger(n) ? n : null;
}

function getFieldPageName(field: FieldMapItem) {
  return cleanText(field?.pageName || field?.page_name || "") || null;
}

function getActivePageName(args: BuildArgs) {
  return cleanText(args.activePageName || args.clientContext?.active_page_name || args.clientContext?.activePageName || "") || null;
}

function isOnActivePage(field: FieldMapItem, activePageName: string | null) {
  if (!activePageName) return false;
  if (field?.isActivePage === true) return true;
  return getFieldPageName(field) === activePageName;
}

function fieldHaystack(field: FieldMapItem) {
  return [
    field?.name,
    field?.title,
    field?.label,
    field?.target_label,
    field?.targetLabel,
    field?.pageName,
    field?.pageTitle,
    field?.panelName,
    field?.panelTitle,
    field?.sectionKey,
    field?.sectionTitle,
    field?.groupKey,
    field?.matrixName,
    field?.questionName,
    field?.itemCode,
    field?.rowTitle,
    field?.onderwerp,
  ]
    .map((x) => norm(x))
    .filter(Boolean)
    .join(" ");
}

function isMatrixCell(field: FieldMapItem) {
  return norm(field?.kind) === "matrix cell" || norm(field?.kind) === "matrix_cell" || Boolean(field?.matrixName || field?.matrix_name);
}

function isAnswerField(field: FieldMapItem) {
  const col = norm(getColumnName(field));
  const name = norm(getQuestionName(field));
  const title = norm(field?.title || field?.target_label || field?.targetLabel);

  if (col === "voldoet") return true;
  if (name === "voldoet") return true;
  if (title.includes("voldoet")) return true;

  const choices = Array.isArray(field?.choices) ? field.choices : [];
  return choices.some((choice: any) => isAnswerValue(choice?.value ?? choice?.text ?? choice));
}

function isRemarkField(field: FieldMapItem) {
  const col = norm(getColumnName(field));
  const name = norm(getQuestionName(field));
  const title = norm(field?.title || field?.target_label || field?.targetLabel);

  return (
    col === "opmerking" ||
    col === "omschrijving" ||
    name.includes("opmerking") ||
    name.includes("advies") ||
    title.includes("opmerking") ||
    title.includes("omschrijving") ||
    title.includes("advies")
  );
}

function canAcceptAnswer(field: FieldMapItem, value: any) {
  const wanted = normalizeAnswerValue(value);
  const choices = Array.isArray(field?.choices) ? field.choices : [];

  if (!choices.length) return isAnswerField(field);

  return choices.some((choice: any) => {
    const v = normalizeAnswerValue(choice?.value ?? choice);
    const t = normalizeAnswerValue(choice?.text ?? choice?.label ?? choice?.title ?? choice);
    return v === wanted || t === wanted;
  });
}

function makeTargetPath(field: FieldMapItem) {
  const existing = field?.target_path || field?.targetPath || field?.path;
  if (existing) return String(existing);

  const matrixName = getMatrixName(field);
  const col = getColumnName(field);
  const rowIndex = field?.matrixRowIndex ?? field?.matrix_row_index;

  if (matrixName && col && rowIndex != null) {
    return `${matrixName}[${Number(rowIndex)}].${col}`;
  }

  return String(getQuestionName(field) || "");
}

function makePatch(args: {
  field: FieldMapItem;
  op?: string;
  sequence: number;
  targetKind?: string;
  newValue: any;
  oldValue?: any;
  transcript: string;
  reason: string;
  confidence?: number;
}) {
  const field = args.field;
  const matrixName = getMatrixName(field);
  const columnName = getColumnName(field);
  const questionName = getQuestionName(field);

  return {
    patch_op: args.op || "SET",
    patch_sequence: args.sequence,
    target_kind:
      args.targetKind ||
      (isMatrixCell(field) ? "MATRIX_CELL" : norm(field?.kind) === "matrix append" || norm(field?.kind) === "matrix_append" ? "MATRIX_ROW" : "QUESTION"),
    target_path: makeTargetPath(field),
    target_label: field?.targetLabel || field?.target_label || field?.title || makeTargetPath(field),
    question_name: questionName,
    matrix_name: matrixName,
    matrix_row_index:
      field?.matrixRowIndex == null && field?.matrix_row_index == null
        ? null
        : Number(field?.matrixRowIndex ?? field?.matrix_row_index),
    matrix_row_key: field?.matrixRowKey || field?.matrix_row_key || null,
    matrix_column_name: columnName,
    group_key: field?.groupKey || field?.group_key || field?.sectionKey || field?.section_key || null,
    item_code: getItemCode(field),
    old_value: args.oldValue ?? field?.value ?? null,
    new_value: args.newValue,
    confidence: args.confidence ?? 0.96,
    source_text: args.transcript,
    reason: args.reason,
  };
}

function visibleAnswerFields(fieldMap: FieldMapItem[]) {
  return fieldMap.filter((field) => field?.visible !== false && !field?.readOnly && isAnswerField(field));
}

function findByItemCode(fieldMap: FieldMapItem[], itemCode: string, predicate: (f: FieldMapItem) => boolean) {
  const wanted = normalizeItemCode(itemCode);

  return fieldMap.filter((field) => {
    if (normalizeItemCode(getItemCode(field)) !== wanted) return false;
    return predicate(field);
  });
}

function buildGroupAliases(groupText: string) {
  const groupNorm = norm(groupText);
  const aliases = new Set<string>();

  if (groupNorm) aliases.add(groupNorm);

  if (groupNorm.endsWith("s")) {
    aliases.add(groupNorm.slice(0, -1));
  } else if (groupNorm) {
    aliases.add(`${groupNorm}s`);
  }

  if (groupNorm === "melder" || groupNorm === "melders") {
    aliases.add("melders");
    aliases.add("melder");
    aliases.add("brandmelders");
    aliases.add("brandmelder");
    aliases.add("automatische brandmelders");
    aliases.add("automatische brandmelder");
    aliases.add("handbrandmelders");
    aliases.add("handbrandmelder");
    aliases.add("nevenindicatoren");
    aliases.add("nevenindicator");
  }

  return Array.from(aliases).filter(Boolean);
}

function findGroupAnswerFields(
  fieldMap: FieldMapItem[],
  groupText: string,
  activePageName?: string | null
) {
  const groupNorm = norm(groupText);
  const aliases = buildGroupAliases(groupText);

  if (!aliases.length) return [];

  const candidates = visibleAnswerFields(fieldMap);

  if (["alles", "alle", "vragen", "alle vragen"].includes(groupNorm)) {
    const onActivePage = candidates.filter((field) => isOnActivePage(field, activePageName || null));
    return onActivePage.length ? onActivePage : candidates;
  }

  const matches = candidates.filter((field) => {
    const haystack = fieldHaystack(field);
    return aliases.some((alias) => haystack.includes(alias));
  });

  const activeMatches = matches.filter((field) => isOnActivePage(field, activePageName || null));
  return activeMatches.length ? activeMatches : matches;
}

function findPageAnswerFields(fieldMap: FieldMapItem[], pageNumber: number) {
  return visibleAnswerFields(fieldMap).filter((field) => getPageNumber(field) === pageNumber);
}

function findAdditionalRemarksTarget(fieldMap: FieldMapItem[]) {
  return fieldMap.find((field) => {
    const h = fieldHaystack(field);
    const matrixName = norm(getMatrixName(field));
    const kind = norm(field?.kind);
    return (
      kind === "matrix append" || kind === "matrix_append"
    ) && (matrixName.includes("aanvullende_opmerkingen") || h.includes("aanvullende opmerkingen"));
  });
}

function parseRemarkForItem(text: string) {
  const patterns = [
    /\b(?:zet|maak|voeg)\s+bij\s+([a-z]?\d+(?:\.\d+)?)\s+(?:deze\s+)?opmerking(?:\s+(?:neer|toe))?\s*:?\s*(.+)$/i,
    /\bbij\s+([a-z]?\d+(?:\.\d+)?)\s+(?:deze\s+)?opmerking(?:\s+(?:neer|toe))?\s*:?\s*(.+)$/i,
    /\bvraag\s+([a-z]?\d+(?:\.\d+)?)\s+opmerking\s*:?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1] && m?.[2]) {
      return {
        itemCode: cleanText(m[1]),
        remark: cleanText(m[2]),
        append: /\bvoeg\b/i.test(text) || /\btoe\b/i.test(text),
      };
    }
  }

  return null;
}

function parseAnswerForItem(text: string) {
  const patterns = [
    /\b(?:zet|maak)\s+(?:vraag\s+)?([a-z]?\d+(?:\.\d+)?)\s+(?:op|naar)?\s*(ja|nee|n\.?v\.?t\.?|niet van toepassing)\b/i,
    /\bvraag\s+([a-z]?\d+(?:\.\d+)?)\s+(?:is|wordt)?\s*(ja|nee|n\.?v\.?t\.?|niet van toepassing)\b/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1] && m?.[2]) {
      return {
        itemCode: cleanText(m[1]),
        value: normalizeAnswerValue(m[2]),
      };
    }
  }

  return null;
}

function parsePageBulkAnswer(text: string) {
  const patterns = [
    /\b(?:zet|maak)\s+(?:alle\s+)?vragen\s+(?:bij|op|van)\s+(?:bladzijde|pagina)\s+(\d+)\s+(?:op|naar)\s+(ja|nee|n\.?v\.?t\.?|niet van toepassing)\b/i,
    /\b(?:zet|maak)\s+(?:bladzijde|pagina)\s+(\d+)\s+(?:op|naar)\s+(ja|nee|n\.?v\.?t\.?|niet van toepassing)\b/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1] && m?.[2]) {
      return {
        pageNumber: Number(m[1]),
        value: normalizeAnswerValue(m[2]),
      };
    }
  }

  return null;
}

function parseCurrentPageBulkAnswer(text: string) {
  const patterns = [
    /\b(?:zet|maak)\s+(?:alle\s+)?vragen\s+(?:op\s+)?(?:deze|huidige)\s+(?:pagina|bladzijde)\s+(?:op|naar)\s+(ja|nee|n\.?v\.?t\.?|niet van toepassing)\b/i,
    /\b(?:zet|maak)\s+(?:alles|alle\s+vragen)\s+(?:hier|op\s+deze\s+pagina|op\s+huidige\s+pagina)?\s*(?:op|naar)\s+(ja|nee|n\.?v\.?t\.?|niet van toepassing)\b/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      return {
        value: normalizeAnswerValue(m[1]),
      };
    }
  }

  return null;
}

function parseGroupBulkAnswer(text: string) {
  const answerPattern = "(ja|nee|n\\.?v\\.?t\\.?|niet van toepassing)";

  const patterns = [
    // Zet alle melder vragen op ja
    new RegExp(
      `\\b(?:zet|maak|vul)\\s+alle\\s+(.+?)\\s+vragen\\s+(?:op|naar)\\s+${answerPattern}\\b`,
      "i"
    ),

    // Zet alle melders op ja
    new RegExp(
      `\\b(?:zet|maak|vul)\\s+alle\\s+(.+?)\\s+(?:op|naar)\\s+${answerPattern}\\b`,
      "i"
    ),

    // Zet melders allemaal op ja
    new RegExp(
      `\\b(?:zet|maak|vul)\\s+(.+?)\\s+allemaal\\s+(?:op|naar)\\s+${answerPattern}\\b`,
      "i"
    ),

    // Zet melders op ja
    new RegExp(
      `\\b(?:zet|maak|vul)\\s+(.+?)\\s+(?:op|naar)\\s+${answerPattern}\\b`,
      "i"
    ),

    // Melders op ja
    new RegExp(
      `\\b(.+?)\\s+(?:op|naar)\\s+${answerPattern}\\b`,
      "i"
    ),
  ];

  const blockedGroupWords = new Set([
    "vraag",
    "vragen",
    "alles",
    "alle",
    "deze pagina",
    "pagina",
    "bladzijde",
    "opmerking",
    "aanvullende opmerking",
  ]);

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m?.[1] || !m?.[2]) continue;

    const groupText = cleanText(m[1])
      .replace(/\bvragen\b/gi, "")
      .replace(/\bvraag\b/gi, "")
      .trim();

    const groupNorm = norm(groupText);

    if (!groupNorm) continue;
    if (blockedGroupWords.has(groupNorm)) continue;

    return {
      groupText,
      value: normalizeAnswerValue(m[2]),
    };
  }

  return null;
}

function parseAdditionalRemark(text: string) {
  const patterns = [
    /\b(?:maak|voeg|zet)\s+(?:een\s+)?aanvullende\s+opmerking(?:\s+toe)?\s*:?\s*(.+)$/i,
    /\baanvullende\s+opmerking\s*:?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      return {
        remark: cleanText(m[1]),
      };
    }
  }

  return null;
}

function buildAnswerPatches(args: {
  fields: FieldMapItem[];
  value: any;
  transcript: string;
  reason: string;
  confidence?: number;
}) {
  return args.fields
    .filter((field) => canAcceptAnswer(field, args.value))
    .map((field, index) =>
      makePatch({
        field,
        sequence: index,
        newValue: args.value,
        transcript: args.transcript,
        reason: args.reason,
        confidence: args.confidence ?? 0.94,
      })
    );
}

export function buildAssistantCommandPatches(args: BuildArgs) {
  const transcript = normalizeTranscriptText(args.transcript || "");
  const fieldMap = Array.isArray(args.fieldMap) ? args.fieldMap : [];
  const activePageName = getActivePageName(args);

  if (!transcript) {
    return {
      handled: false,
      commandName: null,
      confidence: null,
      assistantMessage: "Geen tekst ontvangen.",
      patches: [],
    };
  }

  const additionalRemark = parseAdditionalRemark(transcript);
  if (additionalRemark) {
    const target = findAdditionalRemarksTarget(fieldMap);

    if (!target) {
      return {
        handled: true,
        commandName: "append_additional_remark",
        confidence: 0.35,
        assistantMessage: "Ik herkende een aanvullende opmerking, maar vond geen doelmatrix.",
        patches: [],
      };
    }

    const patch = makePatch({
      field: {
        ...target,
        target_path: getMatrixName(target) || target.target_path || "aanvullende_opmerkingen_items",
      },
      op: "APPEND_ROW",
      sequence: 0,
      targetKind: "MATRIX_ROW",
      newValue: {
        omschrijving: additionalRemark.remark,
        gevolg_certificaat: null,
      },
      transcript,
      reason: "Lokaal commando: aanvullende opmerking toevoegen.",
      confidence: 0.97,
    });

    return {
      handled: true,
      commandName: "append_additional_remark",
      confidence: 0.97,
      assistantMessage: "Ik heb een aanvullende opmerking als nieuwe regel voorgesteld.",
      patches: [patch],
    };
  }

  const remarkForItem = parseRemarkForItem(transcript);
  if (remarkForItem) {
    const targets = findByItemCode(fieldMap, remarkForItem.itemCode, isRemarkField);

    const patches = targets.slice(0, 1).map((field, index) => {
      const existing = cleanText(field?.value || "");
      const nextValue = remarkForItem.append && existing
        ? `${existing}\n${remarkForItem.remark}`
        : remarkForItem.remark;

      return makePatch({
        field,
        sequence: index,
        newValue: nextValue,
        transcript,
        reason: `Lokaal commando: opmerking bij ${remarkForItem.itemCode}.`,
        confidence: 0.97,
      });
    });

    return {
      handled: true,
      commandName: remarkForItem.append ? "append_item_remark" : "set_item_remark",
      confidence: patches.length ? 0.97 : 0.35,
      assistantMessage: patches.length
        ? `Ik heb een opmerking voor ${remarkForItem.itemCode} gevonden.`
        : `Ik herkende een opmerking voor ${remarkForItem.itemCode}, maar vond geen opmerkingveld.`,
      patches,
    };
  }

  const answerForItem = parseAnswerForItem(transcript);
  if (answerForItem) {
    const targets = findByItemCode(fieldMap, answerForItem.itemCode, (field) => {
      return isAnswerField(field) && canAcceptAnswer(field, answerForItem.value);
    });

    const patches = targets.slice(0, 1).map((field, index) =>
      makePatch({
        field,
        sequence: index,
        newValue: answerForItem.value,
        transcript,
        reason: `Lokaal commando: vraag ${answerForItem.itemCode} naar ${answerForItem.value}.`,
        confidence: 0.97,
      })
    );

    return {
      handled: true,
      commandName: "set_item_answer",
      confidence: patches.length ? 0.97 : 0.35,
      assistantMessage: patches.length
        ? `Ik zet vraag ${answerForItem.itemCode} op ${answerForItem.value}.`
        : `Ik herkende vraag ${answerForItem.itemCode}, maar vond geen passend antwoordveld.`,
      patches,
    };
  }

  const currentPageBulk = parseCurrentPageBulkAnswer(transcript);
  if (currentPageBulk) {
    const activePageFields = visibleAnswerFields(fieldMap).filter((field) => isOnActivePage(field, activePageName));
    const fallbackFields = activePageFields.length ? activePageFields : visibleAnswerFields(fieldMap);

    const patches = buildAnswerPatches({
      fields: fallbackFields,
      value: currentPageBulk.value,
      transcript,
      reason: activePageFields.length
        ? `Lokaal commando: alle vragen op huidige pagina naar ${currentPageBulk.value}.`
        : `Lokaal commando: alles naar ${currentPageBulk.value}. Geen actieve pagina ontvangen, daarom alle zichtbare antwoordvelden.`,
      confidence: activePageFields.length ? 0.95 : 0.82,
    });

    return {
      handled: true,
      commandName: activePageFields.length ? "bulk_set_current_page_answers" : "bulk_set_all_answers",
      confidence: patches.length ? (activePageFields.length ? 0.95 : 0.82) : 0.35,
      assistantMessage: patches.length
        ? `Ik heb ${patches.length} antwoordveld(en) gevonden.`
        : "Ik herkende het commando, maar vond geen passende antwoordvelden.",
      patches,
    };
  }

  const pageBulk = parsePageBulkAnswer(transcript);
  if (pageBulk) {
    const targets = findPageAnswerFields(fieldMap, pageBulk.pageNumber);

    const patches = buildAnswerPatches({
      fields: targets,
      value: pageBulk.value,
      transcript,
      reason: `Lokaal commando: alle vragen op bladzijde ${pageBulk.pageNumber} naar ${pageBulk.value}.`,
      confidence: 0.94,
    });

    return {
      handled: true,
      commandName: "bulk_set_page_answers",
      confidence: patches.length ? 0.94 : 0.35,
      assistantMessage: patches.length
        ? `Ik heb ${patches.length} wijziging(en) gevonden op bladzijde ${pageBulk.pageNumber}.`
        : `Ik herkende bladzijde ${pageBulk.pageNumber}, maar vond geen passende antwoordvelden.`,
      patches,
    };
  }

  const groupBulk = parseGroupBulkAnswer(transcript);
  if (groupBulk) {
    const targets = findGroupAnswerFields(fieldMap, groupBulk.groupText, activePageName);

    const patches = buildAnswerPatches({
      fields: targets,
      value: groupBulk.value,
      transcript,
      reason: `Lokaal commando: alle '${groupBulk.groupText}' vragen naar ${groupBulk.value}.`,
      confidence: 0.94,
    });

    return {
      handled: true,
      commandName: "bulk_set_group_answers",
      confidence: patches.length ? 0.94 : 0.35,
      assistantMessage: patches.length
        ? `Ik heb ${patches.length} wijziging(en) gevonden voor '${groupBulk.groupText}'.`
        : `Ik herkende '${groupBulk.groupText}', maar vond geen passende antwoordvelden.`,
      patches,
    };
  }

  return {
    handled: false,
    commandName: null,
    confidence: null,
    assistantMessage: "Ik heb nog geen lokaal formuliercommando herkend.",
    patches: [],
  };
}
