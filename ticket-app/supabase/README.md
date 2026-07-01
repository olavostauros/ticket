# Database

The database schema and migrations live in the same monorepo under `ticket-database/`.

| Asset | Location |
|-------|----------|
| SQL migrations | [`ticket-database/supabase/migrations/`](../../ticket-database/supabase/migrations/) |
| Apply script | [`ticket-database/scripts/apply-migrations.sh`](../../ticket-database/scripts/apply-migrations.sh) |
| Supabase project | Dashboard → `southamerica-east1` (São Paulo) |
| Auth | Email/password enabled |
| Storage bucket | `event-covers` (public read) |