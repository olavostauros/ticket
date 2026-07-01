"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (UTC-3)" },
  { value: "America/Manaus", label: "America/Manaus (UTC-4)" },
  { value: "America/Belem", label: "America/Belem (UTC-3)" },
  { value: "America/Recife", label: "America/Recife (UTC-3)" },
  { value: "America/Cuiaba", label: "America/Cuiaba (UTC-4)" },
];

/**
 * /dashboard/events/new — Create event form (client component).
 * Creates the event first, then uploads the cover image with the event ID in the path.
 */
export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    venue_name: "",
    venue_address: "",
    start_at: "",
    end_at: "",
    timezone: "America/Sao_Paulo",
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const slugManuallyEdited = useRef(false);

  function deriveSlug(title: string): string {
    return title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleTitleChange(title: string) {
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugManuallyEdited.current ? prev.slug : deriveSlug(title),
    }));
  }

  function handleSlugChange(slug: string) {
    slugManuallyEdited.current = true;
    setForm((prev) => ({ ...prev, slug }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate dates
    const startDate = new Date(form.start_at);
    const endDate = new Date(form.end_at);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setError("Datas inválidas");
      setLoading(false);
      return;
    }
    if (endDate <= startDate) {
      setError("A data de fim deve ser posterior à data de início");
      setLoading(false);
      return;
    }

    // Create event first
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        cover_image_url: null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Falha ao criar evento");
      setLoading(false);
      return;
    }

    const event = data.data;
    let cover_image_url: string | null = null;

    // Upload cover image after event creation, using event ID in the path
    if (coverFile) {
      const uploadForm = new FormData();
      uploadForm.append("file", coverFile);
      uploadForm.append("event_id", event.id);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadForm });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok) {
        cover_image_url = uploadData.data.url;
        // Update event with cover image URL
        await fetch(`/api/events/${event.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cover_image_url }),
        });
      }
      // If upload fails, event still exists — non-fatal
    }

    router.push(`/dashboard/events/${event.slug}`);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <h1>Criar Evento</h1>

      {error && (
        <p style={{ color: "red", background: "#f8d7da", padding: 8, borderRadius: 4 }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Título</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            required
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Slug</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            required
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
          />
          <small style={{ color: "#888" }}>
            URL amigável: /events/{form.slug || "seu-evento"}
          </small>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Descrição</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={4}
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ddd",
              resize: "vertical",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Local</label>
          <input
            type="text"
            value={form.venue_name}
            onChange={(e) => setForm((prev) => ({ ...prev, venue_name: e.target.value }))}
            placeholder="Nome do local"
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Endereço</label>
          <input
            type="text"
            value={form.venue_address}
            onChange={(e) => setForm((prev) => ({ ...prev, venue_address: e.target.value }))}
            placeholder="Rua, número, bairro, cidade"
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
          />
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
              Data e hora de início
            </label>
            <input
              type="datetime-local"
              value={form.start_at}
              onChange={(e) => setForm((prev) => ({ ...prev, start_at: e.target.value }))}
              required
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
              Data e hora de fim
            </label>
            <input
              type="datetime-local"
              value={form.end_at}
              onChange={(e) => setForm((prev) => ({ ...prev, end_at: e.target.value }))}
              required
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Fuso horário</label>
          <select
            value={form.timezone}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
            Imagem de capa (opcional, max 5MB)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
          />
        </div>

        <Button type="submit" loading={loading} variant="primary">
          {loading ? "Criando..." : "Criar Evento"}
        </Button>
      </form>
    </div>
  );
}