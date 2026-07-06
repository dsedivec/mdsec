#!/usr/bin/env bash
# Cut a release: verify preconditions, test, build, bump, tag, push.
# The GitHub release itself is created by CI on the tag push
# (.github/workflows/release.yml).
set -euo pipefail

die() { echo "release: $*" >&2; exit 1; }

bump="${1:-}"
case "$bump" in
  patch|minor|major) ;;
  *) die "usage: npm run release -- <patch|minor|major>" ;;
esac

cd "$(dirname "$0")/.."

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "must be on main"
[ -z "$(git status --porcelain)" ] || die "working tree is dirty"
git fetch origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
  || die "main is not in sync with origin/main"

npm test
npm run build
if ! git diff --quiet -- dist; then
  git add dist
  git commit -m "Rebuild dist for release"
fi

# npm version: bumps package.json, commits "vX.Y.Z", tags vX.Y.Z.
npm version "$bump" -m "Release v%s"
git push origin main --follow-tags

echo "release: pushed $(git describe --tags --exact-match)." \
  "CI will create the GitHub release."
