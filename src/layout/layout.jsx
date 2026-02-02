// /src/layout/layout.jsx

import { httpJson } from "../api/http";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "../styles/layout.css";
import { logout } from "../auth/msal";
import { LogoutIcon } from "@/components/ui/logout";

import { HomeIcon } from "@/components/ui/home";
import { SearchIcon } from "@/components/ui/search";
import { FileTextIcon } from "@/components/ui/file-text";

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [roles, setRoles] = useState([]); 
  const menuRef = useRef(null);
  const location = useLocation();

  function AnimatedMenuItem({ onClick, Icon, children, className = "menu-item" }) {
  const iconRef = useRef(null);

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      onMouseEnter={() => iconRef.current?.startAnimation?.()}
      onMouseLeave={() => iconRef.current?.stopAnimation?.()}
    >
      <Icon ref={iconRef} size={18} className="nav-anim-icon" />
      <span>{children}</span>
    </button>
  );
}

  function AnimatedNavLink({ to, end, Icon, children }) {
    const iconRef = useRef(null);

    return (
      <NavLink
        to={to}
        end={end}
        className="nav-link nav-link--icon"
        onMouseEnter={() => iconRef.current?.startAnimation?.()}
        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      >
        <Icon ref={iconRef} size={18} className="nav-anim-icon" />
        <span>{children}</span>
      </NavLink>
    );
  }

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

    // haal rollen op
  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const data = await httpJson("/me");
        if (!cancelled) setRoles(data.roles ?? []);
      } catch (err) {
        // auth is handled by AuthGate; here we only log and keep UI stable
        console.error("me fetch failed", err);
        if (!cancelled) setRoles([]);
      }
    }

    loadMe();
    return () => { cancelled = true; };
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
              <AnimatedMenuItem
                className="menu-item danger"
                Icon={LogoutIcon}
                onClick={() => logout()}
              >
                Uitloggen
              </AnimatedMenuItem>
            </div>
          )}
        </div>
      </header>

      <div
        className={`backdrop ${navOpen ? "show" : ""}`}
        onClick={() => setNavOpen(false)}
      />

      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <nav className="nav">
          <AnimatedNavLink to="/" end Icon={HomeIcon}> Home
          </AnimatedNavLink>

          <AnimatedNavLink to="/installaties" Icon={SearchIcon}>
            Installatiegegevens
          </AnimatedNavLink>

          <AnimatedNavLink to="/formulieren" Icon={FileTextIcon}>
            Formulieren
          </AnimatedNavLink>

          {roles.includes("admin") && (
            <NavLink to="/beheer" className="nav-link">
              Beheer
            </NavLink>
          )}
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
