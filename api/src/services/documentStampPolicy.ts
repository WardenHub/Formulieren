import { getUserActorCandidates } from "../utils/userIdentity.js";

function normalizeActor(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isOriginalDocumentUploader(user: any, originalUploadedBy: unknown) {
  const expected = normalizeActor(originalUploadedBy);
  if (!expected) return false;

  return getUserActorCandidates(user).some((candidate) => normalizeActor(candidate) === expected);
}

/* Een gecontroleerd-stempel hoort van iemand anders te komen dan de uploader; vier ogen op een
   document dat de deur uit gaat. In de praktijk uploadt iemand geregeld voor een collega, en dan
   blokkeerde die regel werk dat gewoon klopt.

   De uitzondering mag, maar niet stilzwijgend. Wie zijn eigen upload aftekent zegt waarom, en dat
   komt met zijn naam op het stempel te staan. Een lege of nietszeggende reden telt niet; dan is
   het alsnog een blokkade. */
export function isValidSelfApprovalReason(value: unknown) {
  return String(value || "").trim().length >= 10;
}
