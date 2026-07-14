// Core domain types for the Ticket platform.
// Matches the PostgreSQL schema from SPECIFICATIONS.md.

// Enums

export type EventStatus = "draft" | "published" | "canceled";
// Registration status (renamed from OrderStatus for free MVP)
export type OrderStatus = "confirmed" | "canceled";
export type CheckInType = "entry" | "reentry";
export type JobStatus = "pending" | "processing" | "done" | "failed";

// Organizer

export interface Organizer {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

// Event

export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  slug: string;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  cover_image_url: string | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

export interface EventWithTiers extends Event {
  tiers: Tier[];
}

// Tier

export interface Tier {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  quantity_total: number;
  quantity_sold: number;
  sale_start_at: string | null;
  sale_end_at: string | null;
  created_at: string;
  updated_at: string;
}

// Registration (replaces Order in free MVP)

export interface Registration {
  id: string;
  event_id: string;
  organizer_id: string;
  attendee_email: string;
  attendee_name: string | null;
  status: OrderStatus;
  reference: string;
  created_at: string;
  updated_at: string;
}

// Ticket

export interface Ticket {
  id: string;
  registration_id: string;
  event_id: string;
  tier_id: string;
  organizer_id: string;
  holder_name: string;
  holder_email: string;
  unique_code: string;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

// Check-in

export interface CheckIn {
  id: string;
  ticket_id: string;
  event_id: string;
  checked_in_by: string;
  timestamp: string;
  type: CheckInType;
}

// Job Queue

export interface PendingJob {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  retries: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

// API Responses

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}

