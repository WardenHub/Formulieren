import { Link } from "react-router-dom";
import errorGif from "../assets/error.gif";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <img
          src={errorGif}
          alt="404"
          style={{
            maxWidth: "100%",
            marginBottom: 24,
            borderRadius: 12,
          }}
        />

        <h1 style={{ marginBottom: 8 }}>Pagina niet gevonden</h1>

        <p className="muted" style={{ marginBottom: 24 }}>
          Deze pagina bestaat niet (meer) of je hebt een verkeerde URL gebruikt.
        </p>

        <Link to="/" className="btn-primary">
          Terug naar start
        </Link>
      </div>
    </div>
  );
}
