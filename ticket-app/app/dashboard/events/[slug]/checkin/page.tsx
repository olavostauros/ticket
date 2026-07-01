import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { redirect, notFound } from "next/navigation";
import CheckInClient from "./checkin-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CheckInPage({ params }: Props) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const supabase = createServerClient();

  // Look up event and verify ownership
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, title, slug, status")
    .eq("slug", slug)
    .single();

  if (eventError || !event) notFound();

  if (event.organizer_id !== user.id) {
    redirect("/dashboard/events");
  }

  // Fetch initial ticket list (limited to 500 for performance)
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, unique_code, holder_name, holder_email, checked_in_at")
    .eq("event_id", event.id)
    .order("holder_name", { ascending: true })
    .limit(500);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1>Check-in: {event.title}</h1>
      <CheckInClient
        eventId={event.id}
        eventSlug={event.slug}
        initialTickets={tickets || []}
      />
    </div>
  );
}