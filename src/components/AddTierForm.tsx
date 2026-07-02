"use client";

import { useState } from "react";

interface AddTierFormProps {
  slug: string;
}

export default function AddTierForm({ slug }: AddTierFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [quantityTotal, setQuantityTotal] = useState("");
  const [saleStartAt, setSaleStartAt] = useState("");
  const [saleEndAt, setSaleEndAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function formatPriceInput(value: string) {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    const cents = parseInt(digits, 10);
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    return `R$ ${reais},${centavos.toString().padStart(2, "0")}`;
  }

  function parsePriceInput(value: string): number {
    const cleaned = value.replace(/[R$\s]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  }

  function handlePriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "");
    setPriceCents(digits);
  }

  function displayPrice() {
    return priceCents ? formatPriceInput(priceCents) : "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name) { setError("Nome do ingresso é obrigatório."); return; }
    const price = parsePriceInput(displayPrice());
    if (price <= 0) { setError("Preço deve ser maior que zero."); return; }
    const qty = parseInt(quantityTotal, 10);
    if (!qty || qty <= 0) { setError("Quantidade deve ser maior que zero."); return; }

    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        name,
        description,
        price_cents: price,
        quantity_total: qty,
      };

      if (saleStartAt) body.sale_start_at = new Date(saleStartAt).toISOString();
      if (saleEndAt) body.sale_end_at = new Date(saleEndAt).toISOString();

      const res = await fetch(`/api/events/${slug}/tiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        window.location.href = `/dashboard/events/${slug}`;
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Erro ao criar ingresso.");
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
        <label htmlFor="name" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Nome do Ingresso *</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required
          placeholder="Ex: Inteira, Meia, VIP"
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="description" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Descrição</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder="Descrição opcional do ingresso"
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box", resize: "vertical" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label htmlFor="price" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Preço *</label>
          <input id="price" type="text" inputMode="numeric" value={displayPrice()} onChange={handlePriceChange} required
            placeholder="R$ 0,00"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <div>
          <label htmlFor="quantityTotal" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Quantidade Total *</label>
          <input id="quantityTotal" type="number" min="1" value={quantityTotal} onChange={(e) => setQuantityTotal(e.target.value)} required
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <label htmlFor="saleStartAt" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Início das Vendas</label>
          <input id="saleStartAt" type="datetime-local" value={saleStartAt} onChange={(e) => setSaleStartAt(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
        <div>
          <label htmlFor="saleEndAt" style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}>Fim das Vendas</label>
          <input id="saleEndAt" type="datetime-local" value={saleEndAt} onChange={(e) => setSaleEndAt(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: "1rem", boxSizing: "border-box" }} />
        </div>
      </div>

      <button type="submit" disabled={loading}
        style={{ width: "100%", padding: "14px 24px", background: loading ? "#93c5fd" : "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: "1.1rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "Criando..." : "Adicionar Ingresso"}
      </button>
    </form>
  );
}