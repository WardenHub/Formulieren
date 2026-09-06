import { useOutletContext } from "react-router-dom";

import { BadgeAlertIcon } from "@/components/ui/badge-alert.jsx";

// De schermen hadden geen enkele rolcontrole. De server weigert het werk wel, maar de
// gebruiker kwam op een pagina die zich vulde met foutmeldingen en dat leest als een storing
// in plaats van als "dit is niet voor jou". Dit vertelt het gewoon.
//
// Dit is geen beveiliging; die zit op de server. Het is er zodat een scherm niet liegt over
// wat iemand mag.
export default function RequireRole({ anyOf = [], children }) {
  const context = useOutletContext() || {};
  const roles = Array.isArray(context.roles) ? context.roles : [];

  // Zolang de rollen nog niet binnen zijn niets beweren; anders flitst er een melding voorbij
  // bij iemand die het scherm gewoon mag zien.
  if (roles.length === 0) return children;

  const allowed = anyOf.length === 0 || anyOf.some((role) => roles.includes(role));
  if (allowed) return children;

  return (
    <div className="ember-page">
      <div className="card route-denied">
        <BadgeAlertIcon size={26} />
        <div>
          <h2>Dit scherm is niet voor jouw rol</h2>
          <p className="ember-page-subtitle">
            Je hebt geen rol die dit onderdeel mag openen. Vraag een beheerder om toegang als je
            hier wel moet kunnen komen.
          </p>
        </div>
      </div>
    </div>
  );
}
