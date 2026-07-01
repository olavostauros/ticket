#!/bin/bash
# Apply all migrations in order using Supabase CLI
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"

echo "Applying migrations from $DIR..."
for f in "$DIR"/*.sql; do
  name=$(basename "$f")
  echo "  Applying $name..."
  supabase db execute --file "$f"
done
echo "Done."