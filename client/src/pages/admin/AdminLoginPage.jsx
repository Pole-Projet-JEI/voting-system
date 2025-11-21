import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "../../service/adminApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { KeyRound, LogIn } from "lucide-react";

const AdminLoginPage = () => {
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await adminLogin(secretKey);
      navigate("/admin");
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Invalid admin key. Please try again.");
      } else {
        setError("An error occurred. Please try again later.");
      }
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(to bottom right, #f9fafb, #f3f4f6)",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
    >
      <Card
        className="w-full max-w-md"
        style={{ background: "white", color: "#1f2937" }}
      >
        <CardHeader className="space-y-1" style={{ background: "white" }}>
          <div className="flex items-center justify-center mb-4">
            <div
              style={{
                background: "#2563eb",
                padding: "12px",
                borderRadius: "9999px",
              }}
            >
              <KeyRound className="w-8 h-8" style={{ color: "white" }} />
            </div>
          </div>
          <CardTitle
            className="text-2xl font-bold text-center"
            style={{ color: "#1f2937" }}
          >
            Admin Login
          </CardTitle>
          <CardDescription className="text-center" style={{ color: "#6b7280" }}>
            Enter your secret key to access the admin panel
          </CardDescription>
        </CardHeader>
        <CardContent style={{ background: "white" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="secretKey"
                className="text-sm font-medium"
                style={{ color: "#374151" }}
              >
                Secret Key
              </label>
              <Input
                id="secretKey"
                type="password"
                placeholder="Enter your admin secret key"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                required
                className="w-full"
                disabled={loading}
                style={{
                  background: "white",
                  color: "#1f2937",
                  borderColor: "#d1d5db",
                }}
              />
            </div>

            {error && (
              <div
                className="border px-4 py-3 rounded-md text-sm"
                style={{
                  background: "#fef2f2",
                  borderColor: "#fecaca",
                  color: "#b91c1c",
                }}
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              style={{
                background: loading ? "#93c5fd" : "#2563eb",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin mr-2"
                    style={{
                      borderColor: "white",
                      borderTopColor: "transparent",
                    }}
                  />
                  Logging in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Login
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLoginPage;
