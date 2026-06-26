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
    api_status: "starting",
    startup_phase: "server_listening",
    startup_message: "Ember API reageert en laadt exportonderdelen",
  });
}

export function markRuntimeRendererWarmUp(source = "startup") {
  updateRuntimeState({
    api_status: "starting",
    renderer_status: "warming",
    ready: false,
    startup_phase: `renderer_warming:${source}`,
    startup_message: "PDF-engine wordt geladen",
    last_error: null,
  });
}

export function markRuntimeRendererReady() {
  updateRuntimeState({
    api_status: "healthy",
    renderer_status: "ready",
    ready: true,
    startup_phase: "ready",
    startup_message: "healthy",
    last_error: null,
  });
}

export function markRuntimeRendererFailed(error: unknown) {
  const message = String((error as any)?.message || error || "renderer warm-up failed");
  updateRuntimeState({
    api_status: "degraded",
    renderer_status: "error",
    ready: false,
    startup_phase: "renderer_failed",
    startup_message: "PDF-engine kon niet worden geladen",
    last_error: message,
  });
}

export function getRuntimeStatusSnapshot() {
  return {
    ...runtimeState,
  };
}
