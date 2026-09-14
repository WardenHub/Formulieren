import { ArrowRight, Check, CircleHelp, Sparkles } from "lucide-react";

// De stap waar het dossier nu staat, gesteld als gewone vragen. Alles wat hier
// staat hoort bij deze ene processtap; het volledige dossier heeft een eigen tab.
export default function InspectionStepPanel({
  step, busy, readOnly, intro, children,
  onField, onStatus, onDocument, onDocumentStatus, onCreateAction,
  onWorkOrder, onReportField, onCertificateToggle, onAction,
}) {
  if (!step) return null;
  const disabled = busy || readOnly;
  return (
    <section className="card inspection-step" aria-label={`Stap ${step.stepNumber}: ${step.title}`}>
      <header className="inspection-step__head">
        <div>
          <span className="ember-label ember-label--accent">Stap {step.stepNumber} van {step.stepCount}</span>
          <h2>{step.title}</h2>
          <p className="ember-page-subtitle">Huidige status: {step.statusLabel}</p>
        </div>
        <span className={step.openQuestionCount ? "ember-label ember-label--warning" : "ember-label ember-label--success"}>
          {step.openQuestionCount
            ? `${step.openQuestionCount} ${step.openQuestionCount === 1 ? "vraag" : "vragen"} open`
            : "Alles beantwoord"}
        </span>
      </header>

      {step.roundFacts?.length ? (
        <dl className="inspection-step__round">
          {step.roundFacts.map((fact) => (
            <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
          ))}
        </dl>
      ) : null}
      {intro ? <p className="inspection-step__intro">{intro}</p> : null}
      {children}

      <ol className="inspection-questions">
        {step.questions.map((question, index) => (
          <li key={question.id} className="inspection-question" data-answered={question.answered ? "yes" : "no"}>
            <span className="inspection-question__marker" aria-hidden="true">
              {question.answered ? <Check size={15} /> : index + 1}
            </span>
            <div className="inspection-question__body">
              <p className="inspection-question__ask">
                <span>{question.question}</span>
                {question.required ? <span className="ember-label ember-label--warning inspection-question__tag">Verplicht</span> : null}
              </p>
              {question.help ? <p className="inspection-question__help"><CircleHelp size={13} aria-hidden="true" />{question.help}</p> : null}
              <QuestionControl
                control={question.control}
                disabled={disabled}
                onField={onField}
                onStatus={onStatus}
                onDocument={onDocument}
                onDocumentStatus={onDocumentStatus}
                onCreateAction={onCreateAction}
                onWorkOrder={onWorkOrder}
                onReportField={onReportField}
                onCertificateToggle={onCertificateToggle}
                onAction={onAction}
              />
              {question.answer ? <p className="inspection-question__answer">Nu vastgelegd: <strong>{question.answer}</strong></p> : null}
            </div>
          </li>
        ))}
      </ol>

      {step.primary && !readOnly ? (
        <div className="inspection-step__actions">
          <button className="btn inspection-step__next" disabled={busy || Boolean(step.primary.blockedReason)}
            onClick={() => onAction(step.primary.action)}>
            {busy ? "Bezig..." : step.primary.label}
            {step.primary.blockedReason ? null : <ArrowRight size={17} aria-hidden="true" />}
          </button>
          <span className="muted">
            {step.primary.blockedReason || "Je antwoorden worden pas vastgelegd als je hierop klikt."}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function QuestionControl({ control, disabled, onField, onStatus, onDocument, onDocumentStatus, onCreateAction, onWorkOrder, onReportField, onCertificateToggle, onAction }) {
  if (!control) return null;

  if (control.kind === "info") {
    return control.lines?.length
      ? <ul className="inspection-question__lines">{control.lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul>
      : null;
  }

  if (control.kind === "choice" || control.kind === "report-choice") {
    const change = control.kind === "choice"
      ? (value) => (control.field === "status" ? onStatus(value) : onField(control.field, value))
      : (value) => onReportField(control.field, value);
    return (
      <div className="inspection-answer-choices" role="group">
        {control.options.map((option) => (
          <button key={option.value} type="button" disabled={disabled}
            className={option.value === control.value ? "inspection-answer-choice is-selected" : "inspection-answer-choice"}
            aria-pressed={option.value === control.value}
            onClick={() => change(option.value)}>
            <strong>{option.label}</strong>
            {option.description ? <small>{option.description}</small> : null}
          </button>
        ))}
      </div>
    );
  }

  if (control.kind === "buttons") {
    return (
      <div className="inspection-answer-actions">
        {control.options.map((option) => (
          <span key={option.action} className="inspection-answer-action">
            <button type="button" className={option.tone === "primary" ? "btn btn-primary" : "btn btn-secondary"}
              disabled={disabled || option.disabled} onClick={() => onAction(option.action)}>{option.label}</button>
            {option.disabled && option.disabledReason ? <small className="muted">{option.disabledReason}</small> : null}
          </span>
        ))}
      </div>
    );
  }

  if (control.kind === "date" || control.kind === "report-date") {
    const change = control.kind === "date" ? onField : onReportField;
    return <input className="input inspection-answer-input" type="date" disabled={disabled}
      value={control.value || ""} onChange={(event) => change(control.field, event.target.value)} />;
  }

  if (control.kind === "text" || control.kind === "report-text") {
    const change = control.kind === "text" ? onField : onReportField;
    return <input className="input inspection-answer-input" disabled={disabled} list={control.list || undefined}
      placeholder={control.placeholder || ""} value={control.value || ""}
      onChange={(event) => change(control.field, event.target.value)} />;
  }

  if (control.kind === "workorder") {
    if (!control.options.length) {
      return <p className="inspection-question__empty">Nog geen inspectiewerkbon gevonden bij deze installatie. Gebruik Live verversen onder Volledig dossier.</p>;
    }
    return (
      <select className="input inspection-answer-input" disabled={disabled || control.locked} value={control.value}
        onChange={(event) => { if (event.target.value) onWorkOrder(event.target.value); }}>
        <option value="">Kies de werkbon</option>
        {control.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (control.kind === "report-document") {
    if (!control.options.length) return <p className="inspection-question__empty">{control.emptyText}</p>;
    return (
      <select className="input inspection-answer-input" disabled={disabled} value={control.value || ""}
        onChange={(event) => onReportField(control.field, event.target.value)}>
        <option value="">Kies het rapport</option>
        {control.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (control.kind === "certificates") {
    if (!control.options.length) return <p className="inspection-question__empty">{control.emptyText}</p>;
    return (
      <div className="inspection-answer-checklist">
        {control.options.map((option) => (
          <label key={option.value}>
            <input type="checkbox" disabled={disabled} checked={control.value.includes(option.value)}
              onChange={(event) => onCertificateToggle(option.value, event.target.checked)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (control.kind === "document") {
    const waived = control.status === "WAIVED";
    return (
      <div className="inspection-answer-document">
        {control.suggestion ? (
          <button type="button" className="inspection-answer-suggestion" disabled={disabled}
            onClick={() => onDocument(control.requirementId, control.suggestion.documentId)}>
            <Sparkles size={14} aria-hidden="true" />
            Ja, gebruik {control.suggestion.label}
          </button>
        ) : null}
        {control.options.length ? (
          <select className="input inspection-answer-input" disabled={disabled || waived} value={control.documentId}
            onChange={(event) => onDocument(control.requirementId, event.target.value)}>
            <option value="">Nog geen document gekoppeld</option>
            {control.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : <p className="inspection-question__empty">{control.emptyText}</p>}
        <div className="inspection-answer-extras">
          {control.documentId ? (
            <label className="inspection-answer-toggle">
              <input type="checkbox" disabled={disabled} checked={control.status === "CHECKED" || control.status === "SENT"}
                onChange={(event) => onDocumentStatus(control.requirementId, event.target.checked ? "CHECKED" : "AVAILABLE")} />
              <span>Inhoudelijk gecontroleerd</span>
            </label>
          ) : null}
          {control.optional ? (
            <button type="button" className="btn btn-secondary btn-compact" disabled={disabled}
              onClick={() => onDocumentStatus(control.requirementId, waived ? "MISSING" : "WAIVED")}>
              {waived ? "Toch van toepassing" : "Niet van toepassing"}
            </button>
          ) : null}
          {control.canCreateAction && !control.hasAction ? (
            <button type="button" className="btn btn-secondary btn-compact" disabled={disabled}
              onClick={() => onCreateAction(control.requirementId)}>Actie aanmaken om aan te leveren</button>
          ) : null}
          {control.hasAction ? <span className="ember-label ember-label--waiting">Actie loopt</span> : null}
        </div>
      </div>
    );
  }

  return null;
}
