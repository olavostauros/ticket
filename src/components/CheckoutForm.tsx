"use client";

import { useState, useEffect } from "react";

interface Props {
  eventSlug: string;
  tierId?: string;
}

export default function CheckoutForm({ eventSlug, tierId }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [tier, setTier] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    fetch(`/api/events/${eventSlug}?include_drafts=false`)
      .then((res) => res.json())
      .then((json) => {
        const eventData = json.data || json;
        setEvent(eventData);
        if (tierId) {
          const found = (eventData.tiers || []).find((t: any) => t.id === tierId);
          if (found) setTier(found);
          else setError("Ingresso não encontrado.");
        }
        setLoading(false);
      })
      .catch(() => setError("Evento não encontrado."));
  }, [eventSlug, tierId]);

  if (loading) return <p>Carregando...</p>;
  if (error && !tier) return <p style={{ color: "#d32f2f" }}>{error}</p>;

  const maxQty = tier ? tier.quantity_total - tier.quantity_sold : 1;
  const subtotalCents = tier ? tier.price_cents * quantity : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError(null);
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          items: [{ tier_id: tier.id, quantity }],
          attendee_email: email,
          attendee_name: name || undefined,
          idempotency_key: idempotencyKey,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const checkoutUrl = json.data?.checkout_url || json.checkout_url;
        if (checkoutUrl) window.location.href = checkoutUrl;
        else setError("Erro ao redirecionar para o pagamento.");
      } else if (res.status === 409) {
        setError("Ingressos esgotados. Tente novamente com outra opção.");
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Erro ao processar compra.");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {event && <p style={{ color: "#666", marginBottom: 16 }}>{event.title}</p>}
      {tier && (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>
              Email <span style={{ color: "#d32f2f" }}>*</span>
            </label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>
              Nome <span style={{ color: "#888" }}>(opcional)</span>
            </label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="quantity" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>
              Quantidade
            </label>
            <input id="quantity" type="number" min={1} max={maxQty} value={quantity}
              onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
              style={{ width: 80, padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem" }} />
            <span style={{ marginLeft: 8, fontSize: "0.85em", color: "#888" }}>{maxQty} disponível(is)</span>
          </div>
          {error && (
            <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#991b1b", marginBottom: 16, fontSize: "0.9rem" }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={submitting}
            style={{ width: "100%", padding: "14px 24px", background: submitting ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: "1.1rem", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Processando..." : "Comprar"}
          </button>
        </form>
      )}
    </div>
  );
}