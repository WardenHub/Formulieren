type RuntimeApiStatus = "starting" | "healthy" | "degraded";
type RuntimeRendererStatus = "idle" | "warming" | "ready" | "error";

type RuntimeStatusState = {
  api_status: RuntimeApiStatus;
  renderer_status: RuntimeRendererStatus;
  ready: boolean;
  startup_phase: string;
  startup_message: string;
  started_at: string;
  updated_at: string;
  last_error: string | null;
};

const runtimeState: RuntimeStatusState = {
  api_status: "starting",
  renderer_status: "idle",
  ready: false,
  startup_phase: "booting",
  startup_message: "Ember API start op",
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_error: null,
};

function touch() {
  runtimeState.updated_at = new Date().toISOString();
}

function updateRuntimeState(patch: Partial<RuntimeStatusState>) {
  Object.assign(runtimeState, patch);
  touch();
}

export function markRuntimeServerListening() {
  updateRuntimeState({
    api_status: "healthy",
    ready: true,
    startup_phase: "ready",
    startup_message: "healthy",
  });
}

export function markRuntimeRendererWarmUp(source = "startup") {
  updateRuntimeState({
    renderer_status: "warming",
    last_error: null,
    ...(runtimeState.api_status === "starting"
      ? {
          startup_phase: `renderer_warming:${source}`,
          startup_message: "PDF-engine wordt geladen",
        }
      : {}),
  });
}

export function markRuntimeRendererReady() {
  updateRuntimeState({
    renderer_status: "ready",
    ready: true,
    api_status: runtimeState.api_status === "starting" ? "healthy" : runtimeState.api_status,
    startup_phase: runtimeState.api_status === "starting" ? "ready" : runtimeState.startup_phase,
    startup_message: runtimeState.api_status === "starting" ? "healthy" : runtimeState.startup_message,
    last_error: null,
  });
}

export function markRuntimeRendererFailed(error: unknown) {
  const message = String((error as any)?.message || error || "renderer warm-up failed");
  updateRuntimeState({
    renderer_status: "error",
    ready: runtimeState.api_status !== "starting",
    api_status: runtimeState.api_status === "starting" ? "degraded" : runtimeState.api_status,
    startup_phase: runtimeState.api_status === "starting" ? "renderer_failed" : runtimeState.startup_phase,
    startup_message:
      runtimeState.api_status === "starting"
        ? "PDF-engine kon niet worden geladen"
        : runtimeState.startup_message,
    last_error: message,
  });
}

export function getRuntimeStatusSnapshot() {
  return {
    ...runtimeState,
  };
}
