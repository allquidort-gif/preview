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

      // Handle different response formats from Xano
      const token = result.authToken || result.token || result.auth_token;
      
      if (!token) {
        setError("No auth token received");
        return;
      }

      // Store auth token
      localStorage.setItem("auth_token", token);
      
      // For JWE tokens (5 parts) or JWT tokens (3 parts), we need to get user_id differently
      // The token header contains the algorithm info, but user_id is encrypted
      // We'll decode the first part to check, but for JWE we need to call an API or store user info separately
      
      const parts = token.split(".");
      
      if (parts.length === 3) {
        // Standard JWT - decode payload
        const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64Payload));
        localStorage.setItem("user_id", String(payload.id));
      } else if (parts.length === 5) {
        // JWE (encrypted) - decode the header to get the user id
        // Xano JWE header contains the id in the first part
        try {
          const base64Header = parts[0].replace(/-/g, '+').replace(/_/g, '/');
          const header = JSON.parse(atob(base64Header));
          
          // If header has id, use it. Otherwise we need to get it from /auth/me endpoint
          if (header.id) {
            localStorage.setItem("user_id", String(header.id));
          } else {
            // For Xano JWE, we need to call /auth/me to get user info
            // For now, let's store the email and fetch user on dashboard load
            // Or we can modify the Xano endpoint to also return user_id
            
            // Temporary: Store email to look up user later, or modify endpoint
            // Let's update the Xano endpoint to return user_id alongside token
            setError("JWE token - need to update Xano endpoint to return user_id");
            return;
          }
        } catch {
          setError("Could not decode token header");
          return;
        }
      } else {
        setError("Unexpected token format");
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
