// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/xano/endpoints";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = isRegister
        ? await register(email, password)
        : await login(email, password);

      console.log("Auth response:", result);

      // Handle different response formats from Xano
      const token = result.authToken || result.token || result.auth_token || (typeof result === 'string' ? result : null);
      
      if (!token) {
        setError("No auth token received. Response: " + JSON.stringify(result));
        return;
      }

      // Store auth token
      localStorage.setItem("auth_token", token);
      
      // Decode JWT to get user_id (the 'id' claim)
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          console.log("JWT payload:", payload);
          localStorage.setItem("user_id", String(payload.id));
        } else {
          setError("Invalid token format");
          return;
        }
      } catch (decodeError) {
        console.error("Token decode error:", decodeError);
        setError("Failed to decode token: " + token.substring(0, 50) + "...");
        return;
      }

      router.push("/dashboard/bills");
    } catch (e: any) {
      setError(e?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center",
      padding: 24,
      background: "#f9fafb"
    }}>
      <div style={{ 
        width: "100%", 
        maxWidth: 400, 
        background: "white", 
        borderRadius: 16, 
        padding: 24,
        border: "1px solid #eee"
      }}>
        <h1 style={{ fontSize: 24, margin: 0, textAlign: "center" }}>
          {isRegister ? "Create Account" : "Sign In"}
        </h1>
        <p style={{ textAlign: "center", opacity: 0.7, marginTop: 8 }}>
          {isRegister ? "Create an account to track your bills" : "Sign in to your bills tracker"}
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 14, marginBottom: 6, opacity: 0.8 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                fontSize: 16,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 14, marginBottom: 6, opacity: 0.8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                fontSize: 16,
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{ 
              marginBottom: 16, 
              padding: 12, 
              background: "#fff7f7", 
              border: "1px solid #f1c0c0", 
              borderRadius: 10,
              color: "#c00",
              fontSize: 13,
              wordBreak: "break-all"
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              height: 44,
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#0066cc",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
