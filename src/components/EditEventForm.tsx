"use client";

import { useState, useEffect } from "react";

interface EditEventFormProps {
  slug: string;
}

export default function EditEventForm({ slug }: EditEventFormProps) {
  const [title, setTitle] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [description, setDescription] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    fetch(`/api/events/${slug}?include_drafts=true`)
      .then((res) => res.json())
      .then((json) => {
        const ev = json.data || json;
        setTitle(ev.title || "");
        setEventSlug(ev.slug || "");
        setDescription(ev.description || "");
        setVenueName(ev.venue_name || "");
        setVenueAddress(ev.venue_address || "");
        if (ev.start_at) {
          setStartAt(new Date(ev.start_at).toISOString().slice(0, 16));
        }
        if (ev.end_at) {
          setEndAt(new Date(ev.end_at).toISOString().slice(0, 16));
        }
      })
      .catch(() => setError("Erro ao carregar dados do evento."))
      .finally(() => setLoadingData(false));
  }, [slug]);

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
      const body: Record<string, unknown> = {
        title,
        slug: eventSlug || generateSlug(title),
        description,
        venue_name: venueName,
        venue_address: venueAddress,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
      };

      const res = await fetch(`/api/events/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        window.location.href = `/dashboard/events/${eventSlug || generateSlug(title)}`;
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Erro ao atualizar evento.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingData) {
    return (
      <div style={{ padding: "20px 0", color: "#666" }}>Carregando dados do evento...</div>
    );
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
        <input id="slug" type="text" value={eventSlug} onChange={(e) => setEventSlug(e.target.value)} placeholder="Gerado automaticamente"
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
          <label htmlFor="endAt" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Data/Hora Fim *</label>
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
        {loading ? "Salvando..." : "Salvar Alterações"}
      </button>
    </form>
  );
}