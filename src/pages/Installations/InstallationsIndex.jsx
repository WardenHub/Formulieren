import { Link } from "react-router-dom";

export default function InstallationsIndex() {
  return (
    <div>
      <h1>Installatiegegevens</h1>
      <p>placeholder; ga direct naar een installatie:</p>

      <div style={{ display: "flex", gap: 8 }}>
        <Link to="/installaties/1">Installatie 1</Link>
        <Link to="/installaties/2">Installatie 2</Link>
      </div>
    </div>
  );
}
