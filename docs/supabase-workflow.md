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

- Auth for the two fixed users
- Postgres database
- Reading progress
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
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Only `NEXT_PUBLIC_*` variables are safe for browser code. `SUPABASE_SERVICE_ROLE_KEY` is server-only.

## First Schema Targets

MVP tables should cover:

- `profiles`: fixed user profiles for Joohwan and Heejin
- `segments`: 1,189 Bible chapter records from `seed_data.json`
- `reading_states`: per-user read check state
- `comments`: segment comments
- `comment_replies`: replies to comments/highlights
- `highlights`: verse references and notes
- `messages`: realtime chat messages
