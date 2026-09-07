// src/layout/layout.jsx
import { httpJson, fetchProtectedObjectUrl } from "../api/http";
import {
  createApiWarmupRetry,
  describeApiFailure,
  describeApiFailureDetail,
  isSessionError,
} from "../api/apiWarmup.js";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/layout.css";
import { login, logout } from "../auth/msal";
import { LogoutIcon } from "@/components/ui/logout";
import { applyAppearancePreference } from "../theme/appearance.js";
import { HomeIcon } from "@/components/ui/home";
import { SearchIcon } from "@/components/ui/search";
import { BrainIcon } from "@/components/ui/brain";
import { MonitorCheckIcon } from "@/components/ui/monitor-check";
import { FileCheckIcon } from "@/components/ui/file-check";
import { IdCardIcon } from "@/components/ui/id-card";
import { MenuIcon } from "@/components/ui/menu";
import { BookTextIcon } from "@/components/ui/book-text";
import { LaughIcon } from "@/components/ui/laugh";
import { GavelIcon } from "@/components/ui/gavel";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { buildInitials, resolveProfileAvatarPath } from "../lib/avatar.js";
import { publishProfileAvatar } from "../lib/profileAvatarStore.js";
import NotificationCenter from "../components/NotificationCenter.jsx";
import BrandHomeButton from "./BrandHomeButton.jsx";
import { ClipboardCheck } from "lucide-react";

/* Waar een storingsmelding heen gaat. Eén plek, zodat dit een regel is en geen zoektocht;
   zet hier het IT-postbusadres als dat er is. */
const IT_MELDADRES = "jesse.veentjer@wardenburg.nl";

function buildItMailto(probleem, gebruiker) {
  const onderwerp = "Ember; rechten kunnen niet worden opgehaald";
  const regels = [
    "Ember kan mijn rechten niet ophalen.",
    "",
    `Melding: ${probleem?.message || "onbekend"}`,
    `Technisch: ${probleem?.detail || "onbekend"}`,
    `Pogingen: ${probleem?.attempts ?? 0} in ${Math.round((probleem?.elapsedMs || 0) / 1000)} seconden`,
    `Pagina: ${window.location.href}`,
    `Tijdstip: ${new Date().toLocaleString("nl-NL")}`,
    `Gebruiker: ${gebruiker || "onbekend"}`,
  ];

  const onderwerpDeel = encodeURIComponent(onderwerp);
  const berichtDeel = encodeURIComponent(regels.join("\n"));

  return `mailto:${IT_MELDADRES}?subject=${onderwerpDeel}&body=${berichtDeel}`;
}

/* De strook die zegt dat de rechten er nog niet zijn.

   Tijdens het opwarmen staat er geen knop. Er is niets te kiezen; het probeert zelf opnieuw
   en een knop suggereert dat de gebruiker iets moet doen. Pas als vijf minuten proberen
   niets heeft opgeleverd wordt het rood, komt de knop erbij en kan de melding naar IT. */
function WarmupStrip({ status, probleem, gebruiker, onRetry }) {
  if (status !== "warming" && status !== "failed" && status !== "session") return null;

  const opwarmen = status === "warming";
  const sessie = status === "session";

  return (
    <div
      className={`ember-warmup-strip${opwarmen ? "" : " ember-warmup-strip--failed"}`}
      role="status"
      aria-live="polite"
    >
      {opwarmen ? <span className="ember-warmup-strip__spinner" aria-hidden="true" /> : null}

      <span className="ember-warmup-strip__text">
        {opwarmen
          ? "Ember is aan het opstarten en je rechten zijn nog niet bekend. Wacht tot de gegevens zijn opgehaald."
          : sessie
            ? "Je sessie is verlopen, daarom zijn je rechten niet bekend. Log opnieuw in om verder te gaan."
            : "Je rechten konden niet worden opgehaald. Menu-items en gegevens ontbreken daardoor. Probeer het opnieuw, en laat IT weten dat er een probleem is als het blijft staan."}

        {!opwarmen && probleem?.detail ? (
          <span className="ember-warmup-strip__detail">{probleem.detail}</span>
        ) : null}
      </span>

      {sessie ? (
        <button type="button" className="ember-warmup-strip__button" onClick={() => login()}>
          Opnieuw inloggen
        </button>
      ) : null}

      {status === "failed" ? (
        <>
          <button type="button" className="ember-warmup-strip__button" onClick={onRetry}>
            Opnieuw proberen
          </button>

          <a
            className="ember-warmup-strip__button"
            href={buildItMailto(probleem, gebruiker)}
          >
            IT laten weten
          </a>
        </>
      ) : null}
    </div>
  );
}

