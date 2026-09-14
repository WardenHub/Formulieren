import { Check, Repeat2 } from "lucide-react";

// De tijdlijn van het inspectietraject. Groen betekent vastgelegd in de historie;
// een gestippelde stap ligt achter ons maar is nooit als gebeurtenis geregistreerd.
export default function InspectionProcessTrack({ phases }) {
  return (
    <ol className="inspection-process-track" aria-label="Voortgang inspectietraject">
      {phases.map((phase, index) => (
        <li key={phase.id} data-state={phase.state} data-passed={phase.passed ? "yes" : "no"}
          aria-current={phase.state === "current" ? "step" : undefined}>
          <span className="inspection-process-dot" aria-hidden="true">
            {phase.state === "done" ? <Check size={16} /> : phase.state === "cancelled" ? "-" : index + 1}
          </span>
          <strong>
            {phase.label}
            {phase.repeatable ? <Repeat2 className="inspection-process-repeat" size={14} aria-label="Deze stap kan zich per ronde herhalen" /> : null}
          </strong>
          <small>{
            phase.state === "done" ? "Afgerond"
              : phase.state === "current" ? "Huidige stap"
                : phase.state === "cancelled" ? "Geannuleerd"
                  : phase.passed ? "Niet vastgelegd" : phase.description
          }</small>
        </li>
      ))}
    </ol>
  );
}
