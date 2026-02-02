// src/routes/AppRoutes.jsx
import { Routes, Route } from "react-router-dom";
import Layout from "../layout/layout.jsx";
import Home from "../pages/Home.jsx";
import InstallationsIndex from "../pages/Installations/InstallationsIndex.jsx";
import InstallationDetails from "../pages/Installations/InstallationDetails.jsx";
import NotFound from "../pages/NotFound.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/installaties" element={<InstallationsIndex />} />
        <Route path="/installaties/:code" element={<InstallationDetails />} />
        <Route
          path="/formulieren"
          element={
            <div>
              <h1>Formulier invullen</h1>
              <p>placeholder</p>
            </div>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
