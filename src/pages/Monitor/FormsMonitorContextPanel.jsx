import { useRef } from "react";
import { Building2, UserRound } from "lucide-react";

import AnimatedIconButton from "../../components/AnimatedIconButton.jsx";
import { ArrowBigRightIcon } from "../../components/ui/arrow-big-right.jsx";
import { BadgeAlertIcon } from "../../components/ui/badge-alert.jsx";
import { BriefcaseBusinessIcon } from "../../components/ui/briefcase-business.jsx";
import { ClipboardCheckIcon } from "../../components/ui/clipboard-check.jsx";
import { MapPinIcon } from "../../components/ui/map-pin.jsx";
import { resolveActorDisplayName } from "../../lib/avatar.js";

// Waar een formulier aan vastzit heette in het datamodel context. Voor de mensen die de
// monitor gebruiken is dat geen woord; zij denken in klant, project, werkbon, installatie
// en medewerker. Die vertaling gebeurt hier, en alleen hier.
const CONTEXT_META = {
  RELATION: { label: "Klant", Icon: Building2, animated: false },
  PROJECT: { label: "Project", Icon: BriefcaseBusinessIcon, animated: true },
  WORK_ORDER: { label: "Werkbon", Icon: ClipboardCheckIcon, animated: true },
  INSTALLATION: { label: "Installatie", Icon: MapPinIcon, animated: true },
  EMPLOYEE: { label: "Medewerker", Icon: UserRound, animated: false },
};

const DERIVATION_LABELS = {
  DERIVED: "Automatisch afgeleid",
  INHERITED: "Overgenomen van het hoofdformulier",
};

// Uit de opgeslagen momentopname tonen we alleen wat een mens iets zegt. Sleutels,
// correlatie-ids en interne codes blijven bewust achterwege.
const METADATA_FIELDS = [
  { key: "obj_adr_formatted", label: "Adres" },
  { key: "installatietype_omschrijving", label: "Soort installatie" },
  { key: "relation_name", label: "Klant" },
  { key: "plaats", label: "Plaats" },
  { key: "postcode", label: "Postcode" },
];

