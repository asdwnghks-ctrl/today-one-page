# GitHub Workflow

## Goal

Code changes should be easy to save and push to GitHub.

## Current Setup

- Local Git repository uses `main`.
- Remote repository is `https://github.com/asdwnghks-ctrl/today-one-page.git`.
- Git hooks are stored in `.githooks`.
- `.githooks/post-commit` automatically pushes the current branch to `origin` after every successful commit.

## Normal Flow

```bash
git add .
git commit -m "Update project docs"
```

After the commit succeeds, the hook runs:

```bash
git push origin main
```

## First Remote Setup

Create an empty GitHub repository, then connect it:

```bash
git remote add origin https://github.com/asdwnghks-ctrl/today-one-page.git
git push -u origin main
```

After that, future commits will push automatically.
