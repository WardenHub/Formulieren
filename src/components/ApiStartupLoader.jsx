import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";

// De hook en de tekstfuncties staan in apiStartupLoaderState.js; dit bestand bevat
// bewust alleen het component.

export default function ApiStartupLoader({
  state,
  inlineLabel = "laden",
  startupTitle = "Ember start de API op",
  cardWhileLoading = false,
  loadingTitle = "Laden...",
  loadingCopy = "Bezig met gegevens laden.",
}) {
  if (!state?.loading) return null;

  if (state.showStartupCard || cardWhileLoading) {
    const showStartupDetails = state.showStartupCard;

    return (
      <div
        className="ember-loading-card installations-startup-card"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="ember-loading-card-inner installations-startup-card__inner">
          <div className="ember-loading-icon installations-startup-card__icon">
            <LoaderPinwheelIcon
              size={30}
              active
              aria-label={showStartupDetails ? "api wordt opgestart" : "laden"}
            />
          </div>

          <div className="ember-loading-title">
            {showStartupDetails ? startupTitle : loadingTitle}
          </div>

          <div className="ember-page-subtitle installations-startup-card__copy">
            {showStartupDetails ? state.statusCopy : loadingCopy}
          </div>

          {showStartupDetails ? (
            <div className="installations-startup-card__meta">
              <span className="ember-label ember-label--muted">{state.badgeLabel}</span>
              <span className="ember-label ember-label--muted">
                {state.loadingElapsedSeconds}s bezig
              </span>
            </div>
          ) : null}

          <div className="installations-startup-card__progress" aria-hidden="true">
            <span
              className={
                showStartupDetails
                  ? "installations-startup-card__progress-bar"
                  : "installations-startup-card__progress-bar installations-startup-card__progress-bar--indeterminate"
              }
              style={showStartupDetails ? { width: `${state.progressPercent}%` } : undefined}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-status muted">
      <LoaderPinwheelIcon size={18} active aria-label="laden" />
      <span>{inlineLabel}</span>
    </div>
  );
}
