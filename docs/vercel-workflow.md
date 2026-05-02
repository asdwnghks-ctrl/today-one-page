# Vercel Workflow

## Current Setup

- Vercel account: `asdwnghks-ctrl`
- Project: `today-one-page`
- GitHub repository: `https://github.com/asdwnghks-ctrl/today-one-page`
- Root directory: `.`
- Node.js version: `24.x`
- Current framework preset: `Other`

## Deployment Flow

Commits are pushed to GitHub automatically by the local Git post-commit hook. Vercel is connected to the GitHub repository, so pushes to `main` trigger deployments.

```text
git commit -> post-commit push -> GitHub main -> Vercel deployment
```

## Important Note

The repository is connected to Vercel, but it is not a real web app yet. There is no `package.json`, Next.js app directory, or public `index.html`.

The next implementation step is to scaffold the Next.js app. After that, Vercel should build and deploy the app normally.

