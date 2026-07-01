import { redirect } from "next/navigation";

/**
 * /dashboard/events — Redirected to /dashboard (Visão Geral).
 * The events list is shown on the dashboard page with action links.
 */
export default function MyEventsPage() {
  redirect("/dashboard");
}