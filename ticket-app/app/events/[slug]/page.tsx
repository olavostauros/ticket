import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAvailableTiers } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Public event page (SSR).
 * Shows event details and available ticket tiers.
 * Only published events are visible.
 */
export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createServerClient();

  const { data: event, error } = await supabase
    .from("events")
    .select(
      `
      *,
      tiers:tiers(*)
    `
    )
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !event) notFound();

  // Filter tiers to only available ones
  const availableTiers = getAvailableTiers(event.tiers || []);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("pt-BR", {
      timeZone: event.timezone,
      dateStyle: "long",
      timeStyle: "short",
    });

  const formatPrice = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      {event.cover_image_url && (
        <img
          src={event.cover_image_url}
          alt={event.title}
          style={{
            width: "100%",
            maxHeight: 400,
            objectFit: "cover",
            borderRadius: 8,
            marginBottom: 24,
          }}
        />
      )}

      <h1 style={{ margin: 0 }}>{event.title}</h1>

      {event.description && (
        <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{event.description}</p>
      )}

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        <p>
          <strong>Data:</strong> {formatDate(event.start_at)}
          {event.end_at && <> — {formatDate(event.end_at)}</>}
        </p>
        <p>
          <strong>Local:</strong> {event.venue_name}
          {event.venue_address && <> — {event.venue_address}</>}
        </p>
      </div>

      <hr style={{ margin: "24px 0" }} />

      <h2>Ingressos</h2>

      {availableTiers.length === 0 && (
        <p>Nenhum ingresso disponível no momento.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
        {availableTiers.map((tier: any) => (
          <div
            key={tier.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>{tier.name}</h3>
              {tier.description && (
                <p style={{ margin: "4px 0 0", color: "#666" }}>{tier.description}</p>
              )}
              <p style={{ margin: "4px 0 0", fontSize: "0.9em", color: "#888" }}>
                {tier.quantity_total - tier.quantity_sold} disponíveis
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "1.4em", fontWeight: "bold", margin: 0 }}>
                {formatPrice(tier.price_cents)}
              </p>
              <Link
                href={`/checkout?event=${event.slug}&tier=${tier.id}`}
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "8px 20px",
                  background: "#1a73e8",
                  color: "#fff",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                Comprar
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}