import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { checkAdminAuth } from "../service/adminApi";

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      const result = await checkAdminAuth();


      if (result.success && result.data.authenticated) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600">Vérification de la connexion…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate to={`/jvaFHT7xvivJPJqc1QBRWhfayoj/login?next=${encodeURIComponent(location.pathname)}`} replace />
    );
  }

  return children;
}

export default ProtectedRoute;
