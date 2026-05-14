# Vercel Workflow

## Current Setup

- Vercel account: `asdwnghks-ctrl`
- Project: `today-one-page`
- GitHub repository: `https://github.com/asdwnghks-ctrl/today-one-page`
- Root directory: `.`
- Node.js version: `24.x`
- Framework: `Next.js`
- Build command: `npm run build`
- Config: `vercel.json`

## Deployment Flow

Commits are pushed to GitHub automatically by the local Git post-commit hook. Vercel is connected to the GitHub repository, so pushes to `main` trigger deployments.

```text
git commit -> post-commit push -> GitHub main -> Vercel deployment
```

## Important Note

The repository is now a real Next.js app with `package.json`, `app/page.tsx`, and a Vercel config.

Before judging a deployment, verify:

- Vercel has the Supabase environment variables.
- Supabase migrations have been applied to the remote project.
- `npm run build` succeeds locally.

Render is not part of the current deployment path. It can be reconsidered later for long-running workers or scheduled jobs, but the current app/API shape is handled by Vercel + Supabase.
