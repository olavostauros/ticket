-- ====================================================================
-- Pending Jobs — Unique Active Job Per Reference
-- ====================================================================
-- Prevents duplicate pending jobs for the same order reference and job type.
-- Replaces the TOCTOU-prone application-level dedup with a database-level
-- partial unique index. Two concurrent webhooks for the same reference
-- will race on INSERT; only one wins, the other is silently ignored.
-- ====================================================================

-- Partial unique index: only pending (active) jobs are covered.
-- Once a job moves to done/failed, the index no longer protects that row,
-- allowing a fresh pending job (e.g., after a webhook re-delivery for a
-- previously failed job) — which is desirable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_jobs_unique_active
ON pending_jobs (job_type, (payload->>'reference'))
WHERE status = 'pending';