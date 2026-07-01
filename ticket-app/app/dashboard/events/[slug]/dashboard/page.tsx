import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { redirect, notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EventDashboardPage({ params }: Props) {
  const { slug } = await params;
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = createServerClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, status, organizer_id, start_at")
    .eq("slug", slug)
    .single();

  if (!event) notFound();
  if (event.organizer_id !== user.id) redirect("/dashboard");

  const statusLabel =
    event.status === "draft"
      ? "Rascunho"
      : event.status === "published"
        ? "Publicado"
        : "Cancelado";

  // Run independent queries in parallel
  let tiersResult, ordersResult, checkinResult;
  try {
    [tiersResult, ordersResult, checkinResult] = await Promise.all([
      supabase
        .from("tiers")
        .select("id, name, price_cents, quantity_total, quantity_sold")
        .eq("event_id", event.id),
      supabase
        .from("orders")
        .select("amount_cents, fee_cents")
        .eq("event_id", event.id)
        .eq("status", "paid"),
      supabase
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id),
    ]);
  } catch (queryErr) {
    console.error("Dashboard query failed:", queryErr);
    return (
      <div>
        <h1>{event.title}</h1>
        <p>Status: <strong>{statusLabel}</strong></p>
        <p style={{ color: "#991b1b", background: "#fef2f2", padding: 12, borderRadius: 6 }}>
          Erro ao carregar dados do dashboard. Tente novamente mais tarde.
        </p>
      </div>
    );
  }

  const tiers = tiersResult.data || [];
  const orders = ordersResult.data || [];
  const checkinCount = checkinResult.count || 0;

  const totalRevenue = orders.reduce((sum, o) => sum + o.amount_cents, 0);
  const totalFees = orders.reduce((sum, o) => sum + o.fee_cents, 0);
  const totalTicketsSold = tiers.reduce((sum, t) => sum + t.quantity_sold, 0);
  const totalCapacity = tiers.reduce((sum, t) => sum + t.quantity_total, 0);

  return (
    <div>
      <h1>{event.title}</h1>
      <p>Status: <strong>{statusLabel}</strong></p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginTop: 24,
        }}
      >
        <Card label="Vendidos" value={`${totalTicketsSold} / ${totalCapacity}`} />
        <Card label="Receita" value={formatBRL(totalRevenue)} />
        <Card label="Taxas" value={formatBRL(totalFees)} />
        <Card label="Check-ins" value={`${checkinCount} / ${totalTicketsSold}`} />
      </div>

      <h2 style={{ marginTop: 32 }}>Por Lote</h2>
      <Table
        headers={["Lote", "Preço", "Vendidos", "Disponíveis"]}
        rows={tiers.map((tier) => [
          tier.name,
          formatBRL(tier.price_cents),
          String(tier.quantity_sold),
          String(tier.quantity_total - tier.quantity_sold),
        ])}
      />
    </div>
  );
}