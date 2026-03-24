import {
  toNumberOrNull,
  formatMaybeNumber,
  computeEffectiveAh,
  computeRequiredAh,
  buildBrandTypeMap,
  valuesEqualLoose,
  computeHoursBetween,
  computeMeldurenNietBeschikbaar,
  sumAvailabilityMelduren,
  sumAantalMeldersFromPerformanceRows,
  computeGeconstateerdeSysteembeschikbaarheid,
} from "./calculations.jsx";

import {
  syncAllMatrixQuestionVisualErrors,
  collectValidationSummary,
} from "./validation.jsx";

function queryQuestionRoot(name) {
  const escaped =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(String(name || ""))
      : String(name || "");

  if (!escaped) return null;
  return document.querySelector(`[data-name="${escaped}"]`);
}

function isDropdownQuestion(question) {
  return String(question?.getType?.() || question?.jsonObj?.type || "").trim() === "dropdown";
}

function getDropdownAnchorElement(questionRoot) {
  if (!questionRoot) return null;

  return (
    questionRoot.querySelector(".sd-dropdown") ||
    questionRoot.querySelector(".sd-dropdown__value") ||
    questionRoot.querySelector(".sd-input") ||
    questionRoot
  );
}

function getPopupRootElement() {
  return (
    document.querySelector(".sv-popup--menu-phone") ||
    document.querySelector(".sv-popup--menu-tablet") ||
    null
  );
}

function getPopupContainerElement(popupRoot) {
  if (!popupRoot) return null;
  return popupRoot.querySelector(":scope > .sv-popup__container") || popupRoot;
}

function positionDropdownPopupUnderAnchor(popupRoot, anchorEl) {
  if (!popupRoot || !anchorEl) return false;

  const container = getPopupContainerElement(popupRoot);
  if (!container) return false;

  const rect = anchorEl.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  const gap = 6;
  const sidePadding = 16;
  const minWidth = Math.max(280, Math.round(rect.width));
  const maxWidth = Math.min(760, viewportWidth - sidePadding * 2);
  const width = Math.max(280, Math.min(minWidth, maxWidth));

  let left = Math.round(rect.left);
  let top = Math.round(rect.bottom + gap);

  if (left + width > viewportWidth - sidePadding) {
    left = Math.max(sidePadding, viewportWidth - sidePadding - width);
  }
  if (left < sidePadding) {
    left = sidePadding;
  }

  const maxHeight = Math.max(220, viewportHeight - top - sidePadding);
  if (maxHeight < 220) {
    top = Math.max(sidePadding, Math.round(rect.top - Math.min(420, viewportHeight - sidePadding * 2)));
  }

  popupRoot.classList.add("ember-dropdown-popup-inline");

  popupRoot.style.position = "fixed";
  popupRoot.style.left = `${left}px`;
  popupRoot.style.top = `${top}px`;
  popupRoot.style.right = "auto";
  popupRoot.style.bottom = "auto";
  popupRoot.style.inset = "auto";
  popupRoot.style.transform = "none";
  popupRoot.style.margin = "0";
  popupRoot.style.width = `${width}px`;
  popupRoot.style.maxWidth = `${width}px`;
  popupRoot.style.height = "auto";
  popupRoot.style.display = "block";
  popupRoot.style.zIndex = "1200";

  container.style.width = "100%";
  container.style.maxWidth = "100%";
  container.style.maxHeight = `${Math.min(420, maxHeight)}px`;
  container.style.overflow = "hidden";

  return true;
}

export function applyCapWarnings(model) {
  if (!model) return;

  const matrixRoot = queryQuestionRoot("es_regels");
  if (!matrixRoot) return;

  const rows = Array.isArray(model.getValue("es_regels")) ? model.getValue("es_regels") : [];
  const trList = matrixRoot.querySelectorAll("tbody tr");

  trList.forEach((tr, rowIndex) => {
    const row = rows[rowIndex];
    if (!row || typeof row !== "object") return;

    const aanwezige = toNumberOrNull(row.es_effectieve_ah);
    const benodigd = toNumberOrNull(row.es_benodigd_ah);

    const shouldWarn =
      aanwezige !== null &&
      benodigd !== null &&
      aanwezige < benodigd;

    const cells = tr.querySelectorAll("td");
    const aanwezigeCell = cells[5];
    const benodigdCell = cells[8];

    if (aanwezigeCell) {
      aanwezigeCell.classList.toggle("ember-cap-too-low", shouldWarn);
    }
    if (benodigdCell) {
      benodigdCell.classList.toggle("ember-cap-too-low", shouldWarn);
    }
  });
}

