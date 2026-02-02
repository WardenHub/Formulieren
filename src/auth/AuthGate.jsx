// src/auth/AuthGate.jsx
import { useEffect, useState } from "react";
import loginGif from "../assets/login.gif";
import { getApiAccessToken } from "./msal";

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // this will either return a token or redirect to login
        const token = await getApiAccessToken();

        // if we got a token, we can render the app
        if (!cancelled && token) setReady(true);
      } catch (e) {
        // if msal throws, stay on loader; redirect normally happens via msal anyway
        console.error("auth gate failed", e);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <img
            src={loginGif}
            alt="inloggen"
            style={{ maxWidth: "100%", borderRadius: 12, marginBottom: 16 }}
          />
          <div style={{ fontSize: 18, marginBottom: 6 }}>inloggen…</div>
          <div className="muted">even geduld; je sessie wordt geladen</div>
        </div>
      </div>
    );
  }

  return children;
}
