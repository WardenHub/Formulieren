// De hook en de tekstfuncties staan los van het component, zodat
// ApiStartupLoader.jsx alleen nog een component exporteert en fast refresh blijft
// werken; een gemengd bestand dwingt bij elke wijziging een volledige herlaad af.

import { useEffect, useMemo, useState } from "react";

import { getRuntimeStatus } from "@/api/emberApi.js";

const DEFAULT_COLD_START_COPY =
  "Dit duurt eenmalig langer als de web API in rust was. Daarna reageert Ember weer op normale snelheid.";

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeRuntimeSnapshot(snapshot) {
  return snapshot && typeof snapshot === "object" ? snapshot : null;
}

function localizeApiStartupStatusLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) return "Opstarten";
  if (normalized === "starting") return "Opstarten";
  if (normalized === "healthy") return "Gezond";
  if (normalized === "degraded") return "Storing";
  if (normalized === "ready") return "Gereed";
  if (normalized === "warming") return "Opwarmen";
  if (normalized === "idle") return "Stand-by";
  if (normalized === "error") return "Error";
  return normalized.replace(/_/g, " ");
}

export function getApiStartupBadgeLabel(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "Opstarten";

  return localizeApiStartupStatusLabel(
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
    progressDurationSeconds = 60,
    loadingCopy = "De aanvraag wordt geladen.",
  } = {}
) {
  const [showSlowLoadingHint, setShowSlowLoadingHint] = useState(false);
  const [loadingElapsedSeconds, setLoadingElapsedSeconds] = useState(0);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(null);

  // Terugzetten naar de beginstand gebeurt in de opruimfunctie in plaats van in een
  // los effect dat op !loading meteen drie keer setState doet; dat leverde een extra
  // renderronde op bij iedere keer dat het laden klaar was.
  useEffect(() => {
    if (!loading) return undefined;

    const startedAt = Date.now();

    const slowHintTimer = window.setTimeout(() => {
      setShowSlowLoadingHint(true);
    }, slowHintDelayMs);

    const elapsedTimer = window.setInterval(() => {
      setLoadingElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);

    return () => {
      window.clearTimeout(slowHintTimer);
      window.clearInterval(elapsedTimer);
      setShowSlowLoadingHint(false);
      setLoadingElapsedSeconds(0);
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
      setRuntimeSnapshot(null);
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
