"use client";

import { useState } from "react";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("A senha deve ter pelo menos 8 caracteres."); return; }
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) { setError("Muitas tentativas. Tente novamente em alguns minutos."); return; }
        setError(data.error || "Erro ao criar conta.");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "4rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Criar conta</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>Crie sua conta de organizador.</p>

      {error && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: "0.75rem", borderRadius: 6, marginBottom: "1rem", fontSize: "0.875rem" }}>{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="name" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Nome</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Senha</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
          <p style={{ fontSize: "0.75rem", color: "#888", marginTop: 4 }}>Mínimo de 8 caracteres</p>
        </div>
        <button type="submit" disabled={loading}
          style={{ width: "100%", padding: "12px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: "1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Criando conta..." : "Criar conta"}
        </button>
      </form>

      <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "#666" }}>
        Já tem uma conta?{" "}
        <a href="/login" style={{ color: "#171717", textDecoration: "underline" }}>Entrar</a>
      </p>
    </main>
  );
}