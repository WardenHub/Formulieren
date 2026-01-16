import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { apiGet } from "./api";
import "./layout.css";

function initialsFromName(name, email) {
  const src = (name || "").trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
    return (a + b).toUpperCase() || "?";
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

export default function Layout() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(false); // mobiel: dicht starten
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const location = useLocation();

  useEffect(() => {
    let alive = true;

    apiGet("/me")
      .then((data) => {
        if (!alive) return;
        setMe(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || String(err));
      });

    return () => {
      alive = false;
    };
  }, []);

  // sluit menus bij route change
  useEffect(() => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // sluit dropdown bij klik buiten
  useEffect(() => {
    function onDocClick(e) {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el.closest("[data-user-menu]")) return;
      setUserMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const initials = useMemo(() => {
    return initialsFromName(me?.user?.name, me?.user?.email);
  }, [me]);

  const rolesLabel = (me?.roles || []).join(", ");

  return (
    <div className="app-shell">
      {/* topbar */}
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label="menu"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          {/* hamburger */}
          <span className="hamburger" aria-hidden="true" />
        </button>

        <Link to="/" className="brand">
          Ember
        </Link>

        <div className="topbar-spacer" />

        <a
          className="icon-btn"
          href="https://kennis.wardenburg.nl/Main/Werkwijze/Ember/"
          target="_blank"
          rel="noreferrer"
          aria-label="help"
          title="help"
        >
          ?
        </a>

        <div className="user" data-user-menu>
          <button
            className="avatar-btn"
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-label="user menu"
          >
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
          </button>

          {userMenuOpen && (
            <div className="user-menu" role="menu">
              <div className="user-menu-header">
                <div className="user-name">{me?.user?.name || "..."}</div>
                <div className="user-sub">{me?.user?.email || ""}</div>
                <div className="user-sub">{rolesLabel || ""}</div>
              </div>

              <div className="user-menu-sep" />

              {/* SWA logout endpoint */}
              <a className="user-menu-item" href="/.auth/logout">
                uitloggen
              </a>
            </div>
          )}
        </div>
      </header>

      {/* sidebar + content */}
      <div className="body">
        {/* overlay voor mobiel */}
        {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              Home
            </NavLink>
            <NavLink
              to="/installaties"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              Installatiegegevens
            </NavLink>
            <NavLink
              to="/formulieren"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              Formulier invullen
            </NavLink>

            {/* als je later admin-only items wil tonen */}
            {me?.roles?.includes("admin") && (
              <div className="nav-section">
                <div className="nav-section-title">admin</div>
                <NavLink
                  to="/admin"
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                  Beheer
                </NavLink>
              </div>
            )}
          </nav>
        </aside>

        <main className="content">
          {!me && !error && <p className="muted">laden...</p>}

          {error && (
            <div className="card">
              <h2>fout</h2>
              <pre className="pre">{error}</pre>
            </div>
          )}

          {/* als /me faalt: je SWA route config zal meestal redirecten naar login,
              maar deze fallback houdt het netjes */}
          {me && <Outlet context={{ me }} />}
        </main>
      </div>
    </div>
  );
}
