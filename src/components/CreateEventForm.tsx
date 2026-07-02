"use client";

import { useState, useRef } from "react";

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

  // Cover image state
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleCoverUpload(file: File) {
    setUploadStatus("Enviando...");
    setCoverPreview(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        const url = json.data?.url || json.url;
        setCoverUrl(url);
        setUploadStatus("Upload concluído");
      } else {
        const json = await res.json().catch(() => ({}));
        setUploadStatus(json.error || "Erro no upload");
        setCoverPreview(null);
      }
    } catch {
      setUploadStatus("Erro de conexão.");
      setCoverPreview(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    handleCoverUpload(file);
  }

  function handleRemoveCover() {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverUrl(null);
    setUploadStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title || !startAt || !endAt) { setError("Preencha todos os campos obrigatórios."); return; }
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        title,
        slug: slug || generateSlug(title),
        description,
        venue_name: venueName,
        venue_address: venueAddress,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        timezone: "America/Sao_Paulo",
      };

      if (coverUrl) {
        body.cover_image_url = coverUrl;
      }

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

      {/* Cover image upload */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Imagem de Capa</label>
        <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "#888" }}>Opcional. Formatos: JPEG, PNG, GIF, WebP. Máximo: 5MB.</p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          style={{ display: "block", marginBottom: 8 }}
        />

        {uploadStatus && !coverUrl && uploadStatus !== "Upload concluído" && (
          <p style={{ margin: "4px 0", fontSize: "0.85rem", color: "#666" }}>{uploadStatus}</p>
        )}

        {coverPreview && (
          <div style={{ position: "relative", display: "inline-block", marginTop: 8 }}>
            <img src={coverPreview} alt="Preview" style={{ maxWidth: 200, maxHeight: 120, borderRadius: 6, border: "1px solid #e5e7eb" }} />
            <button type="button" onClick={handleRemoveCover}
              style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: "50%", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", lineHeight: 1 }}>
              ✕
            </button>
            {coverUrl && (
              <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#166534" }}>Upload concluído</p>
            )}
          </div>
        )}
      </div>

      <button type="submit" disabled={loading}
        style={{ width: "100%", padding: "14px 24px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: "1.1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "Criando..." : "Criar Evento"}
      </button>
    </form>
  );
}