"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Event, Tier } from "@/lib/types";

interface Props {
  params: Promise<{ slug: string }>;
}

const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (UTC-3)" },
  { value: "America/Manaus", label: "America/Manaus (UTC-4)" },
  { value: "America/Belem", label: "America/Belem (UTC-3)" },
  { value: "America/Recife", label: "America/Recife (UTC-3)" },
  { value: "America/Cuiaba", label: "America/Cuiaba (UTC-4)" },
];

/**
 * /dashboard/events/[slug] — Edit event details and manage ticket tiers.
 * Only draft events can be edited. Published events redirect to the sales dashboard.
 */
export default function EditEventPage({ params }: Props) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Event edit form
  const [form, setForm] = useState({
    title: "",
    description: "",
    venue_name: "",
    venue_address: "",
    start_at: "",
    end_at: "",
    timezone: "America/Sao_Paulo",
  });

  // New tier form
  const [tierForm, setTierForm] = useState({
    name: "",
    description: "",
    price_reais: "",
    quantity_total: "",
  });

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/events/${slug}?include_drafts=true`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }
        const ev = data.data as Event & { tiers?: Tier[] };
        setEvent(ev);

        // Redirect published events to the sales dashboard
        if (ev.status === "published") {
          router.replace(`/dashboard/events/${ev.slug}/dashboard`);
          return;
        }

        // Show a message for canceled events
        if (ev.status === "canceled") {
          setLoading(false);
          return;
        }

        setForm({
          title: ev.title,
          description: ev.description || "",
          venue_name: ev.venue_name || "",
          venue_address: ev.venue_address || "",
          start_at: ev.start_at?.slice(0, 16) || "",
          end_at: ev.end_at?.slice(0, 16) || "",
          timezone: ev.timezone,
        });
        setTiers(ev.tiers || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Falha ao carregar evento");
        setLoading(false);
      });
  }, [slug, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Validate end_at > start_at
    if (form.start_at && form.end_at) {
      const startDate = new Date(form.start_at);
      const endDate = new Date(form.end_at);
      if (endDate <= startDate) {
        setError("A data de fim deve ser posterior à data de início");
        setSaving(false);
        return;
      }
    }

    const res = await fetch(`/api/events/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : undefined,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (data.code === "slug_conflict") {
        setError("Este slug já está em uso. Escolha outro.");
      } else {
        setError(data.error || "Falha ao salvar");
      }
      setSaving(false);
      return;
    }
    setEvent(data.data);
    setSaving(false);
  }

  async function handlePublish() {
    if (!confirm("Publicar este evento? Ele ficará visível para o público.")) return;
    setSaving(true);
    setError("");

    const res = await fetch(`/api/events/${slug}/publish`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Falha ao publicar");
      setSaving(false);
      return;
    }
    setEvent(data.data);
    setSaving(false);
  }

  async function handleCancel() {
    if (!confirm("Tem certeza que deseja cancelar este evento? Esta ação não pode ser desfeita.")) return;
    setSaving(true);
    setError("");

    const res = await fetch(`/api/events/${slug}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Falha ao cancelar");
      setSaving(false);
      return;
    }
    setEvent(data.data);
    setSaving(false);
  }

  async function handleAddTier(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const price_reais = parseFloat(tierForm.price_reais.replace(",", "."));
    const quantity_total = parseInt(tierForm.quantity_total, 10);

    if (isNaN(price_reais) || price_reais <= 0) {
      setError("Preço deve ser um número positivo");
      setSaving(false);
      return;
    }
    if (isNaN(quantity_total) || quantity_total <= 0) {
      setError("Quantidade deve ser um número positivo");
      setSaving(false);
      return;
    }

    // Convert reais to centavos
    const price_cents = Math.round(price_reais * 100);

    const res = await fetch(`/api/events/${slug}/tiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tierForm.name,
        description: tierForm.description,
        price_cents,
        quantity_total,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Falha ao adicionar lote");
      setSaving(false);
      return;
    }

    setTiers((prev) => [...prev, data.data]);
    setTierForm({ name: "", description: "", price_reais: "", quantity_total: "" });
    setSaving(false);
  }

  const formatPrice = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  // Loading / Error states

  if (loading) return <p>Carregando...</p>;
  if (!event) return <p>{error || "Evento não encontrado"}</p>;

  // Canceled event — show info only
  if (event.status === "canceled") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <h1>{event.title}</h1>
        <p>
          Status:{" "}
          <strong style={{ color: "#721c24" }}>Cancelado</strong>
        </p>
        <p>Este evento foi cancelado e não pode ser editado.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <h1>{event.title}</h1>
      <p>
        Status:{" "}
        <strong
          style={{
            color:
              event.status === "published"
                ? "#155724"
                : event.status === ("canceled" as string)
                ? "#721c24"
                : "#856404",
          }}
        >
          {event.status === "draft"
            ? "Rascunho"
            : event.status === "published"
            ? "Publicado"
            : "Cancelado"}
        </strong>
      </p>

      {error && (
        <p
          style={{
            color: "red",
            background: "#f8d7da",
            padding: 8,
            borderRadius: 4,
          }}
        >
          {error}
        </p>
      )}

      {/* Edit Event Form (draft only) */}

      {event.status === "draft" && (
        <form
          onSubmit={handleSave}
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h2>Editar Evento</h2>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Título</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
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
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Endereço</label>
            <input
              type="text"
              value={form.venue_address}
              onChange={(e) => setForm((prev) => ({ ...prev, venue_address: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
            />
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Início</label>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm((prev) => ({ ...prev, start_at: e.target.value }))}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Fim</label>
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm((prev) => ({ ...prev, end_at: e.target.value }))}
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

          <Button type="submit" loading={saving} variant="primary">
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </form>
      )}

      {/* Add Tier Form (draft only) */}

      {event.status === "draft" && (
        <form
          onSubmit={handleAddTier}
          style={{
            marginTop: 32,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          <h2>Adicionar Lote de Ingressos</h2>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Nome do lote</label>
            <input
              type="text"
              value={tierForm.name}
              onChange={(e) => setTierForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Pista, VIP, Meia-entrada"
              required
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
              Descrição (opcional)
            </label>
            <input
              type="text"
              value={tierForm.description}
              onChange={(e) => setTierForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Ex: Acesso à pista, camarote open bar"
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
            />
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Preço (R$)
              </label>
              <input
                type="text"
                value={tierForm.price_reais}
                onChange={(e) => setTierForm((prev) => ({ ...prev, price_reais: e.target.value }))}
                placeholder="Ex: 50,00"
                required
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
              />
              <small style={{ color: "#888" }}>
                {tierForm.price_reais
                  ? formatPrice(Math.round(parseFloat(tierForm.price_reais.replace(",", ".")) * 100))
                  : "R$ 0,00"}
              </small>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Quantidade total
              </label>
              <input
                type="number"
                value={tierForm.quantity_total}
                onChange={(e) => setTierForm((prev) => ({ ...prev, quantity_total: e.target.value }))}
                placeholder="Ex: 500"
                min="1"
                required
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
              />
            </div>
          </div>

          <Button type="submit" loading={saving} variant="primary">
            {saving ? "Adicionando..." : "Adicionar Lote"}
          </Button>
        </form>
      )}

      {/* Existing Tiers Table */}

      <h2 style={{ marginTop: 32 }}>Lotes</h2>

      {tiers.length === 0 ? (
        <p>Nenhum lote cadastrado.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "2px solid #ddd" }}>
                Nome
              </th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "2px solid #ddd" }}>
                Preço
              </th>
              <th style={{ textAlign: "center", padding: 8, borderBottom: "2px solid #ddd" }}>
                Vendidos
              </th>
              <th style={{ textAlign: "center", padding: 8, borderBottom: "2px solid #ddd" }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{tier.name}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  {formatPrice(tier.price_cents)}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "center" }}>
                  {tier.quantity_sold}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "center" }}>
                  {tier.quantity_total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Action Buttons */}

      <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {event.status === "draft" && (
          <Button
            onClick={handlePublish}
            disabled={tiers.length === 0}
            loading={saving}
            variant="primary"
            title={tiers.length === 0 ? "Adicione pelo menos um lote antes de publicar" : undefined}
          >
            Publicar Evento
          </Button>
        )}

        {event.status === "published" && (
          <Link href={`/dashboard/events/${event.slug}/dashboard`}>
            <Button variant="primary">Dashboard de Vendas</Button>
          </Link>
        )}

        <Link href={`/dashboard/events/${event.slug}/checkin`}>
          <Button variant="primary">
            {event.status === "draft" ? "Check-in (teste)" : "Check-in"}
          </Button>
        </Link>

        {(event.status as string) !== "canceled" && (
          <Button onClick={handleCancel} loading={saving} variant="danger">
            Cancelar Evento
          </Button>
        )}

        {event.status === "draft" && (
          <Button
            onClick={async () => {
              if (!confirm("Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.")) return;
              setSaving(true);
              setError("");
              const res = await fetch(`/api/events/${slug}`, { method: "DELETE" });
              if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Falha ao excluir");
                setSaving(false);
                return;
              }
              router.push("/dashboard");
            }}
            loading={saving}
            variant="ghost"
            style={{ color: "#991b1b" }}
          >
            Excluir Evento
          </Button>
        )}
      </div>
    </div>
  );
}