function initialsFromProfilePayload(profileData, meData) {
  return buildInitials(
    profileData?.profile?.effective_display_name ||
      meData?.profile?.display_name,
    profileData?.profile?.email_snapshot || meData?.user?.email,
    profileData?.effective?.initials || profileData?.profile?.initials || meData?.profile?.initials || "E"
  );
}

function resolveProfileUpdatedKey(profileData, meData, profileRefreshToken) {
  return [
    profileData?.profile?.avatar_source_preference || "",
    profileData?.effective?.avatar_url || "",
    profileData?.effective?.avatar_mode || "",
    profileData?.avatar?.avatar_id || "",
    profileData?.avatar?.updated_at || "",
    profileData?.avatar?.uploaded_at || "",
    meData?.profile?.avatar_url || "",
    profileRefreshToken,
  ].join("|");
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  /* Vijf standen: "loading" bij het eerste ophalen, "ready" zodra de API antwoord gaf,
     "warming" zolang de rechten niet op te halen zijn en er nog een poging volgt, "failed"
     als er vijf minuten lang niets lukte, en "session" als de browser geen token had.
     Onbekende rechten zijn bewust een eigen stand; ze zien er in de app precies zo uit als
     lege rechten, en dan staat iemand 's ochtends in een compleet ogende Ember zonder
     beheermenu en zonder nieuws. */
  const [rolesStatus, setRolesStatus] = useState("loading");
  const [rolesProblem, setRolesProblem] = useState(null);
  const [meRetryToken, setMeRetryToken] = useState(0);
  const [meData, setMeData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState(null);
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);

  const menuRef = useRef(null);
  const topbarMenuIconRef = useRef(null);

  const avatarRefreshKey = useMemo(
    () => resolveProfileUpdatedKey(profileData, meData, profileRefreshToken),
    [profileData, meData, profileRefreshToken]
  );

  function go(to) {
    setNavOpen(false);
    setAvatarOpen(false);
    navigate(to);
  }

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

  function AnimatedMenuLink({ to, state, onClick, Icon, children, className = "menu-item" }) {
    const iconRef = useRef(null);

    return (
      <Link
        className={className}
        to={to}
        state={state}
        onClick={onClick}
        onMouseEnter={() => iconRef.current?.startAnimation?.()}
        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      >
        <Icon ref={iconRef} size={18} className="nav-anim-icon" />
        <span>{children}</span>
      </Link>
    );
  }

  function AnimatedMenuAnchor({ href, onClick, Icon, children, className = "menu-item" }) {
    const iconRef = useRef(null);

    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
        onMouseEnter={() => iconRef.current?.startAnimation?.()}
        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      >
        <Icon ref={iconRef} size={18} className="nav-anim-icon" />
        <span>{children}</span>
      </a>
    );
  }

  function AnimatedNavButton({ to, exact = false, Icon, children }) {
    const iconRef = useRef(null);
    const active = exact
      ? location.pathname === to
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

    return (
      <button
        type="button"
        className={`nav-link nav-link--icon${active ? " active" : ""}`}
        onClick={() => go(to)}
        onMouseEnter={() => iconRef.current?.startAnimation?.()}
        onMouseLeave={() => iconRef.current?.stopAnimation?.()}
      >
        <Icon ref={iconRef} size={18} className="nav-anim-icon" />
        <span>{children}</span>
      </button>
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
    let timer = null;
    const herkansing = createApiWarmupRetry();

    /* Plant de volgende poging. Levert false op als er geen poging meer volgt; dan is het
       venster van vijf minuten om of is dit geen fout die vanzelf overgaat. */
    function opnieuwProberen(oorzaak) {
      const pauze = herkansing.planNext(oorzaak);
      if (pauze === null) return false;

      timer = window.setTimeout(loadMe, pauze);
      return true;
    }

    function meldProbleem(stand, oorzaak) {
      setRolesStatus(stand);
      setRolesProblem({
        message: describeApiFailure(oorzaak),
        detail: describeApiFailureDetail(oorzaak, "/me"),
        elapsedMs: herkansing.elapsedMs(),
        attempts: herkansing.attempts(),
      });
    }

    async function loadMe() {
      try {
        const data = await httpJson("/me");
        if (cancelled) return;

        setMeData(data || null);
        setRoles(data?.roles ?? []);
        setPermissions(data?.permissions ?? []);

        // De API zegt zelf of de groepslookup gelukt is. Zo niet, dan is dit geen antwoord
        // om op te bouwen en blijft dit vragen tot het wel lukt.
        if (data?.roles_unavailable) {
          const oorzaak = { status: 503, message: "roles_unavailable" };
          if (opnieuwProberen(oorzaak)) {
            meldProbleem("warming", oorzaak);
          } else {
            meldProbleem("failed", oorzaak);
          }
          return;
        }

        herkansing.reset();
        setRolesProblem(null);
        setRolesStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("me fetch failed", err);

        /* Bewust niet de rollen wissen. Een warme sessie die één keer misgrijpt hoort niet
           halverwege zijn menu te verliezen; wat er stond blijft staan tot er een echt
           antwoord is. */
        if (isSessionError(err)) {
          meldProbleem("session", err);
          return;
        }

        if (opnieuwProberen(err)) {
          meldProbleem("warming", err);
          return;
        }

        meldProbleem("failed", err);
      }
    }

    /* Bewust geen tussenstand naar "loading" hier. Bij een herkansing zou de strook dan
       verdwijnen en meteen weer terugkomen, en dan lijkt het of er niets gebeurt. */
    loadMe();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [profileRefreshToken, meRetryToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const data = await httpJson("/me/profile");
        if (!cancelled) {
          setProfileData(data || null);
          applyAppearancePreference(data?.profile?.appearance_preference || "system");
        }
      } catch (err) {
        console.error("profile fetch failed", err);
        if (!cancelled) setProfileData(null);
      }
    }

    loadProfile();

    function onProfileUpdated(e) {
      const next = e?.detail || null;
      setProfileData(next);
      applyAppearancePreference(next?.profile?.appearance_preference || "system");
      setProfileRefreshToken((n) => n + 1);
    }

    window.addEventListener("ember:profile-updated", onProfileUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("ember:profile-updated", onProfileUpdated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    async function loadAvatarObjectUrl() {
      const mediaPath = resolveProfileAvatarPath(profileData, meData);

      if (!mediaPath) {
        setAvatarObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }

      try {
        createdUrl = await fetchProtectedObjectUrl(mediaPath);

        if (cancelled) {
          if (createdUrl) URL.revokeObjectURL(createdUrl);
          return;
        }

        setAvatarObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      } catch {
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
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [avatarRefreshKey]);

  // De topbar is de enige plek die de profielfoto ophaalt; andere schermen lezen mee via de
  // store. De initialen gaan mee zodat een scherm zonder foto iets herkenbaars kan tonen in
  // plaats van een anonieme stip.
  useEffect(() => {
    publishProfileAvatar({
      src: avatarObjectUrl || null,
      initials: initialsFromProfilePayload(profileData, meData) || null,
    });
  }, [avatarObjectUrl, profileData, meData]);

  useEffect(() => {
    return () => {
      setAvatarObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const avatarInitials = initialsFromProfilePayload(profileData, meData);

  const profileDisplayName =
    profileData?.profile?.effective_display_name ||
    meData?.profile?.display_name ||
    meData?.user?.name ||
    "Gebruiker";

  const profileNote =
    profileData?.profile?.profile_note ||
    meData?.profile?.profile_note ||
    null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn topbar-menu-btn"
          aria-label="menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
          onMouseEnter={() => topbarMenuIconRef.current?.startAnimation?.()}
          onMouseLeave={() => topbarMenuIconRef.current?.stopAnimation?.()}
        >
          <MenuIcon ref={topbarMenuIconRef} size={20} className="nav-anim-icon" />
        </button>

        {/* Was een div met role="button" en tabIndex, maar zonder toetsenbordhandler; met
            Enter gebeurde er niets. Als knop klopt het gedrag en de focus vanzelf. Zie
            BrandHomeButton.jsx voor de beweging. */}
        <BrandHomeButton onNavigate={() => go("/")} />

        <div className="topbar-spacer" />

        <NotificationCenter refreshToken={profileRefreshToken} />

        <div className="avatar-wrap" ref={menuRef}>
          <button
            type="button"
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

              <AnimatedMenuLink
                to="/profiel"
                Icon={IdCardIcon}
                onClick={() => setAvatarOpen(false)}
              >
                Profiel
              </AnimatedMenuLink>

              <AnimatedMenuLink
                to="/smoelenboek"
                Icon={LaughIcon}
                onClick={() => setAvatarOpen(false)}
              >
                Smoelenboek
              </AnimatedMenuLink>

              <AnimatedMenuLink
                to="/feedback"
                Icon={GavelIcon}
                state={{ sourcePath: `${location.pathname}${location.search}` }}
                onClick={() => setAvatarOpen(false)}
              >
                Feedback
              </AnimatedMenuLink>

              <AnimatedMenuAnchor
                href="https://kennis.wardenburg.nl/Main/Werkwijze/Ember/"
                Icon={CircleHelpIcon}
                onClick={() => setAvatarOpen(false)}
              >
                Help
              </AnimatedMenuAnchor>

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
          <AnimatedNavButton to="/" exact Icon={HomeIcon}>
            Home
          </AnimatedNavButton>

          <AnimatedNavButton to="/installaties" Icon={SearchIcon}>
            Installaties
          </AnimatedNavButton>

          <AnimatedNavButton to="/formulieren" Icon={FileCheckIcon}>
            Formulieren
          </AnimatedNavButton>

          {roles.some((role) => ["admin", "documentbeheerder", "gebruiker", "kam_coordinator", "certificering_coordinator"].includes(role)) && (
            <AnimatedNavButton to="/monitor/formulieren" Icon={MonitorCheckIcon}>
              Monitor
            </AnimatedNavButton>
          )}

          {/* Dit menu-item stond voor iedereen open, ook voor iemand zonder enige rol; die
              kwam dan op een pagina die alleen 403's oplevert. */}
          {roles.some((role) =>
            [
              "admin",
              "documentbeheerder",
              "gebruiker",
              "kam_coordinator",
              "certificering_coordinator",
            ].includes(role)
          ) && (
            <AnimatedNavButton to="/inspecties" Icon={ClipboardCheck}>
              Inspecties
            </AnimatedNavButton>
          )}

          {roles.length > 0 && (
            <AnimatedNavButton to="/smoelenboek" Icon={IdCardIcon}>
              Smoelenboek
            </AnimatedNavButton>
          )}

          {(roles.includes("admin") || roles.includes("uitlegbeheerder")) && (
            <AnimatedNavButton to="/uitlegbeheer" Icon={BookTextIcon}>
              Uitleg
            </AnimatedNavButton>
          )}

          {roles.includes("admin") && (
            <AnimatedNavButton to="/admin" Icon={BrainIcon}>
              Beheer
            </AnimatedNavButton>
          )}
        </nav>
      </aside>

      <main className="content">
        {/* De strook staat binnen de inhoud en niet als extra rij in .app-shell; die rij is
            1fr en zou hem over het halve scherm uitrekken. Sticky onder de topbar, zodat
            hij zichtbaar blijft terwijl je scrollt. */}
        <WarmupStrip
          status={rolesStatus}
          probleem={rolesProblem}
          gebruiker={meData?.user?.email || null}
          onRetry={() => setMeRetryToken((n) => n + 1)}
        />

        <Outlet context={{ roles, permissions, rolesStatus }} />
      </main>
    </div>
  );
}
