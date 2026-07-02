"use client";

import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(data.error || "Muitas tentativas. Tente novamente em alguns minutos.");
          return;
        }
        setError(data.error || "Erro ao solicitar redefinição.");
        return;
      }

      setSuccess("Se o email existir, você receberá um link para redefinir sua senha.");
      setEmail("");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "4rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Esqueceu sua senha?</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Digite seu email e enviaremos um link para redefinir sua senha.
      </p>

      {error && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: "0.75rem", borderRadius: 6, marginBottom: "1rem", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: "#f0fdf4", color: "#166534", padding: "0.75rem", borderRadius: 6, marginBottom: "1rem", fontSize: "0.875rem" }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: "100%", padding: "12px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: "1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Enviando..." : "Enviar link de redefinição"}
        </button>
      </form>

      <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "#666", textAlign: "center" }}>
        <a href="/login" style={{ color: "#171717", textDecoration: "underline" }}>Voltar para o login</a>
      </p>
    </main>
  );
}