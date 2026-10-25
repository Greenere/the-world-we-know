#!/usr/bin/env bash
# Deploys the atlas to the Greenere.github.io subpage at /the-world-we-know/.
# Builds the data and the site here, then copies only the compiled dist/ into a
# sibling checkout of Greenere.github.io, commits and pushes it. The source tree
# is never copied into the site repo.
#
# Usage: scripts/deploy.sh   (or: npm run deploy)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

site_dir="../Greenere.github.io"
subdir="the-world-we-know"
base_path="/the-world-we-know/"

if [ ! -d "$site_dir/.git" ]; then
  echo "error: expected a git checkout of Greenere.github.io at $site_dir (sibling of this repo)" >&2
  exit 1
fi

if [ -n "$(git -C "$site_dir" status --porcelain)" ]; then
  echo "error: $site_dir has uncommitted changes -- commit/stash them before deploying" >&2
  exit 1
fi

echo "==> Pulling the latest site"
git -C "$site_dir" pull --ff-only origin master

echo "==> Building data and site for GitHub Pages (base=$base_path)"
npm run data
npx tsc --noEmit
npx vite build --base="$base_path"

echo "==> Syncing dist/ into $site_dir/$subdir"
mkdir -p "$site_dir/$subdir"
rsync -a --delete dist/ "$site_dir/$subdir/"

cd "$site_dir"
git add "$subdir"
if git diff --cached --quiet; then
  echo "==> No changes to deploy."
  exit 0
fi
git commit -m "Deploy the-world-we-know ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
git push origin master
echo "==> Deployed: https://greenere.github.io/$subdir/"
