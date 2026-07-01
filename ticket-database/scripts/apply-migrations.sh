#!/bin/bash
# Apply all migrations in order using Supabase CLI
# Usage: ./scripts/apply-migrations.sh
#
# Prerequisites:
#   1. Run `supabase login` (one-time)
#   2. Run `supabase link --project-ref <ref>` (one-time per project)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"

echo "Applying migrations from $DIR..."
for f in "$DIR"/*.sql; do
  name=$(basename "$f")
  echo "  Applying $name..."
  supabase db query --linked --file "$f"
done
echo "Done."