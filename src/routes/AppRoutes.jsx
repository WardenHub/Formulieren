// src/routes/AppRoutes.jsx
import { Routes, Route } from "react-router-dom";
import Layout from "../layout/layout.jsx";
import Home from "../pages/Home.jsx";
import InstallationsIndex from "../pages/Installations/InstallationsIndex.jsx";
import InstallationDetails from "../pages/Installations/InstallationDetails.jsx";
import FormRunner from "../pages/Forms/FormRunner.jsx";
import FormRunnerDebug from "../pages/Forms/FormRunnerDebug.jsx";
import SurveyDesigner from "../pages/Dev/FormDesigner.jsx";
import NotFound from "../pages/NotFound.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/installaties" element={<InstallationsIndex />} />
        <Route path="/installaties/:code" element={<InstallationDetails />} />

        {/* Form runner (echte runner) */}
        <Route path="/installaties/:code/formulieren/:instanceId" element={<FormRunner />} />

        {/* Debug JSON runner (ruwe editor) */}
        <Route
          path="/installaties/:code/formulieren/:instanceId/debug"
          element={<FormRunnerDebug />}
        />
        <Route path="/dev/formdev" element={<SurveyDesigner />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
