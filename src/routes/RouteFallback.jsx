import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";

// Wat er staat terwijl een paginachunk binnenkomt. Elke pagina zat eerst in één bundel van
// vier en een halve megabyte die volledig gedownload en uitgevoerd moest zijn voordat er
// iets in beeld kwam. Nu komt per pagina alleen wat die pagina nodig heeft, en dit vult het
// gat van die ene keer.
//
// Bewust dezelfde vormgeving als de andere laadkaarten in Ember, zodat het niet als een
// vreemd tussenscherm voelt.
export default function RouteFallback({ label = "Pagina wordt geladen" }) {
  return (
    <div className="ember-page">
      <div className="ember-loading-card" role="status" aria-live="polite">
        <div className="ember-loading-card-inner">
          <div className="ember-loading-icon">
            <LoaderPinwheelIcon size={30} active aria-label="pagina wordt geladen" />
          </div>
          <div className="ember-loading-title">{label}</div>
        </div>
      </div>
    </div>
  );
}
