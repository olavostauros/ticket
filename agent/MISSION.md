# Mission: Ticket — SaaS for Event Ticketing

## Why
Build a software-as-a-service platform that lets event organizers create, manage, and sell tickets to their events. The platform handles the entire lifecycle: event discovery, ticket purchasing, check-in, and post-event analytics. Ticket's mission is to make ticketing effortless for organizers and seamless for attendees.

## Success looks like
- **10+ organizers** actively creating events within 3 months of MVP launch
- **200+ tickets sold** across all events with no overselling incidents
- **Checkout-to-QR-email latency < 30 seconds** (webhook received → ticket generated → email sent)
- **Zero payment data leaks** — all payment processing delegated to AbacatePay, no card/PII stored
- **Mobile-web QR check-in works** on the latest 2 versions of Chrome and Safari on mobile
- **GDPR/LGPD compliance:** personal data (attendee email, name) deletable on request via a simple admin action

## MVP Gate (ship criteria)
The MVP is shippable when a brand-new organizer can sign up, create an event, publish it, and an attendee can buy a ticket and receive a scannable QR code in their email — all without manual intervention from the developer. One working end-to-end transaction is the definition of "shipped."

## Constraints
- Solo development by Ticket (the developer)
- Building iteratively — start with a minimal viable product, then add features
- Must be cost-effective to run (cloud hosting, but no extravagant infrastructure)
- Security and data privacy are non-negotiable (payment data, attendee PII)
- LGPD compliance is mandatory — attendee data must be deletable on request, and a privacy policy must be published before launch

## Out of scope
- QR scanner relies on mobile web camera APIs (`getUserMedia`). Devices without cameras or unsupported browsers fall back to manual name/email check-in.
- Multi-language support (MVP is Portuguese/BRL only)
- Physical hardware (POS terminals, scanners) — digital check-in only
- Event marketing or email campaign tools beyond basic confirmation emails
- Resale or secondary marketplace for tickets
- Native mobile apps — responsive web is sufficient for MVP
- Accessibility (WCAG) audits — aim for reasonable effort, not certification, in MVP