// De precieze seconde zegt hier niets; wie leest wanneer een koppeling is gekozen wil de dag
// weten. Daarom een eigen, kortere notatie.
function formatDay(value) {
  if (!value) return "een onbekende datum";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "een onbekende datum";

  return parsed.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Een niet-herkende gebruiker komt uit de database als een kaal object-id. Dat is voor een
// lezer betekenisloos; dan liever eerlijk zeggen dat de naam niet bekend is.
function personName(value, actorLookup) {
  const resolved = resolveActorDisplayName(value, actorLookup, "");
  const trimmed = String(resolved || "").trim();
  if (!trimmed) return "onbekend";
  if (GUID_PATTERN.test(trimmed)) return "onbekend";
  return trimmed;
}

function parseMetadata(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function verificationTone(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "VERIFIED") return { tone: "success", label: "Gecontroleerd" };
  if (normalized === "STALE") return { tone: "warning", label: "Mogelijk verouderd" };
  return { tone: "warning", label: "Niet gecontroleerd" };
}

function ContextCard({ context, actorLookup }) {
  const iconRef = useRef(null);

  const type = String(context?.context_type || "").trim().toUpperCase();
  const meta =
    CONTEXT_META[type] || { label: type || "Koppeling", Icon: ClipboardCheckIcon, animated: true };
  const Icon = meta.Icon;

  const metadata = parseMetadata(context?.metadata_snapshot_json ?? context?.metadata);
  const facts = METADATA_FIELDS.map((field) => ({
    label: field.label,
    value: String(metadata?.[field.key] ?? "").trim(),
  })).filter((fact) => fact.value.length > 0);

  const verification = verificationTone(context?.verification_status);
  const derivation = DERIVATION_LABELS[String(context?.derivation_type || "").trim().toUpperCase()];

  const code = String(context?.display_code_snapshot || "").trim();
  const label = String(context?.display_label_snapshot || "").trim() || "Zonder naam";
  const installationCode = type === "INSTALLATION" ? code : "";

  return (
    <article
      className={`monitor-context-card${context?.is_primary ? " is-primary" : ""}`}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
    >
      <div className="monitor-context-card__icon" aria-hidden="true">
        {meta.animated ? <Icon ref={iconRef} size={20} /> : <Icon size={20} />}
      </div>

      <div className="monitor-context-card__body">
        <div className="monitor-context-card__head">
          <span className="monitor-context-card__type">{meta.label}</span>
          {context?.is_primary ? (
            <span className="monitor-tag monitor-tag--active">Belangrijkste</span>
          ) : null}
          {derivation ? <span className="monitor-tag monitor-tag--muted">{derivation}</span> : null}
        </div>

        <div className="monitor-context-card__label">{label}</div>
        {code ? <div className="monitor-context-card__code">{code}</div> : null}

        {facts.length ? (
          <dl className="monitor-context-card__facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="monitor-context-card__meta">
          <span>
            Gekozen door {personName(context?.selected_by, actorLookup)} op{" "}
            {formatDay(context?.selected_at)}
          </span>
          <span className={`monitor-tag monitor-tag--${verification.tone}`}>
            {verification.label}
            {context?.last_verified_at ? ` op ${formatDay(context.last_verified_at)}` : ""}
          </span>
        </div>

        {installationCode ? (
          <div className="monitor-context-card__actions">
            <AnimatedIconButton
              Icon={ArrowBigRightIcon}
              iconSize={17}
              to={`/installaties/${encodeURIComponent(installationCode)}`}
            >
              Open de installatie
            </AnimatedIconButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function FormsMonitorContextPanel({
  contexts = [],
  relationRows = [],
  actorLookup = null,
}) {
  const rows = Array.isArray(contexts) ? contexts : [];

  // De hoofdkoppeling eerst, daarna in een vaste volgorde, zodat de kaarten er bij elk
  // formulier hetzelfde uitzien.
  const order = ["INSTALLATION", "PROJECT", "WORK_ORDER", "RELATION", "EMPLOYEE"];
  const sorted = [...rows].sort((left, right) => {
    if (Boolean(left.is_primary) !== Boolean(right.is_primary)) return left.is_primary ? -1 : 1;
    const leftIndex = order.indexOf(String(left.context_type || "").toUpperCase());
    const rightIndex = order.indexOf(String(right.context_type || "").toUpperCase());
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  });

  return (
    <div className="ui-stack">
      <div className="monitor-detail-section is-open">
        <div className="monitor-detail-section__body">
          <div className="monitor-detail-section__title">Waar hoort dit formulier bij</div>
          <p className="ember-page-subtitle monitor-context-intro">
            De klant, het project, de werkbon, de installatie of de medewerker waaraan dit formulier
            vastzit. Deze gegevens zijn overgenomen op het moment dat het formulier werd gestart en
            veranderen daarna niet meer mee.
          </p>

          {sorted.length ? (
            <div className="monitor-context-grid">
              {sorted.map((context) => (
                <ContextCard
                  key={
                    context.form_instance_context_id ||
                    `${context.context_type}-${context.source_key}`
                  }
                  context={context}
                  actorLookup={actorLookup}
                />
              ))}
            </div>
          ) : (
            <div className="monitor-detail-empty-state monitor-context-empty">
              <BadgeAlertIcon size={22} aria-hidden="true" />
              <div>
                <div className="monitor-detail-section__title">Nog nergens aan gekoppeld</div>
                <p className="ember-page-subtitle">
                  Dit formulier hangt niet aan een klant, project, werkbon, installatie of
                  medewerker. Dat kan kloppen bij een los formulier, maar controleer of het bij het
                  starten wel goed gekozen is.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {relationRows.length ? (
        <div className="monitor-detail-section is-open">
          <div className="monitor-detail-section__body">
            <div className="monitor-detail-section__title">Gegevens uit Atrium</div>
            <p className="ember-page-subtitle monitor-context-intro">
              Wat er in Atrium bij deze installatie staat; object, gebruiker, beheerder en eigenaar.
            </p>
            <div className="cf-grid">
              {relationRows.map((row) => (
                <div className="cf-row" key={row.label}>
                  <div className="cf-label">
                    <div className="cf-label-text cf-label-text--accent">{row.label}</div>
                  </div>
                  <div className="cf-control">
                    <input className="input" readOnly value={row.value} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
