import { Link, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "./api";

const HELP_URL = "https://kennis.wardenburg.nl/Main/Werkwijze/Ember/";

function initials(nameOrEmail) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "?";
  const parts = s.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export default function Layout() {
  const [me, setMe] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiGet("/me").then(setMe).catch(console.error);
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setUserMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const displayName = me?.user?.name || me?.user?.email || "gebruiker";
  const roles = me?.roles || [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="icon-btn"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="menu"
            title="menu"
            type="button"
          >
            ☰
          </button>

          <div className="brand" onClick={() => navigate("/")} role="button" tabIndex={0}>
            Ember
          </div>

          {/* later: installatiecontext */}
          {/* <div className="context">Installatie 12345 – Locatie</div> */}
        </div>

        <div className="topbar-right">
          <a className="icon-btn link-btn" href={HELP_URL} target="_blank" rel="noreferrer">
            ?
          </a>

          <div className="user-menu" ref={menuRef}>
            <button
              className="avatar-btn"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-label="account"
              title={displayName}
              type="button"
            >
              <div className="avatar">{initials(displayName)}</div>
            </button>

            {userMenuOpen && (
              <div className="dropdown">
                <div className="dropdown-title">{displayName}</div>
                <div className="dropdown-sub">{roles.join(", ") || "geen rollen"}</div>

                <div className="dropdown-divider" />

                <a className="dropdown-item" href="/.auth/logout?post_logout_redirect_uri=/">
                  uitloggen
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="content-shell">
        <aside className={`sidenav ${navOpen ? "open" : ""}`}>
          <nav className="nav">
            <Link to="/" className="nav-item" onClick={() => setNavOpen(false)}>
              Home
            </Link>
            <Link to="/installaties" className="nav-item" onClick={() => setNavOpen(false)}>
              Installatiegegevens
            </Link>
            <Link to="/formulieren" className="nav-item" onClick={() => setNavOpen(false)}>
              Formulier invullen
            </Link>
          </nav>
        </aside>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
