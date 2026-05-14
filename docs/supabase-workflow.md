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

- Fixed user profiles for the two readers
- Shared PIN session support through the app server
- Postgres database
- Reading progress
- Book-session `session_id`
- Missed-reading counts per book session
- Gift promises per book session
- Segment comments and replies
- Highlights
- Reactions
- Realtime chat messages
- Read state for chat

## Required Values

To link or re-link this repository to Supabase, prepare these values:

- Supabase access token
- Supabase project ref
- Database password for the Supabase project
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
APP_SHARED_PIN=
```

Only `NEXT_PUBLIC_*` variables are safe for browser code. `SUPABASE_SECRET_KEY` and `APP_SHARED_PIN` are server-only.

## First Schema Targets

MVP tables should cover:

- `profiles`: fixed user profiles for Joohwan and Heejin
- `segments`: 1,189 Bible chapter records from `seed_data.json`
- `reading_states`: per-user read check state
- `reading_misses`: per-user missed-reading records at the KST 2am boundary
- `book_gifts`: gift promises tied to the current book session
- `book_proposals`: proposed, accepted, started, or cancelled next-book choices
- `comments`: segment comments
- `replies`: replies to comments/highlights
- `highlights`: verse references and notes
- `messages`: realtime chat messages
- `message_reads`: chat read state
- `notifications`: app-internal unread notifications

## Applied Remote Migrations

Remote project `ggezuvdhuaizerfmkevl` has been updated with these app migrations:

- `202605020001_initial_mvp.sql`
- `202605100001_misses_and_gifts.sql`
- `202605140001_session_misses_and_deferred_books.sql`

The latest migration is important because it adds `reading_misses.session_id` and marks already-applied old immediate book proposals as `started`. If the app reports `column reading_misses.session_id does not exist`, the remote DB is missing that migration or is pointed at the wrong project.

Quick verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'reading_misses'
order by ordinal_position;
```

Expected columns include `session_id`.

## Current Reading Recovery Note

On 2026-05-14, the live reading state was restored to:

- Current book: 전도서
- Current segment: 전도서 11장 (`ecc-11`)
- Progress session: kept on the existing 전도서 session
- Existing gift settings: restored for the current session

Future accepted book proposals should stay scheduled until the current book finishes, instead of replacing the current segment immediately.
