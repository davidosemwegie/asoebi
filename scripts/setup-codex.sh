#!/usr/bin/env bash
set -euo pipefail

# Link this monorepo to Vercel and refresh the local development environment.
# Authenticate first with `pnpm dlx vercel@latest login`, or provide
# VERCEL_TOKEN through your shell or secret manager for non-interactive use.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

vercel_cli() {
  pnpm dlx vercel@latest "$@"
}

vercel_cli link --yes --cwd apps/web --scope clearjar-studio --project asoebi

vercel_cli env pull .env.local \
  --environment=development \
  --yes \
  --cwd apps/web \
  --scope clearjar-studio

vercel_cli env pull ../../packages/backend/.env.local \
  --environment=development \
  --yes \
  --cwd apps/web \
  --scope clearjar-studio

pnpm --filter @workspace/backend exec convex dev --once
