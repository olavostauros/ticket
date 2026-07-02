"use client";

import { useState } from "react";

interface ResetPasswordFormProps {
  token: string;
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(data.error || "Muitas tentativas. Tente novamente em alguns minutos.");
          return;
        }
        setError(data.error || "Erro ao redefinir senha.");
        return;
      }

      setSuccess("Senha redefinida com sucesso! Redirecionando para o login...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "4rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Redefinir senha</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Escolha uma nova senha para sua conta.
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

      {!success && (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Nova senha</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
            <p style={{ fontSize: "0.75rem", color: "#888", marginTop: 4 }}>Mínimo de 8 caracteres</p>
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="confirmPassword" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Confirmar senha</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "12px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: "1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Redefinindo..." : "Redefinir senha"}
          </button>
        </form>
      )}
    </main>
  );
}