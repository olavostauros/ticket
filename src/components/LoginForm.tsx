"use client";

import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Get redirect URL from query params (if any)
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const redirectTo = params.get("redirect") || "/dashboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(data.error || "Muitas tentativas. Tente novamente em alguns minutos.");
          return;
        }
        setError(data.error || "Email ou senha inválidos");
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "4rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Entrar</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Acesse sua conta de organizador.
      </p>

      {error && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: "0.75rem", borderRadius: 6, marginBottom: "1rem", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Senha</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: "100%", padding: "12px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: "1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#666", textAlign: "center" }}>
        <a href="/forgot-password" style={{ color: "#171717", textDecoration: "underline" }}>Esqueceu a senha?</a>
      </div>

      <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#666", textAlign: "center" }}>
        Não tem uma conta?{" "}
        <a href="/signup" style={{ color: "#171717", textDecoration: "underline" }}>Criar conta</a>
      </p>
    </main>
  );
}