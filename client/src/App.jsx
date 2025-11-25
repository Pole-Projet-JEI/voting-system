import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import GlobalLayout from "./shared/components/app-layout/GlobalLayout";
import HomePage from "./pages/home/HomePage";
import "./app.css";
import RegisterPage from "./pages/register/RegisterPage";
import AdminPage from "./pages/admin/AdminPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";

import ProtectedRoute from "./components/ProtectedRoute";

import Error404Page from "./pages/error/Error404Page";
import { Navigate } from "react-router-dom";

function App() {
  return (
    <React.Fragment>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />

          <Route
            path="/jvaFHT7xvivJPJqc1QBRWhfayoj"
            element={<Navigate to="/jvaFHT7xvivJPJqc1QBRWhfayoj/login" replace />}
          />
          <Route path="/jvaFHT7xvivJPJqc1QBRWhfayoj/login" element={<AdminLoginPage />} />
          <Route
            path="/jvaFHT7xvivJPJqc1QBRWhfayoj/dashboard"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>

            }
          />
          <Route element={<GlobalLayout />}>
            <Route path="/test" />
            <Route path="/home" element={<HomePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/*" element={<Error404Page />} />
          </Route>
        </Routes>
      </Router>
    </React.Fragment>
  );
}

export default App;