export function applyAvailabilityWarnings(model) {
  if (!model) return;

  const geconstateerd = toNumberOrNull(model.getValue("a2_systeembeschikbaarheid_geconstateerd"));
  const pve = toNumberOrNull(model.getValue("a2_systeembeschikbaarheid_pve"));

  const shouldWarn =
    geconstateerd !== null &&
    pve !== null &&
    geconstateerd < pve;

  const input = document.querySelector(
    '[data-name="a2_systeembeschikbaarheid_geconstateerd"] input, [data-name="a2_systeembeschikbaarheid_geconstateerd"] textarea'
  );

  if (!input) return;

  input.style.color = shouldWarn ? "red" : "";
  input.style.borderColor = shouldWarn ? "red" : "";
  input.style.boxShadow = shouldWarn ? "0 0 0 1px red inset" : "";
}

export function normalizeEnergyRows(model, prefillPayload, energyAutoStateRef) {
  if (!model) return;

  const rows = Array.isArray(model.getValue("es_regels")) ? model.getValue("es_regels") : [];
  if (!rows.length) return;

  const agingFactor = model.getValue("es_verouderingsfactor");
  const brandTypeMap = buildBrandTypeMap(prefillPayload);

  let changed = false;

  const nextRows = rows.map((r, rowIndex) => {
    const row = r && typeof r === "object" ? { ...r } : {};
    const stateKey = String(rowIndex);

    const prevState = energyAutoStateRef.current[stateKey] || {
      lastMerkType: null,
      autoCapaciteitAh: null,
      autoEffectieveAh: null,
    };

    const nextState = { ...prevState };

    const merkType = row.es_merk_type ? String(row.es_merk_type) : "";
    const brand = merkType ? brandTypeMap.get(merkType) : null;
    const merkTypeChanged = prevState.lastMerkType !== merkType;

    if (brand?.default_capacity_ah != null) {
      const defaultCap = formatMaybeNumber(brand.default_capacity_ah, 3);
      const currentCap = toNumberOrNull(row.es_capaciteit_ah);

      if (merkTypeChanged || currentCap === null) {
        if (!valuesEqualLoose(row.es_capaciteit_ah, defaultCap)) {
          row.es_capaciteit_ah = defaultCap;
          changed = true;
        }
        nextState.autoCapaciteitAh = defaultCap;
      }
    }

    const computedEffectiveAh = formatMaybeNumber(
      computeEffectiveAh(row.es_capaciteit_ah, row.es_aantal, row.es_schakeling),
      3
    );

    const currentEffective = row.es_effectieve_ah;
    const effectiveIsEmpty = toNumberOrNull(currentEffective) === null;
    const effectiveStillAuto =
      prevState.autoEffectieveAh != null &&
      valuesEqualLoose(currentEffective, prevState.autoEffectieveAh);

    if (effectiveIsEmpty || effectiveStillAuto || merkTypeChanged) {
      if (!valuesEqualLoose(currentEffective, computedEffectiveAh)) {
        row.es_effectieve_ah = computedEffectiveAh;
        changed = true;
      }
      nextState.autoEffectieveAh = computedEffectiveAh;
    }

    const requiredAh = formatMaybeNumber(
      computeRequiredAh(
        row.es_ruststroom_ma,
        row.es_alarmstroom_ma,
        row.es_overbrugging_uren,
        agingFactor
      ),
      3
    );

    if (!valuesEqualLoose(row.es_benodigd_ah, requiredAh)) {
      row.es_benodigd_ah = requiredAh;
      changed = true;
    }

    nextState.lastMerkType = merkType;
    energyAutoStateRef.current[stateKey] = nextState;

    return row;
  });

  if (changed) {
    model.setValue("es_regels", nextRows);
  } else {
    requestAnimationFrame(() => {
      applyCapWarnings(model);
    });
  }
}

