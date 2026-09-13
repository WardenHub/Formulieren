import { Cloud, CloudOff, RefreshCw } from "lucide-react";

import { useOnlineStatus } from "../lib/useOnlineStatus.js";

/* Zegt of er internet is, en wat dat betekent.

   De app zei daar niets over. Voor iemand die niet technisch is, is dat precies de vraag
   die boven alles hangt: doet dit ding het wel zonder verbinding. Zonder antwoord gaat
   iemand twijfelen en in het ergste geval opnieuw beginnen.

   Daarom staat hier altijd een regel, ook als alles goed is. Offline is hier geen storing
   maar de bedoeling, en dat mag de tekst ook uitstralen. */

export default function ConnectionStrip({
  wachtendAantal = 0,
  conflictAantal = 0,
  onSync,
  syncBezig = false,
  compact = false,
}) {
  const online = useOnlineStatus();
  const wachtend = Number(wachtendAantal) || 0;
  const conflicten = Number(conflictAantal) || 0;

  /* Blijven er alleen conflicten over, dan is "kan terug naar Ember" niet waar: opnieuw
     versturen levert precies hetzelfde antwoord op tot iemand het online bekijkt. De knop
     blijft wel staan, want misschien is het daar intussen opgelost. */
  const alleenConflicten = wachtend > 0 && conflicten >= wachtend;

  const stand = online ? (wachtend > 0 ? "terugsturen" : "online") : "offline";

  const tekst = {
    offline:
      wachtend > 0
        ? `Geen internet. Je kunt gewoon doorwerken; alles staat op dit apparaat. ${wachtend} ${wachtend === 1 ? "formulier wacht" : "formulieren wachten"} tot je weer verbinding hebt.`
        : "Geen internet. Je kunt gewoon doorwerken; alles staat op dit apparaat.",
    /* Zolang het terugsturen nog niet in de app zit, hoort hier te staan wat de monteur nu
       wel kan doen. Een zin die iets belooft zonder knop is een doodlopende weg. */
    terugsturen: !onSync
      ? `Je hebt weer internet. ${wachtend} ${wachtend === 1 ? "formulier is" : "formulieren zijn"} klaar; rond ${wachtend === 1 ? "het" : "ze"} af in Ember op de computer.`
      : alleenConflicten
        ? `${wachtend} ${wachtend === 1 ? "formulier is" : "formulieren zijn"} online gewijzigd; open ${wachtend === 1 ? "het" : "ze"} in Ember op de computer. Is dat gebeurd, dan kun je hier opnieuw terugsturen.`
        : `Je hebt weer internet. ${wachtend} ${wachtend === 1 ? "formulier kan" : "formulieren kunnen"} terug naar Ember.`,
    online: "Je hebt internet. Je kunt formulieren ophalen of terugsturen.",
  }[stand];

  return (
    <div
      className={`eo-connection eo-connection--${stand}${compact ? " eo-connection--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="eo-connection__icon" aria-hidden="true">
        {online ? <Cloud size={18} /> : <CloudOff size={18} />}
      </span>

      <span className="eo-connection__text">{tekst}</span>

      {/* De knop verschijnt alleen wanneer er iets te doen is en het ook kan. Een knop die
          niets doet is erger dan geen knop. */}
      {stand === "terugsturen" && onSync ? (
        <button type="button" className="eo-btn eo-btn--primary eo-connection__button" onClick={onSync} disabled={syncBezig}>
          <RefreshCw size={16} className={syncBezig ? "eo-spin" : undefined} />
          {syncBezig ? "Bezig met terugsturen" : alleenConflicten ? "Opnieuw terugsturen" : "Terugsturen naar Ember"}
        </button>
      ) : null}
    </div>
  );
}
