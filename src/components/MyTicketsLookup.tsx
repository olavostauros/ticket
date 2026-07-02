"use client";

import { useState } from "react";

export default function MyTicketsLookup() {
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const [orders, setOrders] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setSearched(true);

    try {
      const body: Record<string, string> = {};
      if (email.trim()) body.email = email.trim().toLowerCase();
      if (reference.trim()) body.reference = reference.trim().toUpperCase();

      if (Object.keys(body).length === 0) {
        setError("Informe seu email ou o código do pedido.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (res.ok) {
        setOrders(json.data?.orders || json.orders || []);
      } else {
        setError(json.error || "Erro ao consultar pedidos.");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ margin: 0 }}>Meus Ingressos</h1>
      <p style={{ color: "#888", marginTop: 8 }}>Consulte seus ingressos informando seu email.</p>

      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#991b1b", marginBottom: 16, fontSize: "0.9rem" }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu email"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="reference" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Código do Pedido</label>
          <input id="reference" type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex: TCK-XXXXXXXX"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box", fontFamily: "monospace" }} />
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#888" }}>Opcional. Informe o email ou o código do pedido.</p>
        </div>

        <button type="submit" disabled={loading}
          style={{ width: "100%", padding: "12px 20px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: "1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Consultando..." : "Consultar"}
        </button>
      </form>

      {searched && !loading && orders && orders.length === 0 && (
        <div style={{ marginTop: 32, padding: 24, textAlign: "center", border: "1px solid #e5e7eb", borderRadius: 8, color: "#888" }}>
          <p style={{ fontSize: "1.1rem", margin: 0 }}>Nenhum pedido encontrado.</p>
          <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>Verifique o email ou o código informado.</p>
        </div>
      )}

      {searched && !loading && orders && orders.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Pedidos Encontrados ({orders.length})</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {orders.map((order: any) => (
              <div key={order.id} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {order.event_title || "Evento"}
                    </p>
                    <p style={{ margin: "4px 0 0", color: "#666", fontSize: "0.875rem" }}>
                      Pedido: <strong>{order.reference}</strong>
                    </p>
                  </div>
                  <span style={{
                    padding: "2px 10px", borderRadius: 999, fontSize: "0.8rem", fontWeight: 600,
                    background: order.status === "paid" ? "#dcfce7" : order.status === "pending" ? "#fefce8" : "#f3f4f6",
                    color: order.status === "paid" ? "#166534" : order.status === "pending" ? "#854d0e" : "#6b7280",
                  }}>
                    {order.status === "paid" ? "✅ Pago" : order.status === "pending" ? "⏳ Pendente" : "❌ " + order.status}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "#888" }}>
                  {new Date(order.created_at).toLocaleDateString("pt-BR")}
                </p>
                {order.status === "paid" && (
                  <a href={`/order/${order.reference}/success`} style={{ display: "inline-block", marginTop: 8, color: "#1a73e8", fontSize: "0.875rem" }}>
                    Ver ingressos →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}