export function normalizeAvailabilityRows(model, availabilityAutoStateRef) {
  if (!model) return;

  const rows = Array.isArray(model.getValue("a2_buitenbedrijfstellingen"))
    ? model.getValue("a2_buitenbedrijfstellingen")
    : [];

  const perfRows = Array.isArray(model.getValue("performance_data_view"))
    ? model.getValue("performance_data_view")
    : [];

  let changed = false;

  const nextRows = rows.map((r, rowIndex) => {
    const row = r && typeof r === "object" ? { ...r } : {};
    const stateKey = String(rowIndex);

    const prevState = availabilityAutoStateRef.current[stateKey] || {};
    availabilityAutoStateRef.current[stateKey] = { ...prevState };

    const urenPerDag = formatMaybeNumber(
      computeHoursBetween(row.tijd_begin, row.tijd_einde),
      3
    );

    if (!valuesEqualLoose(row.uren_pd_niet_beschikbaar, urenPerDag)) {
      row.uren_pd_niet_beschikbaar = urenPerDag;
      changed = true;
    }

    const meldurenNietBeschikbaar = formatMaybeNumber(
      computeMeldurenNietBeschikbaar(
        row.uren_pd_niet_beschikbaar,
        row.melders_niet_beschikbaar,
        row.tijdsduur_dagen
      ),
      3
    );

    if (!valuesEqualLoose(row.melduren_niet_beschikbaar, meldurenNietBeschikbaar)) {
      row.melduren_niet_beschikbaar = meldurenNietBeschikbaar;
      changed = true;
    }

    return row;
  });

  const totaalMeldurenBuitenWerking = sumAvailabilityMelduren(nextRows);
  const totaalAantalMelders = sumAantalMeldersFromPerformanceRows(perfRows);
  const geconstateerd = computeGeconstateerdeSysteembeschikbaarheid(
    totaalAantalMelders,
    totaalMeldurenBuitenWerking
  );

  if (changed) {
    model.setValue("a2_buitenbedrijfstellingen", nextRows);
    return;
  }

  if (!valuesEqualLoose(model.getValue("a2_melduren_buiten_werking"), totaalMeldurenBuitenWerking)) {
    model.setValue("a2_melduren_buiten_werking", totaalMeldurenBuitenWerking);
  }

  if (!valuesEqualLoose(model.getValue("a2_aantal_melders"), totaalAantalMelders)) {
    model.setValue("a2_aantal_melders", totaalAantalMelders);
  }

  if (!valuesEqualLoose(model.getValue("a2_systeembeschikbaarheid_geconstateerd"), geconstateerd)) {
    model.setValue("a2_systeembeschikbaarheid_geconstateerd", geconstateerd);
  }

  const a2Rows = Array.isArray(model.getValue("a2_items")) ? model.getValue("a2_items") : [];
  if (a2Rows.length > 0) {
    const nextA2Rows = a2Rows.map((row, idx) => {
      if (idx !== 0) return row;
      const rr = row && typeof row === "object" ? { ...row } : {};
      rr.eis = "NEN 2535:1996 & 2009 §4.4";
      return rr;
    });

    if (JSON.stringify(nextA2Rows) !== JSON.stringify(a2Rows)) {
      model.setValue("a2_items", nextA2Rows);
    }
  }

  requestAnimationFrame(() => {
    applyAvailabilityWarnings(model);
  });
}

