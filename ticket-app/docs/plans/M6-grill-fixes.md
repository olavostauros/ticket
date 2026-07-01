# Grill Fixes — Code Review Action Items (M6)

Priority-ordered list of fixes from the M6 codebase grill session.

---

## P0 — Fix Now (incorrect behavior / broken UX)

### 1. Remove dead `formatBRL` in `lib/fees.ts`

**Problem:** `lib/fees.ts` exports a `formatBRL` function that duplicates `lib/format.ts`. The `fees.ts` version uses `toFixed(2)` + string concatenation instead of `toLocaleString`. It's never imported anywhere — dead code.

**Fix:** Remove the `formatBRL` function from `lib/fees.ts`. All callers should import from `lib/format.ts`.

**File:** `lib/fees.ts`

### 2. Throw on missing Resend API key instead of silent return

**Problem:** `lib/email.ts` silently returns when `RESEND_API_KEY` is missing:
```typescript
if (!apiKey) {
  console.error("Missing RESEND_API_KEY — cannot send email");
  return; // silent success — caller thinks email was sent
}
```
The job processor marks the job as "done" when it should retry.

**Fix:** Throw an error so the caller (job processor) retries:
```typescript
if (!apiKey) {
  throw new Error("Missing RESEND_API_KEY environment variable");
}
```

**File:** `lib/email.ts`

### 3. Fix nested `<main>` in profile page

**Problem:** `app/dashboard/profile/page.tsx` uses `<main>` as its wrapper, but the dashboard layout (`app/dashboard/layout.tsx`) already provides a `<main>` element. This creates nested `<main>` elements, which is invalid HTML.

**Fix:** Replace `<main>` with `<div>` in the profile page.

**File:** `app/dashboard/profile/page.tsx`

### 4. Draft events can't be edited (public API returns 404)

**Problem:** `app/dashboard/events/[slug]/page.tsx` fetches from `/api/events/${slug}` (the public GET endpoint), which only returns published events (`eq("status", "published")`). Draft events return 404, so the edit page shows "Evento não encontrado" instead of the edit form.

**Fix:** The edit page should use an authenticated endpoint that returns events regardless of status. Either:
- (A) Add a query param `?include_drafts=true` to the public endpoint
- (B) Create a separate authenticated endpoint `/api/events/[slug]/edit`
- (C) Pass the event data from a server component instead of fetching client-side

**File:** `app/dashboard/events/[slug]/page.tsx`, `app/api/events/[slug]/route.ts`

### 5. Add link from event edit page to sales dashboard

**Problem:** The sales dashboard exists at `/dashboard/events/${slug}/dashboard` but there's no navigation to it from the event edit page. Organizers can't find it.

**Fix:** Add a "Dashboard de Vendas" link/button next to the "Check-in" button on published events.

**File:** `app/dashboard/events/[slug]/page.tsx`

---

## P1 — Fix Soon (correctness / UX)

### 6. Add `force-dynamic` to sales dashboard page

**Problem:** `app/dashboard/events/[slug]/dashboard/page.tsx` doesn't export `dynamic = "force-dynamic"`. Since it reads cookies/auth via `getAuthUser()`, it should be explicitly dynamic to prevent accidental static generation.

**Fix:** Add `export const dynamic = "force-dynamic";` to the page.

**File:** `app/dashboard/events/[slug]/dashboard/page.tsx`

### 7. Add error handling for failed parallel queries in sales dashboard

**Problem:** The sales dashboard runs three parallel Supabase queries. If one fails (e.g., timeout), the page crashes with an unhelpful error. Each query result is accessed with `|| []` / `|| 0` fallbacks, but if the query itself throws (not just returns null), the page errors.

**Fix:** Wrap the `Promise.all` in a try/catch and show a meaningful error state instead of crashing.

**File:** `app/dashboard/events/[slug]/dashboard/page.tsx`

### 8. Make sidebar responsive

**Problem:** The dashboard sidebar is a fixed 240px with no mobile handling. On screens <768px, it takes up a third of the viewport. The CSS has a `@media (max-width: 768px)` breakpoint but the layout doesn't use it.

**Fix:** Add a collapsible sidebar for mobile. Use a hamburger menu or hide the sidebar and show a top nav bar on small screens.

**File:** `app/dashboard/layout.tsx`

