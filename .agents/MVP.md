# Ticket — Minimal Viable Product (MVP)

## Scope

The MVP is a **completely free** ticketing platform with **no payment processing, no financial transactions, and no liquidity features**. This enables rapid iteration, user acquisition, and validation of core event management workflows before introducing monetized features.

## MVP Features

### 1. Event Management

| Feature | Description |
|---|---|
| **Create Event** | Organizers can create an event with name, description, date/time, location, and maximum capacity |
| **Event Dashboard** | A central hub to view, edit, and manage all created events |
| **Event Cancellation** | Organizers can cancel an event with a single click, notifying all registered attendees |
| **Event Visibility** | Events can be published (public) or draft (private / hidden) |

### 2. Free Ticket Issuance & Registration

| Feature | Description |
|---|---|
| **Free Ticket Types** | Organizers can define multiple ticket types (e.g., General Admission, VIP) — all at $0 |
| **Registration Flow** | Attendees sign up with name and email to claim a free ticket |
| **Ticket Limit** | Each ticket type can have its own capacity limit |
| **Confirmation** | Attendees receive a confirmation (email or in-app) with a unique ticket/QR code |
| **Ticket QR Code** | Each ticket has a scannable QR code for check-in |

### 3. Attendee Management

| Feature | Description |
|---|---|
| **Attendee List** | Organizers can view all registered attendees for an event |
| **Check-In** | Scan QR codes at the door to mark attendees as checked in |
| **Capacity Tracking** | Real-time display of tickets claimed vs. total capacity |
| **Export** | Export attendee list as CSV |

### 4. User Accounts

| Feature | Description |
|---|---|
| **Registration & Login** | Email-based signup and login for both organizers and attendees |
| **Profile** | Basic user profile with name, email, and event history |
| **My Tickets** | Attendees can view all their claimed tickets in one place |
| **My Events** | Organizers can view all events they've created |

### 5. Basic Support

| Feature | Description |
|---|---|
| **Contact Form** | Users can submit support requests via a form |
| **FAQ Page** | Static FAQ covering common questions (registration, tickets, check-in) |
| **Ticket Cancellation** | Attendees can cancel/refund their free ticket (no money involved) |

## Out of Scope (Post-MVP)

- **Payment processing** — no Stripe, PayPal, or any financial integration
- **Payouts / liquidity** — no funds to disburse
- **Paid ticket tiers** — every ticket is free until monetization is introduced
- **Multi-currency or tax handling**
- **Complex discount / promo codes**
- **Mobile native apps** (responsive web is sufficient for MVP)
- **Waitlists**
- **Third-party integrations** (calendar, CRM, etc.)

## Tech Stack (Suggested)

| Layer | Choice |
|---|---|
| **Frontend** | React / Next.js (responsive web) |
| **Backend** | Node.js / Express or Next.js API routes |
| **Database** | PostgreSQL or SQLite for dev |
| **Auth** | JWT or session-based auth |
| **QR Generation** | `qrcode` library |
| **Email** | SendGrid / Resend for confirmation emails |
| **Deployment** | Vercel / Railway / Fly.io |

## Success Metrics (MVP Phase)

1. **Event creation rate** — number of events created per week
2. **Ticket claim rate** — tickets claimed per event
3. **Check-in completion** — % of claimed tickets that are scanned at entry
4. **Support ticket volume** — measure and triage common issues
5. **User retention** — organizers creating multiple events; attendees claiming tickets to multiple events

## Next Steps After MVP

Once the free MVP is validated with real users, the paid / liquidity features from the [MISSION.md](./MISSION.md) will be layered on:
- Paid ticket sales with payment processing
- Quick payout / liquidity for organizers
- Premium support SLAs