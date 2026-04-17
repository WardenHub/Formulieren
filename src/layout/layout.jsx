import { httpJson } from "../api/http";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/layout.css";
import { logout } from "../auth/msal";
import { LogoutIcon } from "@/components/ui/logout";
import { IdCardIcon } from "@/components/ui/id-card";
import { CircleHelpIcon } from "@/components/ui/circle-help";

import { HomeIcon } from "@/components/ui/home";
import { SearchIcon } from "@/components/ui/search";
import { BrainIcon } from "@/components/ui/brain";
import { MonitorCheckIcon } from "@/components/ui/monitor-check";

function buildInitials(name, email) {
  const source = String(name || email || "").trim();
  if (!source) return "E";

  const parts = source
    .replace(/[|]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function resolveAppearance(pref) {
  const v = String(pref || "system").toLowerCase();
  if (v === "dark" || v === "light") return v;

  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  return "dark";
}

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [profile, setProfile] = useState(null);
  const menuRef = useRef(null);
  const location = useLocation();

  function AnimatedMenuItem({ to = null, href = null, onClick, Icon, children, className = "menu-item" }) {
    const iconRef = useRef(null);

    if (to) {
      return (
        <NavLink
          to={to}
          className={className}
          onClick={onClick}
          onMouseEnter={() => iconRef.current?.startAnimation?.()}
          onMouseLeave={() => iconRef.current?.stopAnimation?.()}
        >
          <Icon ref={iconRef} size={18} className="nav-anim-icon" />
          <span>{children}</span>
        </NavLink>
      );
    }

    if (href) {
      return (
        <a
          className={className}
          href={href}
          target="_blank"
          rel="noreferrer"
          onMouseEnter={() => iconRef.current?.startAnimation?.()}
          onMouseLeave={() => iconRef.current?.stopAnimation?.()}
        >
          <Icon ref={iconRef} size={18} className="nav-anim-icon" />
          <span>{children}</span>
        </a>
      );
    }

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

  const effectiveDisplayName = useMemo(() => {
    return (
      profile?.profile?.effective_display_name ||
      profile?.profile?.preferred_display_name ||
      profile?.profile?.display_name_snapshot ||
      profile?.profile?.email_snapshot ||
      "Gebruiker"
    );
  }, [profile]);

  const effectiveEmail = profile?.profile?.email_snapshot || "";
  const avatarInitials = profile?.effective?.initials || buildInitials(effectiveDisplayName, effectiveEmail);

  useEffect(() => {
    setNavOpen(false);
    setAvatarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target)) return;
      setAvatarOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMeAndProfile() {
      try {
        const [meData, profileData] = await Promise.all([
          httpJson("/me"),
          httpJson("/me/profile"),
        ]);

        if (!cancelled) {
          setRoles(meData.roles ?? []);
          setProfile(profileData ?? null);

          const appearance = resolveAppearance(profileData?.profile?.appearance_preference);
          document.documentElement.setAttribute("data-appearance", appearance);
          document.documentElement.setAttribute(
            "data-appearance-preference",
            String(profileData?.profile?.appearance_preference || "system")
          );
        }
      } catch (err) {
        console.error("layout profile fetch failed", err);
        if (!cancelled) {
          setRoles([]);
          setProfile(null);
          document.documentElement.setAttribute("data-appearance", "dark");
          document.documentElement.setAttribute("data-appearance-preference", "system");
        }
      }
    }

    loadMeAndProfile();
    return () => {
      cancelled = true;
    };
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
            className="icon-btn icon-btn--avatar"
            aria-label="account"
            onClick={() => setAvatarOpen((v) => !v)}
          >
            <span className="avatar-badge">{avatarInitials}</span>
          </button>

          {avatarOpen && (
            <div className="avatar-menu" role="menu">
              <div className="avatar-menu-head">
                <div className="avatar-menu-head-badge">{avatarInitials}</div>

                <div className="avatar-menu-head-text">
                  <div className="avatar-menu-name">{effectiveDisplayName}</div>
                  <div className="avatar-menu-email">{effectiveEmail || "Geen e-mail beschikbaar"}</div>
                </div>
              </div>

              <div className="avatar-menu-divider" />

              <AnimatedMenuItem
                to="/profiel"
                className="menu-item"
                Icon={IdCardIcon}
              >
                Profiel
              </AnimatedMenuItem>

              <AnimatedMenuItem
                href="https://kennis.wardenburg.nl/Main/Werkwijze/Ember/"
                className="menu-item"
                Icon={CircleHelpIcon}
              >
                Help
              </AnimatedMenuItem>

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
          <AnimatedNavLink to="/" end Icon={HomeIcon}>
            Home
          </AnimatedNavLink>

          <AnimatedNavLink to="/installaties" Icon={SearchIcon}>
            Installatiegegevens
          </AnimatedNavLink>

          <AnimatedNavLink to="/monitor/formulieren" Icon={MonitorCheckIcon}>
            Monitor
          </AnimatedNavLink>

          {roles.includes("admin") && (
            <AnimatedNavLink to="/admin" Icon={BrainIcon}>
              Beheer
            </AnimatedNavLink>
          )}
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}