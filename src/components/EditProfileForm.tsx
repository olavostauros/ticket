"use client";

import { useState, useEffect } from "react";

export default function EditProfileForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json) => {
        const org = json.data?.organizer || json.organizer;
        if (org) {
          setName(org.name || "");
          setEmail(org.email || "");
        }
      })
      .catch(() => setError("Erro ao carregar perfil."))
      .finally(() => setLoadingData(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = { name };

      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSuccess("Perfil atualizado com sucesso!");
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Erro ao atualizar perfil.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingData) {
    return <div style={{ padding: "20px 0", color: "#666" }}>Carregando perfil...</div>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#991b1b", marginBottom: 16, fontSize: "0.9rem" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#166534", marginBottom: 16, fontSize: "0.9rem" }}>
          {success}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="email" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>E-mail</label>
        <input id="email" type="email" value={email} disabled
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box", background: "#f5f5f5", color: "#888" }} />
        <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#888" }}>O e-mail não pode ser alterado.</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="name" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Nome</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
      </div>

      <button type="submit" disabled={loading}
        style={{ width: "100%", padding: "14px 24px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: "1.1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "Salvando..." : "Salvar Perfil"}
      </button>
    </form>
  );
}