import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";

// Dynamic — reads cookies and Supabase at request time, never prerender
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = createServerClient();

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, name, email, avatar_url")
    .eq("id", user.id)
    .single();

  // Fetch recent events
  const { data: events } = await supabase
    .from("events")
    .select("id, title, slug, status, start_at")
    .eq("organizer_id", user.id)
    .order("start_at", { ascending: false })
    .limit(10);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem" }}>Dashboard</h1>
        <p style={{ color: "#666" }}>
          Bem-vindo, {organizer?.name || "organizador"}!
        </p>
      </div>

      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "2rem",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", marginBottom: "1rem" }}>
          Seus Eventos
        </h2>

        {events && events.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {events.map(
              (event: {
                id: string;
                title: string;
                slug: string;
                status: string;
                start_at: string;
              }) => (
                <div
                  key={event.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <strong>{event.title}</strong>
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.75rem",
                        padding: "0.125rem 0.375rem",
                        borderRadius: 4,
                        background:
                          event.status === "published"
                            ? "#d1fae5"
                            : event.status === "canceled"
                            ? "#fce4ec"
                            : "#fef3c7",
                        color:
                          event.status === "published"
                            ? "#065f46"
                            : event.status === "canceled"
                            ? "#c62828"
                            : "#92400e",
                      }}
                    >
                      {event.status === "published"
                        ? "Publicado"
                        : event.status === "canceled"
                        ? "Cancelado"
                        : "Rascunho"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: "0.875rem", color: "#888" }}>
                      {new Date(event.start_at).toLocaleDateString("pt-BR")}
                    </span>
                    {event.status === "published" && (
                      <>
                        <Link
                          href={`/dashboard/events/${event.slug}/dashboard`}
                          style={{
                            padding: "4px 10px",
                            background: "#171717",
                            color: "#fff",
                            borderRadius: 4,
                            fontSize: "0.8rem",
                            textDecoration: "none",
                          }}
                        >
                          Dashboard
                        </Link>
                        <Link
                          href={`/dashboard/events/${event.slug}/checkin`}
                          style={{
                            padding: "4px 10px",
                            background: "#1a73e8",
                            color: "#fff",
                            borderRadius: 4,
                            fontSize: "0.8rem",
                            textDecoration: "none",
                          }}
                        >
                          Check-in
                        </Link>
                      </>
                    )}
                    {event.status === "draft" && (
                      <Link
                        href={`/dashboard/events/${event.slug}`}
                        style={{
                          padding: "4px 10px",
                          background: "#e5e7eb",
                          color: "#171717",
                          borderRadius: 4,
                          fontSize: "0.8rem",
                          textDecoration: "none",
                        }}
                      >
                        Editar
                      </Link>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <p style={{ color: "#888", marginBottom: "1rem" }}>
              Você ainda não tem nenhum evento.
            </p>
            <Link
              href="/dashboard/events/new"
              style={{
                display: "inline-block",
                padding: "0.625rem 1.25rem",
                background: "#171717",
                color: "#fff",
                borderRadius: 6,
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Criar Evento
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}