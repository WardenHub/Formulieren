import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "./layout.css";

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();

  // sluit menus bij navigatie
  useEffect(() => {
    setNavOpen(false);
    setAvatarOpen(false);
  }, [location.pathname]);

  // sluit avatar menu bij klik buiten menu
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target)) return;
      setAvatarOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label="menu"
          onClick={() => setNavOpen((v) => !v)}
        >
          ☰
        </button>

        <div className="brand">Ember</div>

        <div className="topbar-spacer" />

        <div className="avatar-wrap" ref={menuRef}>
          <button
            className="icon-btn"
            aria-label="account"
            onClick={() => setAvatarOpen((v) => !v)}
          >
            🙂
          </button>

          {avatarOpen && (
            <div className="avatar-menu" role="menu">
              <a
                className="menu-item"
                href="https://kennis.wardenburg.nl/Main/Werkwijze/Ember/"
                target="_blank"
                rel="noreferrer"
              >
                Help
              </a>

              <a className="menu-item danger" href="/.auth/logout">
                Uitloggen
              </a>
            </div>
          )}
        </div>
      </header>

      {/* overlay voor mobile */}
      <div
        className={`backdrop ${navOpen ? "show" : ""}`}
        onClick={() => setNavOpen(false)}
      />

      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            Home
          </NavLink>
          <NavLink to="/installaties" className="nav-link">
            Installatiegegevens
          </NavLink>
          <NavLink to="/formulieren" className="nav-link">
            Formulier invullen
          </NavLink>
          {roles.includes("admin") && (
            <NavLink to="/beheer" className="nav-link">Beheer</NavLink>
           )}
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
