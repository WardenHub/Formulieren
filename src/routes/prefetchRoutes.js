// Warmt de zwaarst gebruikte pagina's op zodra de browser niets te doen heeft.
//
// Per route laden houdt de eerste weergave klein, maar zonder dit voelt de eerste klik naar
// de kaart of naar de formulieren als een korte hapering; de chunk moet dan nog komen. Door
// hem in de stille tijd na het opstarten al op te halen is die klik meteen open.
//
// Niet op een verbinding waar de gebruiker voor data betaalt, en niet op een langzame
// verbinding; daar is het opvragen van iets wat je misschien niet nodig hebt juist duur.

const ROUTE_LOADERS = [
  () => import("../pages/Installations/InstallationsIndex.jsx"),
  () => import("../pages/Forms/FormsHubPage.jsx"),
];

function connectionAllowsPrefetch() {
  const connection =
    typeof navigator === "undefined"
      ? null
      : navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (!connection) return true;
  if (connection.saveData) return false;

  const effectiveType = String(connection.effectiveType || "");
  return !["slow-2g", "2g", "3g"].includes(effectiveType);
}

export function prefetchLikelyRoutes() {
  if (typeof window === "undefined") return () => {};
  if (!connectionAllowsPrefetch()) return () => {};

  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    for (const load of ROUTE_LOADERS) {
      // Een mislukte prefetch is geen fout; de gewone route laadt hem straks alsnog.
      load().catch(() => {});
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 4000 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback?.(handle);
    };
  }

  const timer = window.setTimeout(run, 2500);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
