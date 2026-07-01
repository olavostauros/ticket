"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { formatBRL } from "@/lib/format";
import { calculateFees } from "@/lib/fees";

/**
 * Checkout page — Client Component.
 * Receives event (slug) and tier (id) via search params.
 * Fetches event/tier details, shows form, submits to POST /api/checkout.
 */
function CheckoutForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const eventSlug = searchParams.get("event");
  const tierId = searchParams.get("tier");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [tier, setTier] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);

  // Fetch event details on mount
  useEffect(() => {
    if (!eventSlug) {
      setError("Evento não encontrado.");
      setLoading(false);
      return;
    }

    fetch(`/api/events/${eventSlug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Evento não encontrado");
        return res.json();
      })
      .then((json) => {
        const eventData = json.data || json;
        setEvent(eventData);

        if (tierId) {
          const foundTier = (eventData.tiers || []).find((t: any) => t.id === tierId);
          if (foundTier) {
            setTier(foundTier);
          } else {
            setError("Ingresso não encontrado.");
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Evento não encontrado.");
        setLoading(false);
      });
  }, [eventSlug, tierId]);

  const maxQuantity = tier ? tier.quantity_total - tier.quantity_sold : 1;

  const subtotalCents = tier ? tier.price_cents * quantity : 0;
  const feeBreakdown = calculateFees(subtotalCents, "pix");

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
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
        } else {
          setError("Erro ao redirecionar para o pagamento.");
        }
      } else if (res.status === 409) {
        setError("Ingressos esgotados. Tente novamente com outra opção.");
      } else if (res.status === 502) {
        setError("Provedor de pagamento temporariamente indisponível. Tente novamente.");
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Erro ao processar compra. Tente novamente.");
      }
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
        <p>Carregando...</p>
      </main>
    );
  }

  if (error && !tier) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#d32f2f" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0 }}>Finalizar Compra</h1>
      {event && <p style={{ color: "#666", marginTop: 4 }}>{event.title}</p>}

      <hr style={{ margin: "24px 0" }} />

      {tier && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>{tier.name}</h3>
              {tier.description && (
                <p style={{ margin: "4px 0 0", color: "#666", fontSize: "0.9em" }}>
                  {tier.description}
                </p>
              )}
            </div>
            <p style={{ fontSize: "1.2em", fontWeight: "bold", margin: 0 }}>
              {formatBRL(tier.price_cents)}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="email"
                style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}
              >
                Email <span style={{ color: "#d32f2f" }}>*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="Seu email para receber o ingresso"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="name"
                style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}
              >
                Nome do titular <span style={{ color: "#888" }}>(opcional)</span>
              </label>
              <input
                id="name"
                type="text"
                placeholder="Nome do participante"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="quantity"
                style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}
              >
                Quantidade
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(maxQuantity, Math.max(1, parseInt(e.target.value) || 1)))}
                style={{
                  width: 80,
                  padding: "10px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  fontSize: "1rem",
                }}
              />
              <span style={{ marginLeft: 8, fontSize: "0.85em", color: "#888" }}>
                {maxQuantity} disponível(is)
              </span>
            </div>

            {/* Fee breakdown */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 16,
                marginBottom: 24,
                background: "#fafafa",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#666" }}>Preço do ingresso</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>{formatBRL(subtotalCents)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#666" }}>Taxa da plataforma</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>{formatBRL(feeBreakdown.platform_fee_cents)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#666" }}>Taxa AbacatePay</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>{formatBRL(feeBreakdown.abacatepay_fee_cents)}</td>
                  </tr>
                  <tr style={{ borderTop: "1px solid #ddd" }}>
                    <td style={{ padding: "8px 0", fontWeight: "bold" }}>Total</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontWeight: "bold", fontSize: "1.1em" }}>
                      {formatBRL(feeBreakdown.total_cents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Error message */}
            {error && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  color: "#991b1b",
                  marginBottom: 16,
                  fontSize: "0.9rem",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                padding: "14px 24px",
                background: submitting ? "#93c5fd" : "#1a73e8",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: "1.1rem",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Processando..." : "Comprar"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

/**
 * Wrapper with Suspense for useSearchParams.
 */
export default function CheckoutPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}><p>Carregando...</p></main>}>
      <CheckoutForm />
    </Suspense>
  );
}