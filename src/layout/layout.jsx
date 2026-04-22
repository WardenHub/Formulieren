// src/layout/layout.jsx
import { httpJson, fetchProtectedObjectUrl } from "../api/http";
import { Outlet, NavLink, useLocation, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "../styles/layout.css";
import { logout } from "../auth/msal";
import { LogoutIcon } from "@/components/ui/logout";

import { HomeIcon } from "@/components/ui/home";
import { SearchIcon } from "@/components/ui/search";
import { BrainIcon } from "@/components/ui/brain";
import { MonitorCheckIcon } from "@/components/ui/monitor-check";
import { IdCardIcon } from "@/components/ui/id-card";

function initialsFromProfilePayload(profileData) {
  return profileData?.effective?.initials || profileData?.profile?.initials || "E";
}

function resolveLayoutAvatarPath(profileData) {
  return (
    profileData?.effective?.avatar_url ||
    profileData?.effective?.avatar_download_url ||
    profileData?.effective?.avatar_preview_url ||
    profileData?.avatar?.download_url ||
    profileData?.avatar?.preview_url ||
    profileData?.avatar?.url ||
    profileData?.profile?.avatar_url ||
    null
  );
}

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState(null);

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

    async function loadMe() {
      try {
        const data = await httpJson("/me");
        if (cancelled) return;
        setRoles(data.roles ?? []);
        setProfileData(data || null);
      } catch (err) {
        console.error("me fetch failed", err);
        if (!cancelled) {
          setRoles([]);
          setProfileData(null);
        }
      }
    }

    loadMe();

    function onProfileUpdated(e) {
      setProfileData((prev) => ({
        ...(prev || {}),
        ...(e?.detail || {}),
        user: prev?.user || null,
        roles: prev?.roles || roles,
      }));
    }

    window.addEventListener("ember:profile-updated", onProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("ember:profile-updated", onProfileUpdated);
    };
  }, [roles]);

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl = null;

    async function loadAvatarObjectUrl() {
      const mediaPath = resolveLayoutAvatarPath(profileData);

      if (!mediaPath) {
        setAvatarObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }

      try {
        nextObjectUrl = await fetchProtectedObjectUrl(mediaPath);
        if (cancelled) {
          if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
          return;
        }

        setAvatarObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextObjectUrl;
        });
      } catch (err) {
        console.error("avatar media fetch failed", err);
        if (!cancelled) {
          setAvatarObjectUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      }
    }

    loadAvatarObjectUrl();

    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [profileData]);

  const avatarInitials = initialsFromProfilePayload(profileData);
  const profileDisplayName =
    profileData?.profile?.effective_display_name ||
    profileData?.profile?.display_name ||
    profileData?.user?.name ||
    "Gebruiker";

  const profileNote =
    profileData?.profile?.profile_note ||
    profileData?.profile_note ||
    null;

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
            className="icon-btn topbar-avatar-btn"
            aria-label="account"
            onClick={() => setAvatarOpen((v) => !v)}
          >
            {avatarObjectUrl ? (
              <img
                src={avatarObjectUrl}
                alt="Profiel"
                className="topbar-avatar-image"
              />
            ) : (
              <span className="topbar-avatar-fallback">{avatarInitials}</span>
            )}
          </button>

          {avatarOpen && (
            <div className="avatar-menu" role="menu">
              <div className="avatar-menu-header">
                <div className="avatar-menu-header-main">
                  <div className="avatar-menu-header-avatar">
                    {avatarObjectUrl ? (
                      <img
                        src={avatarObjectUrl}
                        alt="Profiel"
                        className="topbar-avatar-image"
                      />
                    ) : (
                      <span className="topbar-avatar-fallback">{avatarInitials}</span>
                    )}
                  </div>

                  <div className="avatar-menu-header-text">
                    <div className="avatar-menu-name">{profileDisplayName}</div>
                    {profileNote ? (
                      <div className="avatar-menu-note">{profileNote}</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <Link className="menu-item" to="/profiel">
                Profiel
              </Link>

              <Link className="menu-item" to="/smoelenboek">
                Smoelenboek
              </Link>

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
          <AnimatedNavLink to="/" end Icon={HomeIcon}>
            Home
          </AnimatedNavLink>

          <AnimatedNavLink to="/installaties" Icon={SearchIcon}>
            Installatiegegevens
          </AnimatedNavLink>

          <AnimatedNavLink to="/monitor/formulieren" Icon={MonitorCheckIcon}>
            Monitor
          </AnimatedNavLink>

          <AnimatedNavLink to="/smoelenboek" Icon={IdCardIcon}>
            Smoelenboek
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