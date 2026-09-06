// src/routes/AppRoutes.jsx
import { Suspense, lazy, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "../layout/layout.jsx";
import Home from "../pages/Home.jsx";
import RequireRole from "./RequireRole.jsx";
import RouteFallback from "./RouteFallback.jsx";
import { prefetchLikelyRoutes } from "./prefetchRoutes.js";

// Alle pagina's zaten in één bundel. Wie de kaart opende haalde daarmee ook de
// formulierdesigner, de PDF-machinerie en het beheerscherm binnen; vier en een halve
// megabyte javascript downloaden en uitvoeren voordat er een pixel stond. Per route
// geladen komt alleen binnen wat je op dat moment gebruikt.
//
// De schil en de startpagina blijven bewust direct geladen; dat is waar je binnenkomt en
// daar hoort geen tussenscherm.
const InstallationsIndex = lazy(() => import("../pages/Installations/InstallationsIndex.jsx"));
const InstallationDetails = lazy(() => import("../pages/Installations/InstallationDetails.jsx"));
const FormRunner = lazy(() => import("../pages/Forms/FormRunner.jsx"));
const FormRunnerDebug = lazy(() => import("../pages/Forms/FormRunnerDebug.jsx"));
const FormsHubPage = lazy(() => import("../pages/Forms/FormsHubPage.jsx"));
const SurveyDesigner = lazy(() => import("../pages/dev/FormDesigner.jsx"));
const AdminPage = lazy(() => import("../pages/Admin/AdminPage.jsx"));
const GuidanceAdminPage = lazy(() => import("../pages/Guidance/GuidanceAdminPage.jsx"));
const FormsMonitorPage = lazy(() => import("../pages/Monitor/FormsMonitorPage.jsx"));
const FormsMonitorDetailPage = lazy(() => import("../pages/Monitor/FormsMonitorDetailPage.jsx"));
const NotFound = lazy(() => import("../pages/NotFound.jsx"));
const ProfilePage = lazy(() => import("../pages/Profile/ProfilePage.jsx"));
const DirectoryPage = lazy(() => import("../pages/Profile/DirectoryPage.jsx"));
const FeedbackPage = lazy(() => import("../pages/Feedback/FeedbackPage.jsx"));
const InspectionsPage = lazy(() => import("../pages/Inspections/InspectionsPage.jsx"));
const InspectionCasePage = lazy(() => import("../pages/Inspections/InspectionCasePage.jsx"));

const MONITOR_ROLES = [
  "admin",
  "documentbeheerder",
  "gebruiker",
  "kam_coordinator",
  "certificering_coordinator",
];

export default function AppRoutes() {
  // De kaart en de formulierenlijst worden in de stille tijd na het opstarten al opgehaald,
  // zodat de eerste klik erheen niet hapert.
  useEffect(() => prefetchLikelyRoutes(), []);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />

        <Route
          path="/installaties"
          element={
            <Suspense fallback={<RouteFallback label="Installaties worden geladen" />}>
              <InstallationsIndex />
            </Suspense>
          }
        />
        <Route
          path="/installaties/:code"
          element={
            <Suspense fallback={<RouteFallback label="Installatie wordt geladen" />}>
              <InstallationDetails />
            </Suspense>
          }
        />
        <Route
          path="/inspecties"
          element={
            <Suspense fallback={<RouteFallback label="Inspecties worden geladen" />}>
              <InspectionsPage />
            </Suspense>
          }
        />
        <Route
          path="/inspecties/:caseId"
          element={
            <Suspense fallback={<RouteFallback label="Inspectiedossier wordt geladen" />}>
              <InspectionCasePage />
            </Suspense>
          }
        />
        <Route
          path="/formulieren"
          element={
            <Suspense fallback={<RouteFallback label="Formulieren worden geladen" />}>
              <FormsHubPage />
            </Suspense>
          }
        />
        <Route
          path="/formulieren/:instanceId"
          element={
            <Suspense fallback={<RouteFallback label="Formulier wordt geladen" />}>
              <FormRunner />
            </Suspense>
          }
        />
        <Route
          path="/formulieren/:instanceId/debug"
          element={
            <Suspense fallback={<RouteFallback label="Formulier wordt geladen" />}>
              <FormRunnerDebug />
            </Suspense>
          }
        />

        <Route
          path="/installaties/:code/formulieren/:instanceId"
          element={
            <Suspense fallback={<RouteFallback label="Formulier wordt geladen" />}>
              <FormRunner />
            </Suspense>
          }
        />
        <Route
          path="/installaties/:code/formulieren/:instanceId/debug"
          element={
            <Suspense fallback={<RouteFallback label="Formulier wordt geladen" />}>
              <FormRunnerDebug />
            </Suspense>
          }
        />

        <Route
          path="/monitor/formulieren"
          element={
            <RequireRole anyOf={MONITOR_ROLES}>
              <Suspense fallback={<RouteFallback label="Monitor wordt geladen" />}>
                <FormsMonitorPage />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/monitor/formulieren/:instanceId"
          element={
            <RequireRole anyOf={MONITOR_ROLES}>
              <Suspense fallback={<RouteFallback label="Formulier wordt geladen" />}>
                <FormsMonitorDetailPage />
              </Suspense>
            </RequireRole>
          }
        />

        <Route
          path="/profiel"
          element={
            <Suspense fallback={<RouteFallback label="Profiel wordt geladen" />}>
              <ProfilePage />
            </Suspense>
          }
        />
        <Route
          path="/smoelenboek"
          element={
            <Suspense fallback={<RouteFallback label="Smoelenboek wordt geladen" />}>
              <DirectoryPage />
            </Suspense>
          }
        />
        <Route
          path="/feedback"
          element={
            <Suspense fallback={<RouteFallback label="Feedback wordt geladen" />}>
              <FeedbackPage />
            </Suspense>
          }
        />
        <Route
          path="/uitlegbeheer"
          element={
            <RequireRole anyOf={["admin", "uitlegbeheerder"]}>
              <Suspense fallback={<RouteFallback label="Uitlegbeheer wordt geladen" />}>
                <GuidanceAdminPage />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/dev/formdev"
          element={
            <Suspense fallback={<RouteFallback label="Formulierontwerper wordt geladen" />}>
              <SurveyDesigner />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole anyOf={["admin"]}>
              <Suspense fallback={<RouteFallback label="Beheer wordt geladen" />}>
                <AdminPage />
              </Suspense>
            </RequireRole>
          }
        />

        <Route
          path="*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <NotFound />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
