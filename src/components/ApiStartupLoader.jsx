import { useEffect, useMemo, useState } from "react";

import { getRuntimeStatus } from "@/api/emberApi.js";
import { LoaderPinwheelIcon } from "@/components/ui/loader-pinwheel";

const DEFAULT_COLD_START_COPY =
  "Dit duurt eenmalig langer als de web API in rust was. Daarna reageert Ember weer op normale snelheid.";

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeRuntimeSnapshot(snapshot) {
  return snapshot && typeof snapshot === "object" ? snapshot : null;
}

export function getApiStartupBadgeLabel(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "starting";

  return String(
    snapshot.api_status ||
      snapshot.status ||
      (snapshot.ready ? "healthy" : snapshot.startup_phase) ||
      "starting"
  );
}

export function getApiStartupStatusCopy(snapshot, loadingCopy = "De aanvraag wordt geladen.") {
  if (!snapshot || typeof snapshot !== "object") {
    return DEFAULT_COLD_START_COPY;
  }

  const apiStatus = String(snapshot.api_status || snapshot.status || "")
    .trim()
    .toLowerCase();

  if (apiStatus === "starting") {
    return snapshot.startup_message || DEFAULT_COLD_START_COPY;
  }

  if (apiStatus === "degraded") {
    return "Ember reageert weer; een achtergrondonderdeel is nog niet volledig beschikbaar.";
  }

  return loadingCopy;
}

export function useApiStartupLoader(
  loading,
  {
    slowHintDelayMs = 5000,
    pollIntervalMs = 2000,
    progressDurationSeconds = 30,
    loadingCopy = "De aanvraag wordt geladen.",
  } = {}
) {
  const [showSlowLoadingHint, setShowSlowLoadingHint] = useState(false);
  const [loadingElapsedSeconds, setLoadingElapsedSeconds] = useState(0);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(null);

  useEffect(() => {
    if (!loading) {
      setShowSlowLoadingHint(false);
      setLoadingElapsedSeconds(0);
      setRuntimeSnapshot(null);
      return undefined;
    }

    const startedAt = Date.now();
    setLoadingElapsedSeconds(0);

    const slowHintTimer = window.setTimeout(() => {
      setShowSlowLoadingHint(true);
    }, slowHintDelayMs);

    const elapsedTimer = window.setInterval(() => {
      setLoadingElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);

    return () => {
      window.clearTimeout(slowHintTimer);
      window.clearInterval(elapsedTimer);
    };
  }, [loading, slowHintDelayMs]);

  useEffect(() => {
    if (!loading) return undefined;

    let cancelled = false;

    async function pollRuntimeStatus() {
      while (!cancelled) {
        try {
          const snapshot = normalizeRuntimeSnapshot(await getRuntimeStatus());
          if (!cancelled) setRuntimeSnapshot(snapshot);
        } catch {
          if (!cancelled) setRuntimeSnapshot(null);
        }

        await sleep(pollIntervalMs);
      }
    }

    pollRuntimeStatus();

    return () => {
      cancelled = true;
    };
  }, [loading, pollIntervalMs]);

  const apiStatus = String(runtimeSnapshot?.api_status || runtimeSnapshot?.status || "")
    .trim()
    .toLowerCase();
  const showStartupCard = loading && (showSlowLoadingHint || apiStatus === "starting");
  const showInlineLoader = loading && !showStartupCard;

  return useMemo(
    () => ({
      loading,
      showStartupCard,
      showInlineLoader,
      showSlowLoadingHint,
      loadingElapsedSeconds,
      runtimeSnapshot,
      badgeLabel: getApiStartupBadgeLabel(runtimeSnapshot),
      statusCopy: getApiStartupStatusCopy(runtimeSnapshot, loadingCopy),
      progressPercent: Math.min(
        94,
        8 + (loadingElapsedSeconds / Math.max(1, progressDurationSeconds)) * 86
      ),
    }),
    [
      loading,
      showStartupCard,
      showInlineLoader,
      showSlowLoadingHint,
      loadingElapsedSeconds,
      runtimeSnapshot,
      loadingCopy,
      progressDurationSeconds,
    ]
  );
}

export default function ApiStartupLoader({
  state,
  inlineLabel = "laden",
  startupTitle = "Ember start de API op",
}) {
  if (!state?.loading) return null;

  if (state.showStartupCard) {
    return (
      <div className="ember-loading-card installations-startup-card" aria-live="polite">
        <div className="ember-loading-card-inner installations-startup-card__inner">
          <div className="ember-loading-icon installations-startup-card__icon">
            <LoaderPinwheelIcon size={30} active aria-label="api wordt opgestart" />
          </div>

          <div className="ember-loading-title">{startupTitle}</div>

          <div className="ember-page-subtitle installations-startup-card__copy">
            {state.statusCopy}
          </div>

          <div className="installations-startup-card__meta">
            <span className="ember-label ember-label--muted">{state.badgeLabel}</span>
            <span className="ember-label ember-label--muted">
              {state.loadingElapsedSeconds}s bezig
            </span>
          </div>

          <div className="installations-startup-card__progress" aria-hidden="true">
            <span
              className="installations-startup-card__progress-bar"
              style={{ width: `${state.progressPercent}%` }}
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
