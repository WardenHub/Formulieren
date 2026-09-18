import { useCallback, useEffect, useState } from "react";

import HistoryTable from "@/components/HistoryTable.jsx";
import { getInstallationHistory } from "@/api/emberApi.js";

/* De Historie van een installatie; wanneer, wie, wat.

   Alles wat Ember al vastlegde stond verspreid over de bronnen die het vastlegden: pins,
   certificaten, inspecties, actiepunten, formulieren en de synchronisatie met het Digitaal
   Logboek. Dit scherm voegt die op leesmoment samen. Er wordt niets extra opgeslagen, dus
   wat hier staat is per definitie hetzelfde als wat in de bron staat.

   De tab laadt pas als hij open staat; een dossier van jaren hoeft niet mee te komen met
   elke keer dat iemand een installatie opent. */

export default function HistoryTab({ code, isActive }) {
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState("");

  const load = useCallback(async () => {
    const clean = String(code || "").trim();
    if (!clean) return;

    setLoading(true);
    setError("");

    try {
      // Systeemregels komen altijd mee; het verbergen gebeurt in de tabel zelf, zodat de
      // schakelaar geen nieuwe aanvraag kost.
      const response = await getInstallationHistory(clean, { includeSystem: true });
      setItems(Array.isArray(response?.items) ? response.items : []);
      setSources(Array.isArray(response?.sources) ? response.sources.filter((source) => source.count > 0) : []);
      setLoadedFor(clean);
    } catch (requestError) {
      setError(requestError?.message || "De historie kon niet worden opgehaald.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (!isActive) return;
    if (loadedFor === String(code || "").trim()) return;
    void load();
  }, [isActive, code, loadedFor, load]);

  return (
    <div className="card installation-history">
      <div className="installation-history__head">
        <div>
          <strong>Historie</strong>
          <span className="muted ember-small-text">
            Wat er met deze installatie is gebeurd, uit alle onderdelen van Ember bij elkaar.
          </span>
        </div>
      </div>

      <HistoryTable
        items={items}
        loading={loading}
        error={error}
        sources={sources}
        showSystemToggle
        onRefresh={load}
        emptyLabel="Er is voor deze installatie nog niets vastgelegd."
      />
    </div>
  );
}
