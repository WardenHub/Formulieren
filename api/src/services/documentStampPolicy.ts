import { getUserActorCandidates } from "../utils/userIdentity.js";

function normalizeActor(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isOriginalDocumentUploader(user: any, originalUploadedBy: unknown) {
  const expected = normalizeActor(originalUploadedBy);
  if (!expected) return false;

  return getUserActorCandidates(user).some((candidate) => normalizeActor(candidate) === expected);
}
