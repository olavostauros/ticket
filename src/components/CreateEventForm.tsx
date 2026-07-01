"use client";

import { useState } from "react";

export default function CreateEventForm() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title || !startAt || !endAt) { setError("Preencha todos os campos obrigatórios."); return; }
    setLoading(true);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slug || generateSlug(title),
          description,
          venue_name: venueName,
          venue_address: venueAddress,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          timezone: "America/Sao_Paulo",
        }),
      });

      if (res.ok) {
        const json = await res.json();
        window.location.href = `/dashboard/events/${json.data.slug || json.slug}`;
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Erro ao criar evento.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#991b1b", marginBottom: 16, fontSize: "0.9rem" }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="title" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Título *</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="slug" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Slug</label>
        <input id="slug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Gerado automaticamente"
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="description" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Descrição</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box", resize: "vertical" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label htmlFor="startAt" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>
            Data/Hora Início * {startAt && `(${new Date(startAt).toLocaleString("pt-BR")})`}
          </label>
          <input id="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <div>
          <label htmlFor="endAt" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>
            Data/Hora Fim *
          </label>
          <input id="endAt" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="venueName" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Local</label>
        <input id="venueName" type="text" value={venueName} onChange={(e) => setVenueName(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label htmlFor="venueAddress" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Endereço</label>
        <input id="venueAddress" type="text" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
      </div>

      <button type="submit" disabled={loading}
        style={{ width: "100%", padding: "14px 24px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: "1.1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "Criando..." : "Criar Evento"}
      </button>
    </form>
  );
}