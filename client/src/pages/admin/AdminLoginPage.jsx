
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Lock, LogIn } from "lucide-react";
import { adminLogin } from "../../service/adminApi";

function AdminLoginPage() {
  const navigate = useNavigate();
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Override global body styles
  useEffect(() => {
    document.body.style.background = "none";
    document.body.style.backgroundImage = "none";
    document.body.style.overflow = "auto";

    // Hide the ::before overlay
    const style = document.createElement("style");
    style.id = "admin-login-override";
    style.innerHTML = `
      body::before {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.body.style.background = "";
      document.body.style.backgroundImage = "";
      document.body.style.overflow = "";
      const styleEl = document.getElementById("admin-login-override");
      if (styleEl) styleEl.remove();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!secretKey.trim()) {
      setError("Secret key is required");
      return;
    }

    setLoading(true);

    const result = await adminLogin(secretKey);

    if (result.success) {
      navigate("/jvaFHT7xvivJPJqc1QBRWhfayoj/dashboard");
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative z-10">
      <div className="w-full max-w-md p-8 relative z-20">
        <div className="bg-white rounded-lg shadow-2xl p-8 relative z-30">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-slate-900 p-4 rounded-full mb-4">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Login</h1>
            <p className="text-gray-500 mt-2">
              Enter your secret key to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="relative z-40">
              <label
                htmlFor="secretKey"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Secret Key
              </label>
              <Input
                id="secretKey"
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Enter admin secret key"
                className="w-full relative z-50 pointer-events-auto"
                disabled={loading}

              />
            </div>

            {error && (

              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <Button
              type="submit"

              className="w-full bg-slate-900 hover:bg-slate-800 relative z-50 pointer-events-auto"
              disabled={loading}
            >
              {loading ? (
                "Logging in..."
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Login
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center relative z-50">
            <button
              onClick={() => navigate("/home")}
              className="text-sm text-slate-600 hover:text-slate-900 pointer-events-auto cursor-pointer"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLoginPage;
