
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Eye, EyeOff, Lock, LogIn } from "lucide-react";
import { adminLogin } from "../../service/adminApi";

function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [showSecretKey, setShowSecretKey] = useState(false);

  useEffect(() => {
    if (retryAfterSeconds <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

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

    if (retryAfterSeconds > 0) {
      return;
    }

    if (!secretKey.trim()) {
      setError("Secret key is required");
      return;
    }

    setLoading(true);

    const result = await adminLogin(secretKey, username);

    if (result.success) {
      navigate("/jvaFHT7xvivJPJqc1QBRWhfayoj/dashboard");
    } else {
      setError(result.error);
      setRetryAfterSeconds(result.retryAfterSeconds || 0);
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
              Enter your credentials to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="relative z-40">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Admin username"
                className="w-full relative z-50 pointer-events-auto"
                disabled={loading}
              />
            </div>

            <div className="relative z-40">
              <label
                htmlFor="secretKey"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecretKey ? "text" : "password"}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Enter admin secret key"
                  className="w-full pr-10 relative z-50 pointer-events-auto"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey((visible) => !visible)}
                  className="absolute right-2 top-1/2 z-[60] -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-900"
                  aria-label={showSecretKey ? "Hide password" : "Show password"}
                  disabled={loading}
                >
                  {showSecretKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (

              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
                {retryAfterSeconds > 0 && (
                  <div className="mt-1 font-medium">
                    Retry in {Math.floor(retryAfterSeconds / 60)}:
                    {String(retryAfterSeconds % 60).padStart(2, "0")}
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"

              className="w-full bg-slate-900 hover:bg-slate-800 relative z-50 pointer-events-auto"
              disabled={loading || retryAfterSeconds > 0}
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