### 9. Remove redundant "Meus Eventos" page or differentiate it

**Problem:** "Visão Geral" (`/dashboard`) shows the event list as cards. "Meus Eventos" (`/dashboard/events`) shows the same data as a table. Two pages with the same data in different layouts — confusing.

**Fix:** Either:
- (A) Remove `/dashboard/events` and redirect to `/dashboard`
- (B) Make `/dashboard/events` show additional info (sales stats, check-in counts per event)

**File:** `app/dashboard/events/page.tsx`, `app/dashboard/layout.tsx`

### 10. Use `getAuthUser()` in dashboard page

**Problem:** `app/dashboard/page.tsx` reads `cookies()` and calls `supabase.auth.getUser()` directly instead of using the shared `getAuthUser()` helper from `lib/auth-middleware.ts`.

**Fix:** Replace the manual auth check with `getAuthUser()`.

**File:** `app/dashboard/page.tsx`

### 11. Add link to sales dashboard from events list

**Problem:** `app/dashboard/events/page.tsx` shows "Editar" as the only action per event. For published events, there should be a "Dashboard" link to see sales data and a "Check-in" link.

**Fix:** Add action links based on event status: "Dashboard" and "Check-in" for published events, "Editar" for drafts.

**File:** `app/dashboard/events/page.tsx`

### 12. Add link to check-in from events list

**Problem:** Same as #11 — published events in the list have no link to the check-in page.

**Fix:** Add a "Check-in" action link for published events.

**File:** `app/dashboard/events/page.tsx`

### 13. Fix event edit page — redirect published events to dashboard

**Problem:** When an organizer clicks "Editar" on a published event in the events list, they land on the edit page but the edit form is hidden (only draft events can be edited). The page shows the event info with no actionable content.

**Fix:** Redirect published events to the sales dashboard or check-in page instead of showing a non-functional edit page.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 14. Fix event edit page — validate end_at > start_at

**Problem:** The create event page validates that `end_at > start_at`, but the edit page doesn't. An organizer could set `end_at` before `start_at`.

**Fix:** Add the same date validation to the edit form's submit handler.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 15. Fix event edit page — clear error on successful tier add

**Problem:** If a tier add fails (e.g., "Falha ao adicionar lote"), then the organizer fixes the issue and succeeds, the old error message persists until the next error overwrites it.

**Fix:** Call `setError("")` at the start of `handleAddTier`.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 16. Fix event edit page — handle slug conflict error message

**Problem:** If the organizer changes the slug to one that already exists, the PATCH returns 409 with code `slug_conflict`, but the client shows the generic "Falha ao salvar" message.

**Fix:** Check `data.code === "slug_conflict"` and show a specific error message.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 17. Fix event edit page — use `<Link>` instead of `<a>` for check-in

**Problem:** The check-in link uses `<a href="...">` which causes a full page navigation instead of a client-side transition.

**Fix:** Use Next.js `<Link>` component.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 18. Fix event edit page — show check-in link for all events (not just published)

**Problem:** The check-in link is only shown for published events, but the check-in page works for any event (it just checks ownership). Organizers can't test check-in during draft setup.

**Fix:** Show the check-in link for all events, or at least add a note that it's available after publishing.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 19. Fix event edit page — accept price in reais, not centavos

**Problem:** The tier form asks for price in "centavos" with placeholder "Ex: 5000 para R$ 50,00". Organizers think in reais, not centavos.

**Fix:** Accept reais (e.g., "50,00") and convert to centavos internally.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 20. Fix event edit page — use Button component

**Problem:** The save, add tier, publish, and cancel buttons use raw `<button>` with inline styles instead of the `Button` component from `components/ui/button.tsx`.

**Fix:** Replace raw buttons with the `Button` component.

**File:** `app/dashboard/events/[slug]/page.tsx`

### 21. Fix new event page — use Button component

**Problem:** Same as #20 — the create event button uses a raw `<button>`.

**Fix:** Use the `Button` component.

**File:** `app/dashboard/events/new/page.tsx`

### 22. Fix profile page — use Button component

**Problem:** Same as #20 — the save button uses a raw `<button>`.

**Fix:** Use the `Button` component.

**File:** `app/dashboard/profile/page.tsx`

### 23. Fix profile page — remove redundant back link