export function attachRuntimeBehaviors({
  model,
  prefillPayload,
  energyAutoStateRef,
  availabilityAutoStateRef,
  validationActivatedRef,
  suppressDirtyRef,
  onAnswersSnapshotChange,
  onValidationSummaryChange,
}) {
  if (!model) return () => {};

  let normalizeRaf = 0;
  let validationRaf = 0;

  let activeDropdownAnchorEl = null;
  const detachDomListeners = [];

  let popupObserver = null;

  function refreshDerivedState(name) {
    const key = String(name || "");

    const isEnergyRelevant =
      key === "es_verouderingsfactor" ||
      key.startsWith("es_regels");

    const isAvailabilityRelevant =
      key === "a2_systeembeschikbaarheid_pve" ||
      key.startsWith("a2_buitenbedrijfstellingen") ||
      key.startsWith("performance_data_view") ||
      key.startsWith("a2_items");

    if (normalizeRaf) cancelAnimationFrame(normalizeRaf);

    normalizeRaf = requestAnimationFrame(() => {
      normalizeRaf = 0;

      if (isEnergyRelevant) {
        normalizeEnergyRows(model, prefillPayload, energyAutoStateRef);
      }

      if (isAvailabilityRelevant) {
        normalizeAvailabilityRows(model, availabilityAutoStateRef);
      }

      requestAnimationFrame(() => {
        applyCapWarnings(model);
        applyAvailabilityWarnings(model);
      });
    });
  }

  function refreshValidationIfNeeded() {
    if (!validationActivatedRef?.current) return;
    if (suppressDirtyRef?.current) return;

    if (validationRaf) cancelAnimationFrame(validationRaf);

    validationRaf = requestAnimationFrame(() => {
      validationRaf = 0;
      try {
        model.validate(true);
        syncAllMatrixQuestionVisualErrors(model);
        const summary = collectValidationSummary(model);
        onValidationSummaryChange?.(summary);
      } catch {
        // stil
      }
    });
  }

  function tryRepositionActiveDropdownPopup() {
    const popupRoot = getPopupRootElement();
    if (!popupRoot || !activeDropdownAnchorEl) return false;
    return positionDropdownPopupUnderAnchor(popupRoot, activeDropdownAnchorEl);
  }

  function registerDropdownAnchor(question, htmlElement) {
    if (!isDropdownQuestion(question) || !htmlElement) return;

    const root = htmlElement;
    const setAnchor = () => {
      activeDropdownAnchorEl = getDropdownAnchorElement(root);
      requestAnimationFrame(() => {
        tryRepositionActiveDropdownPopup();
      });
      window.setTimeout(() => {
        tryRepositionActiveDropdownPopup();
      }, 30);
    };

    const onPointerDown = () => {
      setAnchor();
    };

    const onFocusIn = () => {
      setAnchor();
    };

    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("focusin", onFocusIn, true);

    detachDomListeners.push(() => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("focusin", onFocusIn, true);
    });
  }

  const valueChangedHandler = (_, options) => {
    if (!suppressDirtyRef?.current) {
      onAnswersSnapshotChange?.({ ...(model.data || {}) });
    }

    requestAnimationFrame(() => {
      syncAllMatrixQuestionVisualErrors(model);
    });

    refreshDerivedState(options?.name);
    refreshValidationIfNeeded();
  };

  const afterRenderQuestionHandler = (_, options) => {
    if (options?.question?.getType?.() === "matrixdynamic") {
      requestAnimationFrame(() => {
        syncAllMatrixQuestionVisualErrors(model);
      });
    }

    registerDropdownAnchor(options?.question, options?.htmlElement);

    const qname = String(options?.question?.name || "");
    if (qname === "es_regels") {
      requestAnimationFrame(() => applyCapWarnings(model));
    }

    if (
      qname === "a2_buitenbedrijfstellingen" ||
      qname === "a2_resultaat_panel" ||
      qname === "a2_systeembeschikbaarheid_geconstateerd"
    ) {
      requestAnimationFrame(() => applyAvailabilityWarnings(model));
    }
  };

  model.onValueChanged.add(valueChangedHandler);
  model.onAfterRenderQuestion.add(afterRenderQuestionHandler);

  popupObserver = new MutationObserver(() => {
    tryRepositionActiveDropdownPopup();
  });

  popupObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  requestAnimationFrame(() => {
    normalizeEnergyRows(model, prefillPayload, energyAutoStateRef);
    normalizeAvailabilityRows(model, availabilityAutoStateRef);

    requestAnimationFrame(() => {
      applyCapWarnings(model);
      applyAvailabilityWarnings(model);
      syncAllMatrixQuestionVisualErrors(model);
      tryRepositionActiveDropdownPopup();
    });
  });

  return () => {
    if (normalizeRaf) cancelAnimationFrame(normalizeRaf);
    if (validationRaf) cancelAnimationFrame(validationRaf);

    if (popupObserver) {
      popupObserver.disconnect();
      popupObserver = null;
    }

    detachDomListeners.forEach((fn) => fn());
    detachDomListeners.length = 0;

    model.onValueChanged.remove(valueChangedHandler);
    model.onAfterRenderQuestion.remove(afterRenderQuestionHandler);
  };
}