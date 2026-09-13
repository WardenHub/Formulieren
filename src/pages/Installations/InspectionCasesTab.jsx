import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getInspectionCases, getInstallationCertification } from "../../api/emberApi.js";
import { certificationAppearance } from "@/lib/certificationAppearance.js";

/** Read-only installation summary; dossier mutations remain protected by the API. */
export default function InspectionCasesTab({ code }) {
  const [items, setItems] = useState([]);
  const [certification, setCertification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const [cases, certs] = await Promise.all([getInspectionCases({ q: code, active: "false", take: 500 }), getInstallationCertification(code)]);
        if (cancelled) return;
        setItems((cases?.items || []).filter((item) => item.atrium_installation_code === code));
        setCertification(certs);
      } catch (cause) { if (!cancelled) setError(cause?.message || "Inspecties laden is mislukt."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [code]);
  if (loading) return <div className="inspection-empty">Inspecties laden...</div>;
  if (error) return <div className="ember-error-text" role="alert">{error}</div>;
  const active = items.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status));
  const historical = items.filter((item) => ["COMPLETED", "CANCELLED"].includes(item.status));
  const summary = (certification?.certificate_summary || []).filter((item) => item.certificate_type === "INSPECTION");
  function casesSection(title, cases) {
    return <section className="card inspection-section"><h3>{title}</h3>
      <div className="inspection-timeline">{cases.map((item) => <Link key={item.inspection_case_id} to={`/inspecties/${item.inspection_case_id}`}>
        <strong>{item.status_display_name || item.status}</strong>
        <span>{(item.scopes || []).join(", ")} ; {item.planned_date ? `gepland ${String(item.planned_date).slice(0, 10)}` : "Nog niet gepland"}</span>
        <span>{item.inspection_body || "Keuringsinstantie nog niet gekozen"}</span>
      </Link>)}</div>{!cases.length ? <p className="muted">Geen dossiers in deze categorie.</p> : null}
    </section>;
  }
  return <div className="inspection-page">
    <section className="inspection-kpis">{summary.map((item) => <div className="card" key={item.scope}>
      <span>Inspectiecertificaat {item.scope.replace("_", "-")}</span>
      <strong>{certificationAppearance(item.certificate_status).label}</strong>
      <small>{item.source_type === "CONTRACT" ? "Eis vanuit actief contract" : item.source_type === "MANUAL" ? "Handmatige inspectie-eis" : "Geen actieve eis bevestigd"}</small>
    </div>)}</section>
    {!summary.length ? <p className="muted">Leg eerst de toepasselijke installatiesoort vast om de certificaateisen te beoordelen.</p> : null}
    <Link className="btn btn-secondary" to="/inspecties">Certificeringsmonitor</Link>
    {casesSection("Actieve inspecties", active)}
    {casesSection("Historie", historical)}
  </div>;
}
