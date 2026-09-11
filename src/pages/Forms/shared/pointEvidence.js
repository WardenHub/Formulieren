export function addPointToDocumentLinks(links, actionId) {
  const id = String(actionId || "").trim();
  if (!id) throw new Error("De opvolgactie ontbreekt.");
  const existing = (Array.isArray(links) ? links : []).map((link) => ({
    follow_up_action_id: String(link.follow_up_action_id),
    is_primary: link.is_primary === true || Number(link.is_primary) === 1,
  }));
  if (!existing.some((link) => link.follow_up_action_id.toLowerCase() === id.toLowerCase())) {
    // Bestaande primaire bestanden blijven leidend; koppelen promoveert niet stil een bestand.
    existing.push({ follow_up_action_id: id, is_primary: false });
  }
  return existing;
}

export function findCreatedPointDocument(before, createdItems) {
  const ids = new Set(before.map((doc) => String(doc.form_instance_document_id).toLowerCase()));
  const created = createdItems.filter((doc) => doc.form_instance_document_id && !ids.has(String(doc.form_instance_document_id).toLowerCase()));
  if (created.length !== 1) throw new Error("De nieuwe documentregel kon niet eenduidig worden bepaald. Ververs de bijlagen voordat je opnieuw probeert.");
  return created[0];
}

export async function savePointDrawing({ draft, code, documentId, actionId, createPin, updatePin, linkPin, onSaved }) {
  const response = draft.drawing_pin_id
    ? await updatePin(code, draft.drawing_pin_id, draft)
    : await createPin(code, documentId, draft);
  const pin = response?.pin;
  if (!pin?.drawing_pin_id) throw new Error("De opgeslagen pin ontbreekt in het antwoord. Ververs de tekening voordat je opnieuw probeert.");
  // Bewaar de echte pin vóór het koppelen; een herhaalde poging werkt dezelfde pin bij.
  onSaved(pin);
  if (actionId) await linkPin(code, pin.drawing_pin_id, actionId);
  return pin;
}
