-- ====================================================================
-- Migration 00004: Migrate tickets.unique_code from uuid to text
-- ====================================================================
-- The unique_code column was PostgreSQL uuid type. Any non-UUID input
-- (e.g. typing "ABC12345" in check-in) crashed with HTTP 500.
--
-- This migration:
--   1. Adds a new TEXT column unique_code_text
--   2. Generates short 8-char hex codes for existing tickets
--   3. Drops the uuid unique_code column (removes UNIQUE constraint + index)
--   4. Renames unique_code_text → unique_code
--   5. Sets NOT NULL and creates a new unique index
-- ====================================================================

-- Step 1: Add a TEXT column (nullable initially)
ALTER TABLE tickets ADD COLUMN unique_code_text TEXT;

-- Step 2: Generate short (8-char) hex codes for existing tickets
-- Uses a loop to handle collisions (extremely unlikely with 8 hex chars)
UPDATE tickets SET unique_code_text = upper(substr(gen_random_uuid()::text, 1, 8));

-- Handle any collisions by retrying until all rows have unique codes
DO $$
DECLARE
  dup_count INT;
BEGIN
  LOOP
    SELECT COUNT(*) INTO dup_count FROM (
      SELECT unique_code_text FROM tickets WHERE unique_code_text IS NOT NULL GROUP BY unique_code_text HAVING COUNT(*) > 1
    ) dups;
    EXIT WHEN dup_count = 0;

    UPDATE tickets t SET unique_code_text = upper(substr(gen_random_uuid()::text, 1, 8))
    WHERE t.id IN (
      SELECT t2.id FROM tickets t2
      WHERE t2.unique_code_text IN (
        SELECT unique_code_text FROM tickets WHERE unique_code_text IS NOT NULL GROUP BY unique_code_text HAVING COUNT(*) > 1
      )
    );
  END LOOP;
END $$;

-- Step 3: Drop the old uuid column (auto-drops its UNIQUE constraint and index)
ALTER TABLE tickets DROP COLUMN unique_code;

-- Step 4: Rename the text column
ALTER TABLE tickets RENAME COLUMN unique_code_text TO unique_code;

-- Step 5: Set NOT NULL and create a new unique index
ALTER TABLE tickets ALTER COLUMN unique_code SET NOT NULL;
CREATE UNIQUE INDEX idx_tickets_unique_code ON tickets(unique_code);

-- Step 6: Recreate the partial index for unchecked tickets (references unique_code)
DROP INDEX IF EXISTS idx_tickets_checked_in;
CREATE INDEX idx_tickets_checked_in ON tickets(checked_in_at) WHERE checked_in_at IS NULL;