**Problem:** The profile page has "← Voltar ao Dashboard" at the top, but the sidebar already has "Visão Geral" which goes to `/dashboard`. Redundant.

**Fix:** Remove the back link.

**File:** `app/dashboard/profile/page.tsx`

### 24. Fix profile page — auto-dismiss success/error messages

**Problem:** Success and error messages on the profile page persist until the next action. Should auto-dismiss after a few seconds like the check-in feedback does.

**Fix:** Add a `useEffect` with `setTimeout` to clear messages after 4 seconds.

**File:** `app/dashboard/profile/page.tsx`

### 25. Fix new event page — handle Portuguese characters in slug derivation

**Problem:** The slug auto-derivation doesn't normalize Unicode:
```typescript
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
```
"João's Festa" becomes "jo-o-s-festa" instead of "joaos-festa".

**Fix:** Use `String.prototype.normalize("NFD")` to decompose accented characters before stripping diacritics.

**File:** `app/dashboard/events/new/page.tsx`

### 26. Fix new event page — upload image after event creation

**Problem:** The cover image upload happens before event creation. If the upload succeeds but event creation fails, the image is orphaned in Supabase Storage.

**Fix:** Create the event first, then upload with the event ID in the storage path. Or clean up orphaned uploads on failure.

**File:** `app/dashboard/events/new/page.tsx`

### 27. Fix new event page — don't overwrite manually-edited slug

**Problem:** If the organizer edits the slug manually, then changes the title, the auto-derivation overwrites the manual slug.

**Fix:** Only auto-derive the slug if the user hasn't manually edited it. Track a "slug manually edited" flag.

**File:** `app/dashboard/events/new/page.tsx`

---

## P2 — Nice to Have (scalability / robustness)

### 28. Add pagination to check-in client polling

**Problem:** The check-in client polls `/api/events/${eventSlug}/checkins` every 5s and fetches all tickets without pagination. For events with 10K+ tickets, this is a large payload every 5 seconds.

**Fix:** Add pagination to the client. Fetch in pages of 100, with a "Load more" button or infinite scroll.

**Files:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`, `app/api/events/[slug]/checkins/route.ts`

### 29. Add pagination to check-in SSR page

**Problem:** The SSR check-in page fetches all tickets upfront with no limit. For events with 50K tickets, this loads 50K rows into memory on every page load.

**Fix:** Limit the initial fetch to a reasonable number (e.g., 500) and load more on demand.

**File:** `app/dashboard/events/[slug]/checkin/page.tsx`

### 30. Add keyboard shortcut for check-in

**Problem:** For high-volume events, organizers need to check in attendees quickly. The search + click flow is slow.

**Fix:** Add keyboard shortcut (e.g., Enter to check in the first filtered attendee). Auto-focus the search input on page load.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 31. Add QR scanner for check-in

**Problem:** The manual entry form requires typing or pasting a UUID. For high-volume events, organizers use QR scanners.

**Fix:** Add camera-based QR scanning using the `qrcode` package (already in dependencies) or the browser's `navigator.mediaDevices.getUserMedia` API.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 32. Add exponential backoff to check-in polling

**Problem:** The polling interval is a constant 5s. If the endpoint returns errors, the client keeps hammering it every 5s.

**Fix:** Implement exponential backoff: start at 5s, double on error up to a max of 60s, reset on success.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 33. Add check-in count to check-in page header

**Problem:** The check-in page shows the attendee count but not the check-in count. The organizer has to scan the table to see how many people have checked in.

**Fix:** Show "X / Y check-ins realizados" at the top of the page.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 34. Add tier info to check-in table

**Problem:** The check-in table shows name, email, status, and action but not the ticket tier (VIP, Pista, etc.). For events with multiple tiers, the organizer needs to know which tier the attendee has.

**Fix:** Add a "Lote" column to the check-in table. Update the polling endpoint to include tier info.

**Files:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`, `app/api/events/[slug]/checkins/route.ts`

### 35. Add ticket code to check-in table

**Problem:** The check-in table doesn't show the ticket's unique code. If the organizer needs to verify a ticket manually against a printed list, they can't see the code.

**Fix:** Add a "Código" column to the check-in table (truncated or copyable).

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 36. Add search by ticket code in check-in

