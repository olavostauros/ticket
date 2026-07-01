"use client";

import { useState } from "react";
import type { FormEvent } from "react";

interface Ticket {
  id: string;
  unique_code: string;
  holder_name: string;
  tier_name: string;
  checked_in_at: string | null;
}

interface LookupResult {
  order_reference: string;
  attendee_name: string | null;
  tickets: Ticket[];
}

/**
 * "My Tickets" page — attendee enters email + order reference to look up
 * their tickets after purchase.
 */
export default function MyTicketsPage() {
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/orders/lookup?email=${encodeURIComponent(email)}&reference=${encodeURIComponent(reference)}`
      );

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Order not found");
        return;
      }

      setResult(json.data as LookupResult);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 8 }}>🎟️ Meus Ingressos</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Digite seu email e o código do pedido recebido na confirmação para
        acessar seus ingressos.
      </p>

      <form
        onSubmit={handleSearch}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Seu email"
          required
          style={{
            padding: "10px 12px",
            border: "1px solid #d0d0d0",
            borderRadius: 8,
            fontSize: 16,
          }}
        />
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Código do pedido (ex: TCK-ABCD1234)"
          required
          style={{
            padding: "10px 12px",
            border: "1px solid #d0d0d0",
            borderRadius: 8,
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px",
            backgroundColor: loading ? "#999" : "#1a1a2e",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Buscando..." : "Buscar ingressos"}
        </button>
      </form>

      {error && (
        <p style={{ color: "#dc2626", marginTop: 16, textAlign: "center" }}>
          {error}
        </p>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <p style={{ marginBottom: 12, color: "#666" }}>
            Pedido: <strong>{result.order_reference}</strong>
          </p>
          {result.tickets.map((ticket) => {
            const ticketUrl = `/tickets/${ticket.unique_code}`;
            return (
              <div
                key={ticket.id}
                style={{
                  border: "1px solid #e0e0e0",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <p>
                  <strong>{ticket.tier_name}</strong>
                </p>
                <p style={{ color: "#666", fontSize: 14 }}>
                  Titular: {ticket.holder_name}
                </p>
                {ticket.checked_in_at && (
                  <p style={{ color: "#16a34a", fontSize: 14, marginTop: 4 }}>
                    ✅ Check-in realizado
                  </p>
                )}
                <a
                  href={ticketUrl}
                  style={{
                    display: "inline-block",
                    marginTop: 12,
                    padding: "8px 16px",
                    backgroundColor: "#1a1a2e",
                    color: "#fff",
                    textDecoration: "none",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  Ver ingresso
                </a>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}