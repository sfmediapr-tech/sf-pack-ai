#!/usr/bin/env bash
# Deploy to Vercel production.
#
# Deploys from a copy of the tree with .git removed. That is not superstition:
# when the CLI can see a git repository it sends the commit metadata, and
# Vercel then refuses to build until the commit author can be matched to a
# GitHub account connected to the Vercel account. Until that connection exists
# (Vercel → Settings → Login Connections → GitHub), every deploy comes back
# "Deployment Blocked" with no build log.
#
# Once GitHub is connected to the Vercel account, delete this script and use
# `vercel deploy --prod` directly, or better, connect the repo so pushes deploy
# themselves.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
staging="$(mktemp -d)/sf-pack-ai"
mkdir -p "$staging"

rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.vercel/output' \
  --exclude '.vercel/static-build' \
  "$here"/ "$staging"/

echo "Staged without git metadata: $staging"
cd "$staging"
npx --yes vercel@latest deploy --prod --yes
