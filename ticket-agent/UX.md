# UX.md — UX/UI Conventions for Ticket

This file defines user-facing conventions for the Ticket platform. The target market is Brazil.

## Language Policy

- **Portuguese** for all user-facing content: UI labels, button text, error messages shown to attendees/organizers, email templates, date/time formatting (dd/mm/aaaa, R$ currency).
- **English** for code, comments, commit messages, docs, and any internal/agent-facing content.
- Exception: technical terms like "PIX", "Boleto", "QR Code", "Check-in" are used as-is (no translation).

## UI Components

A minimal component library lives in `components/ui/`. Available components:

| Component | Purpose |
|-----------|---------|
| `Button` | Primary, secondary, ghost variants. Loading state with spinner. |
| `Input` | Text inputs with label, error, and helper text. |
| `Card` | Bordered container with optional header/footer. |
| `Table` | Sortable data table with sticky header. |
| `Spinner` | Loading indicator, size variants. |
| `QRCodeDisplay` | Renders QR code client-side from a URL string. |

Use these components for all new UI work. Do not add a new UI library (MUI, Chakra, etc.) without discussion.

## Responsive Design

- **Breakpoint:** 768px (mobile/tablet switch)
- **Mobile-first.** Write base styles for <768px, add media queries for >=768px.
- Keep layouts simple — stack vertically on mobile, use sidebars and multi-column on desktop.
- Touch targets should be at least 44x44px on mobile.

## Mobile Web

The MVP targets mobile browsers (Chrome, Safari). Key considerations:

- QR scanning uses `getUserMedia` API (camera access). Devices without cameras fall back to manual name/email check-in.
- Check-in polling endpoint runs every 5s — no WebSockets in MVP.
- All public pages (event page, ticket page, my-tickets) must render correctly on mobile viewport.

## Accessibility

Aim for reasonable effort, not WCAG certification in MVP:
- All form inputs have associated labels.
- Interactive elements are keyboard-accessible.
- Color contrast should be readable (no light-gray-on-white text).
- Error states are communicated visually and (where practical) via text.

## Error & Loading States

- **Loading:** Show `Spinner` component during loading. Avoid layout shift — reserve space.
- **Empty state:** Show a clear message ("No tickets yet.") — never an empty table.
- **Error:** Show inline error messages near the relevant input or as a toast/banner. Use Portuguese.
- **404:** Custom not-found page (exists at `app/not-found.tsx`).
- **500:** Custom error boundary (exists at `app/error.tsx`).

## Email Templates

Email templates are in Portuguese. Key templates:
- **Order confirmation** with ticket QR code links and event details.
- Emails are sent via Resend using plain HTML templates (no MJML or heavy templating — keep it simple).