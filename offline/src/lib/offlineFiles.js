import { invoke } from "@tauri-apps/api/core";
import { isDesktopRuntime } from "./desktopAuth.js";

export async function saveDocumentOnDevice(packageId, fileName, blob) {
  if (!isDesktopRuntime()) return null;
  const contents = Array.from(new Uint8Array(await blob.arrayBuffer()));
  return invoke("save_offline_document", { packageId, fileName, contents });
}

export async function openDocumentFolder(packageId) {
  if (!isDesktopRuntime()) return;
  await invoke("open_offline_documents_folder", { packageId });
}

export async function removeDocumentFolder(packageId) {
  if (!isDesktopRuntime()) return;
  await invoke("remove_offline_documents_folder", { packageId });
}
