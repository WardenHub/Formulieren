// Preserve unsaved fields when a checklist, upload or assignment refreshes the dossier.
export function mergeInspectionEditor(current, previousServer, nextServer) {
  if (!previousServer) return nextServer;
  return Object.fromEntries(Object.entries(nextServer).map(([key, value]) => [
    key, Object.hasOwn(current, key) && current[key] !== previousServer[key] ? current[key] : value,
  ]));
}