**Problem:** The search filters by name and email but not by ticket code. If an organizer has the ticket UUID, they can't search for it.

**Fix:** Add ticket code to the search filter.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 37. Add UUID validation to manual check-in form

**Problem:** The manual entry accepts any string. If the organizer types an invalid UUID, the API returns 404 with a generic error.

**Fix:** Validate UUID format client-side before sending. Show a helpful error if the format is wrong.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 38. Don't clear manual check-in input on error

**Problem:** If the manual check-in fails (e.g., already checked in), the input is cleared in the `finally` block. The organizer has to re-type the code.

**Fix:** Only clear the input on success. Keep it on error so the organizer can retry.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 39. Don't disable all check-in buttons during one check-in

**Problem:** When any check-in is in progress (`checkingIn !== null`), all check-in buttons are disabled. This serializes check-ins.

**Fix:** Only disable the button for the specific ticket being checked in.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 40. Pause polling when page is in background

**Problem:** The polling continues every 5s even when the organizer switches to another tab.

**Fix:** Use `document.visibilitychange` to pause polling when the page is hidden.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 41. Add timeout to check-in API call

**Problem:** If the check-in API is slow (e.g., database contention), the button stays disabled until the request completes.

**Fix:** Add an `AbortController` with a 10s timeout to the fetch call.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 42. Add auto-retry on network error for check-in

**Problem:** If the check-in network request fails (e.g., temporary glitch), the error is shown and the organizer has to retry manually.

**Fix:** Auto-retry once or twice for transient network errors before showing the error to the user.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 43. Add clear button to search input

**Problem:** Once the organizer types a search query, there's no way to clear it except by manually deleting the text.

**Fix:** Add an "X" button inside the search input to clear the query.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 44. Add sort controls to check-in table

**Problem:** The table is sorted by `holder_name` ascending. For check-in, the most useful sort is unchecked first.

**Fix:** Add sort controls: "Unchecked first", "Name A-Z", "Name Z-A".

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 45. Add delete option for draft events

**Problem:** The cancel button is shown for draft events too. For drafts, the organizer might want to delete the event entirely, not just cancel it.

**Fix:** Add a "Delete" option for draft events (with confirmation). Cancel remains for published events.

**File:** `app/dashboard/events/[slug]/page.tsx`, `app/api/events/[slug]/route.ts`

---

## P3 — Cleanup (code quality / consistency)

### 46. Fix inconsistent button colors across dashboard

**Problem:** Different pages use different colors for similar actions:
- Event edit: save = `#0070f3` (blue), add tier = `#28a745` (green)
- Check-in: register = `#28a745` (green), manual entry = `#0070f3` (blue)
- Design system primary = `#171717` (black)

**Fix:** Use the `Button` component with consistent `variant` props everywhere.

**Files:** Multiple dashboard pages

### 47. Fix inconsistent border radii

**Problem:** Feedback banner uses `borderRadius: 6`, manual entry form uses `borderRadius: 8`, cards use `borderRadius: 8`. Inconsistent.

**Fix:** Standardize on `borderRadius: 6` (matching the Button component) or `borderRadius: 8` (matching Card).

**Files:** Multiple components and pages

### 48. Fix inconsistent button text for check-in

**Problem:** Three different phrasings for the same action:
- Table button: "Registrar Entrada"
- Feedback: "Entrada registrada"
- Manual entry: "Registrar"

**Fix:** Standardize on "Registrar entrada" / "Entrada registrada".

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 49. Add `@todo` comments for documented limitations

**Problem:** Several scalability and security limitations are identified but not documented in the code.

**Fix:** Add `@todo` comments:
- Check-in polling lacks pagination (`app/dashboard/events/[slug]/checkin/checkin-client.tsx`)
- Check-in SSR fetches all tickets (`app/dashboard/events/[slug]/checkin/page.tsx`)
- Rate limiter is per-instance (`lib/rate-limit.ts` — already has one)
- No distributed rate limiting in middleware (`middleware.ts`)

### 50. Remove unused `avatar_url` from profile page

**Problem:** The profile page fetches `avatar_url` from the organizer record but never displays it. The edit form doesn't include an avatar upload option.

**Fix:** Either implement avatar upload+display, or remove `avatar_url` from the fetch query.

**File:** `app/dashboard/profile/page.tsx`