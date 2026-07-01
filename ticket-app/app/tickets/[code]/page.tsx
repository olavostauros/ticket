import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { QRCodeDisplay } from "@/components/qr-code";
import type { Ticket, Event, Tier } from "@/lib/types";

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * Public ticket detail page — accessible via /tickets/:code.
 *
 * SSR page that shows ticket info and renders the QR code client-side.
 * The QR code encodes the same page URL, so scanning it opens this page.
 *
 * No auth required — the unique_code itself is the access token.
 */
export default async function TicketPage({ params }: Props) {
  const { code } = await params;
  const supabase = createServerClient();

  const { data: ticket, error } = await supabase
    .from("tickets")
    .select(`
      *,
      event:events(title, start_at, venue_name),
      tier:tiers(name)
    `)
    .eq("unique_code", code)
    .single();

  if (error || !ticket) {
    notFound();
  }

  // Cast joined records
  const eventData = (ticket as unknown as { event: Event }).event;
  const tierData = (ticket as unknown as { tier: Tier }).tier;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ticket.app";
  const ticketUrl = `${appUrl}/tickets/${code}`;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "long",
      timeStyle: "short",
    });

  const isCheckedIn = ticket.checked_in_at !== null;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 8 }}>🎟️ Ingresso</h1>

      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 12,
          padding: 24,
          marginTop: 16,
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: 4 }}>
          {eventData.title}
        </h2>
        <p style={{ color: "#666", marginBottom: 16 }}>
          {formatDate(eventData.start_at)}
        </p>

        <div style={{ marginBottom: 16 }}>
          <p><strong>Local:</strong> {eventData.venue_name || "—"}</p>
          <p><strong>Categoria:</strong> {tierData.name}</p>
          <p><strong>Titular:</strong> {ticket.holder_name}</p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "16px 0",
          }}
        >
          <QRCodeDisplay url={ticketUrl} size={256} />
        </div>

        <p style={{ fontSize: "0.8rem", color: "#999", textAlign: "center" }}>
            Apresente este QR code na entrada do evento.
        </p>

        {isCheckedIn && (
          <p
            style={{
              color: "#16a34a",
              textAlign: "center",
              fontWeight: 600,
              marginTop: 16,
            }}
          >
            ✅ Check-in realizado em {formatDate(ticket.checked_in_at!)}
          </p>
        )}
      </div>
    </main>
  );
}