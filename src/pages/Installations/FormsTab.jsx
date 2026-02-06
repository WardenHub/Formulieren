// /src/pages/Installations/FormsTab.jsx
import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowBigRightIcon } from "@/components/ui/arrow-big-right";
import { RocketIcon } from "@/components/ui/rocket";
import { BookmarkCheckIcon } from "@/components/ui/bookmark-check";
import { BookmarkXIcon } from "@/components/ui/bookmark-x";
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check";

import { getFormsCatalog } from "../../api/emberApi.js";

export default function FormsTab({
  code,
  installation,

  // true wanneer deze tab actief is (zoals je nu al doorgeeft)
  isActive,

  // OPTIONAL: verhoog dit getal in InstallationDetails elke keer dat tab "forms" wordt geopend
  // (lost het "terug naar tab refresh niet" probleem ook op als isActive niet netjes toggelt)
  activationToken,

  selectedFormCode,
  preflight,
  preflightLoading,
  preflightError,

  onSelectForm,
  onStartChecklist,
  onOpenTab,

  onOpenForm,

  onAnyOpenChange,
}) {
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState(null);
  const [forms, setForms] = useState([]);

  const checklistIconRef = useRef(null);

  const statusIconRef = useRef(null);
  const statusArrowRef = useRef(null);

  const lastAutoRefreshKeyRef = useRef("");

  useEffect(() => {
    onAnyOpenChange?.(false);
  }, [onAnyOpenChange]);

  const typeKey = installation?.installation_type_key || null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!code) return;

      setFormsLoading(true);
      setFormsError(null);

      try {
        const res = await getFormsCatalog(code);
        if (cancelled) return;

        const list =
          res?.items ||
          res?.data?.items ||
          res?.forms ||
          res?.data?.forms ||
          res?.data ||
          [];

        const normalized = Array.isArray(list)
          ? list
              .map((f) => ({
                code: f?.code ?? f?.form_code ?? f?.formCode ?? null,
                name: f?.label ?? f?.name ?? f?.display_name ?? f?.title ?? null,
                is_active: f?.is_active ?? true,
                is_applicable: f?.is_applicable ?? true,
              }))
              .filter((f) => f.code)
          : [];

        setForms(normalized);
      } catch (e) {
        if (cancelled) return;
        setFormsError(e?.message || String(e));
        setForms([]);
      } finally {
        if (!cancelled) setFormsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [code, typeKey]);

  // Auto-refresh preflight bij (her)activeren tab + bij wisselen van formulier.
  // - werkt op isActive toggles
  // - werkt óók als je activationToken gebruikt vanuit InstallationDetails
  useEffect(() => {
    if (!isActive) return;
    if (!selectedFormCode) return;

    const key = `${selectedFormCode}::${String(activationToken ?? "")}::${String(code ?? "")}`;
    if (lastAutoRefreshKeyRef.current === key) return;

    lastAutoRefreshKeyRef.current = key;
    onStartChecklist?.();
  }, [isActive, activationToken, selectedFormCode, code, onStartChecklist]);

  const formOptions = useMemo(() => {
    const active = forms.filter((f) => f.is_active !== false);
    return active.sort((a, b) => Number(Boolean(b.is_applicable)) - Number(Boolean(a.is_applicable)));
  }, [forms]);

  const selectedLabel = useMemo(() => {
    const hit = formOptions.find((f) => String(f.code) === String(selectedFormCode || ""));
    return hit?.name || hit?.code || "";
  }, [formOptions, selectedFormCode]);

  const blocking = Array.isArray(preflight?.blocking) ? preflight.blocking : [];
  const warnings = Array.isArray(preflight?.warnings) ? preflight.warnings : [];

  const hasPreflight =
    Boolean(selectedFormCode) && Boolean(preflight) && !preflightLoading && !preflightError;

  const okToStart = Boolean(preflight?.ok_to_start);

  function renderStatusRow() {
    if (!selectedFormCode) return null;

    if (preflightLoading) {
      return <div className="muted" style={{ paddingTop: 6 }}>Status laden…</div>;
    }

    if (preflightError) {
      return <div style={{ color: "salmon", paddingTop: 6 }}>{preflightError}</div>;
    }

    if (!preflight) return null;

    const StatusIcon = okToStart ? BookmarkCheckIcon : BookmarkXIcon;

    // Alleen klikbaar als startklaar + handler aanwezig
    const isClickable = okToStart && typeof onOpenForm === "function";

    function startOrOpen() {
      if (!isClickable) return;
      onOpenForm(selectedFormCode);
    }

    return (
      <div
        className="card"
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : -1}
        onClick={() => {
          if (isClickable) startOrOpen();
        }}
        onKeyDown={(e) => {
          if (!isClickable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startOrOpen();
          }
        }}
        onMouseEnter={() => {
          // animatie bij hover over hele balk, altijd voor status-icoon
          statusIconRef.current?.startAnimation?.();
          // pijltje/rocket alleen als die er is (startklaar)
          if (okToStart) statusArrowRef.current?.startAnimation?.();
        }}
        onMouseLeave={() => {
          statusIconRef.current?.stopAnimation?.();
          if (okToStart) statusArrowRef.current?.stopAnimation?.();
        }}
        style={{
          cursor: isClickable ? "pointer" : "default",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          // zorgt dat de hele balk klikbaar aanvoelt (ook “lege” ruimte)
          width: "100%",
        }}
        title={
          okToStart
            ? (isClickable ? `Start ${selectedLabel}` : "Formulier openen volgt")
            : "Nog niet startklaar"
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <StatusIcon ref={statusIconRef} size={18} />
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {okToStart ? "Startklaar" : "Nog niet startklaar"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {okToStart
                ? "Alle checks zijn in orde. Klik om het formulier te starten."
                : "Los blokkades op en controleer waarschuwingen."}
            </div>
          </div>
        </div>

        {/* Rechts alleen tonen als startklaar */}
        {okToStart && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
            <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              Start formulier
            </div>

            <div className="icon-btn" style={{ flex: "0 0 auto" }} aria-hidden="true">
              <RocketIcon ref={statusArrowRef} size={18} />
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderPreflight() {
    if (!selectedFormCode) return null;

    if (preflightLoading) {
      return <div className="muted" style={{ paddingTop: 10 }}>Preflight laden…</div>;
    }

    if (preflightError) {
      return <div style={{ color: "salmon", paddingTop: 10 }}>{preflightError}</div>;
    }

    if (!preflight) return null;

    return (
      <div style={{ display: "grid", gap: 10 }}>
        {blocking.length > 0 && (
          <div className="card" style={{ borderColor: "salmon" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Blokkades</div>

            <div style={{ display: "grid" }}>
              {blocking.map((b, idx) => (
                <PreflightRow
                  key={`${b?.key || "b"}-${idx}`}
                  item={b}
                  kind="blocking"
                  onOpenTab={onOpenTab}
                  showDivider={idx > 0}
                />
              ))}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Waarschuwingen</div>

            <div style={{ display: "grid" }}>
              {warnings.map((w, idx) => (
                <PreflightRow
                  key={`${w?.key || "w"}-${idx}`}
                  item={w}
                  kind="warning"
                  onOpenTab={onOpenTab}
                  showDivider={idx > 0}
                />
              ))}
            </div>
          </div>
        )}

        {blocking.length === 0 && warnings.length === 0 && (
          <div className="card">
            <div className="muted" style={{ fontSize: 13 }}>
              Geen blokkades of waarschuwingen.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Kies een formulier om te starten.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ minWidth: 360 }}
            value={selectedFormCode || ""}
            onChange={(e) => onSelectForm?.(e.target.value || null)}
            disabled={formsLoading}
          >
            <option value="">
              {formsLoading ? "Formulieren laden…" : "Selecteer formulier"}
            </option>

            {formOptions.map((f) => (
              <option key={f.code} value={f.code}>
                {f.name ? `${f.name}` : f.code}
                {f.is_applicable === false ? " (niet toepasbaar)" : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={!selectedFormCode || preflightLoading}
            onClick={() => onStartChecklist?.()}
            title={selectedFormCode ? "Status controleren" : "Kies eerst een formulier"}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
            onMouseEnter={() => checklistIconRef.current?.startAnimation?.()}
            onMouseLeave={() => checklistIconRef.current?.stopAnimation?.()}
          >
            <ClipboardCheckIcon ref={checklistIconRef} size={18} />
            Status controleren
          </button>
        </div>

        {formsError && <div style={{ color: "salmon" }}>{formsError}</div>}

        {!formsLoading && !formsError && typeKey && formOptions.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            Geen formulieren beschikbaar voor installatiesoort: {typeKey}
          </div>
        )}
      </div>

      {renderStatusRow()}

      {renderPreflight()}

      {hasPreflight && !okToStart && blocking.length > 0 && (
        <div className="muted" style={{ fontSize: 12 }}>
          Los eerst de blokkades op om te kunnen starten.
        </div>
      )}
    </div>
  );
}

function PreflightRow({ item, kind, onOpenTab, showDivider }) {
  const message = item?.message || "";
  const action = item?.action || null;

  const canNavigate =
    action &&
    action.type === "navigate_tab" &&
    (action.tab_key || action.tab);

  const navIconRef = useRef(null);

  function go() {
    const tabKey = action?.tab_key || action?.tab;
    if (tabKey) onOpenTab?.(tabKey);
  }

  return (
    <div
      role={canNavigate ? "button" : undefined}
      tabIndex={canNavigate ? 0 : -1}
      onClick={() => {
        if (canNavigate) go();
      }}
      onKeyDown={(e) => {
        if (!canNavigate) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      onMouseEnter={() => {
        if (canNavigate) navIconRef.current?.startAnimation?.();
      }}
      onMouseLeave={() => {
        if (canNavigate) navIconRef.current?.stopAnimation?.();
      }}
      style={{
        cursor: canNavigate ? "pointer" : "default",
        paddingTop: showDivider ? 10 : 0,
        marginTop: showDivider ? 10 : 0,
        borderTop: showDivider ? "1px solid rgba(255,255,255,0.08)" : "none",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
      title={canNavigate ? "Open tab" : undefined}
    >
      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ fontSize: 13 }}>{message}</div>

        {item?.key && (
          <div className="muted" style={{ fontSize: 12 }}>
            {kind === "blocking" ? "blocking" : "warning"}: {item.key}
          </div>
        )}
      </div>

      {canNavigate && (
        <div className="icon-btn" title="Open tab" style={{ flex: "0 0 auto" }}>
          <ArrowBigRightIcon ref={navIconRef} size={18} className="nav-anim-icon" />
        </div>
      )}
    </div>
  );
}
