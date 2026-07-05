# Supabase Workflow

## Current Setup

- Supabase CLI runs through `npx supabase`.
- Local Supabase config exists in `supabase/config.toml`.
- Local Docker-based Supabase is optional and not required for the MVP connection.
- Remote project is linked.
- Project name: `today-one-page`
- Project ref: `ggezuvdhuaizerfmkevl`
- Project URL: `https://ggezuvdhuaizerfmkevl.supabase.co`

## What Supabase Handles

- Groups (`groups`) and per-group profiles (`profiles.group_id`, `profiles.pin_hash`)
- Per-person PIN auth (scrypt-hashed, no shared PIN at runtime anymore)
- Postgres database
- Reading progress per group (`reading_progress.group_id`), including reading-plan mode (`plan_day_index`, `plan_days`)
- Book-session `session_id`
- Missed-reading counts per book/plan session
- Gift promises per session (only the most recently revealed session is shown to the app)
- Segment comments and replies
- Highlights, with verse-count data (`verse_counts`) now seeded for all 1,189 chapters, not just Ecclesiastes
- Reactions

Chat (`messages`, `message_reads`) is no longer used by the app — the feature was removed. The tables still exist (not dropped) but nothing reads/writes them anymore. Existing chat history was exported to `docs/chat-archive.md` before removal.

## Required Values

To link or re-link this repository to Supabase, prepare these values:

- Supabase access token (personal access token, `sbp_...` — used for both CLI and the Management API fallback below)
- Supabase project ref
- Database password for the Supabase project (only needed for `supabase db push`; not stored anywhere in this repo)
- Project API URL
- Project anon public key

## How To Create An Access Token

1. Open Supabase Dashboard.
2. Go to Account Settings.
3. Open Access Tokens.
4. Create a new token.
5. Use it only for CLI setup.

The token must not be committed to GitHub. It can be provided through the terminal environment or pasted when running CLI commands locally.

## Link Command

The repository is already linked. To re-link:

```bash
$env:SUPABASE_ACCESS_TOKEN="<token>"
npx supabase link --project-ref ggezuvdhuaizerfmkevl
```

The CLI will ask for the database password. Do not commit the password or access token.

There is also a helper script:

```powershell
.\scripts\link-supabase.ps1
```

## Environment Variables

The app will need these values in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Only `NEXT_PUBLIC_*` variables are safe for browser code. `SUPABASE_SECRET_KEY` is server-only.

`APP_SHARED_PIN` is **no longer read at runtime** — it was the old shared-login secret and is now only relevant to the one-off `scripts/migrate-pins.ts` script (already run once during the multi-group migration). It can stay in Vercel env harmlessly or be removed.

## Current Schema (post multi-group)

- `groups`: invite code, owner, `max_members`, `reading_mode`
- `profiles`: per-group members, `pin_hash`, `unique(group_id, slug)`
- `sections`, `books`, `segments`: global Bible content, 1,189 chapter records from `seed_data.json`
- `plan_days`: the JW 1-year reading plan, 363 rows, global (from `scripts/seed-reading-plan.ts`)
- `reading_progress`: one row per group, `plan_day_index` for plan mode
- `reading_states`: per-user read check state
- `reading_misses`: per-user missed-reading records at the KST 2am boundary
- `book_gifts`: gift promises tied to the current session; the app only ever displays the most recently revealed session's gifts
- `book_proposals`: now just "owner-set next book" (`accepted`/`started`/`cancelled`), no more `pending` negotiation
- `comments`: segment comments
- `replies`: replies to comments/highlights
- `highlights`: verse references and notes
- `verse_counts`: full 1,189-chapter verse-count table (from `scripts/seed-verse-counts.ts`), used to render the verse-picker button grid for every book
- `notifications`: app-internal unread notifications (no more `message` type)
- `messages`, `message_reads`: unused leftovers from the removed chat feature, not dropped

## Applied Remote Migrations

Remote project `ggezuvdhuaizerfmkevl` has been updated with these app migrations:

- `202605020001_initial_mvp.sql`
- `202605100001_misses_and_gifts.sql`
- `202605140001_session_misses_and_deferred_books.sql`
- `202607040001_multi_group_schema.sql` (groups/plan_days tables, group_id/pin_hash/plan_day_index columns)
- `202607040002_multi_group_backfill.sql` (existing 주환/희진 data moved into the first group, invite code `TGBHER`)
- `202607040003_profiles_pin_hash_notnull.sql` (applied after `scripts/migrate-pins.ts` backfilled every profile's `pin_hash`)

Applied via the Supabase Management API (`POST /v1/projects/{ref}/database/query`) with a personal access token, since `supabase db push` needs the DB password which isn't stored anywhere in this repo. If a fresh migration needs applying again and the CLI path isn't available, that endpoint works as a fallback.

### Known gotcha: 1000-row response cap

The hosted project's PostgREST caps every response at 1000 rows regardless of the `Range` header a client sends. `segments` has 1189 rows, so any unranged `select("*")` on it silently drops rows past the 1000th (this bit the reading-plan seeding script and `app/api/state/route.ts`). Any future query expected to return more than 1000 rows must page through with repeated `.range()` calls rather than assuming one request returns everything.

The latest migration is important because it adds `reading_misses.session_id` and marks already-applied old immediate book proposals as `started`. If the app reports `column reading_misses.session_id does not exist`, the remote DB is missing that migration or is pointed at the wrong project.

Quick verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'reading_misses'
order by ordinal_position;
```

Expected columns include `session_id`.

## Current Reading Recovery Note (historical, pre multi-group)

On 2026-05-14, the live reading state was restored to:

- Current book: 전도서
- Current segment: 전도서 11장 (`ecc-11`)
- Progress session: kept on the existing 전도서 session
- Existing gift settings: restored for the current session

Future accepted book proposals should stay scheduled until the current book finishes, instead of replacing the current segment immediately.
