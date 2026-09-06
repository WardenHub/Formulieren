// De profielfoto van de ingelogde gebruiker, op één plek.
//
// De topbar haalt de foto op; andere schermen willen hem ook, bijvoorbeeld de kaart voor de
// marker op je eigen locatie. Dat liep eerder via window-variabelen plus een event, en dat
// was gevoelig voor de volgorde waarin React effecten uitvoert: effecten van kinderen lopen
// vóór die van de ouder, dus de kaart las de waarde soms voordat de topbar hem had gezet, en
// bleef daarna op de oude stand staan. Dan zag je een blauwe stip in plaats van je foto.
//
// Een kleine store met useSyncExternalStore heeft dat probleem niet: bij elke render wordt
// de huidige waarde gelezen, ongeacht wie er eerst was. Dezelfde opzet als de themastore in
// src/theme/appearance.js.

let snapshot = { src: null, initials: null };
const listeners = new Set();

// De momentopname houdt zijn identiteit tussen publicaties; useSyncExternalStore vergelijkt
// op referentie en zou anders bij elke render opnieuw willen tekenen.
export function getProfileAvatarSnapshot() {
  return snapshot;
}

export function subscribeProfileAvatar(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishProfileAvatar(next) {
  const src = next?.src || null;
  const initials = next?.initials || null;

  if (snapshot.src === src && snapshot.initials === initials) return;

  snapshot = { src, initials };
  for (const listener of listeners) listener();
}
