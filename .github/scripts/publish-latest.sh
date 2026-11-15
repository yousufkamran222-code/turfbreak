#!/usr/bin/env bash
# Replace one build's file on the rolling "latest" pre-release.
# Usage: publish-latest.sh <asset-prefix> <file>
# Old assets that start with <asset-prefix> are deleted first, so the release
# always holds exactly one file per build kind.
set -euo pipefail
prefix="$1"
file="$2"
tag="latest"
short="${GITHUB_SHA::7}"
notes="Rolling debug builds from main. Newest commit: ${short}.

Install the APK on your phone from this page. It is debug-signed with a stable key, so it installs over the previous one and keeps saves."

if ! gh release view "$tag" >/dev/null 2>&1; then
  # Two workflows may race to create it; the loser simply edits it below.
  gh release create "$tag" --prerelease --title "Latest build" --notes "$notes" --target "$GITHUB_SHA" || true
fi

# Point the tag at this commit so the release page shows the right source.
gh api -X PATCH "repos/${GITHUB_REPOSITORY}/git/refs/tags/${tag}" -f sha="$GITHUB_SHA" -F force=true >/dev/null ||
  gh api -X POST "repos/${GITHUB_REPOSITORY}/git/refs" -f ref="refs/tags/${tag}" -f sha="$GITHUB_SHA" >/dev/null
gh release edit "$tag" --prerelease --title "Latest build (${short})" --notes "$notes"

gh release view "$tag" --json assets --jq '.assets[].name' | while read -r name; do
  if [[ "$name" == "$prefix"* ]]; then
    gh release delete-asset "$tag" "$name" --yes
  fi
done
gh release upload "$tag" "$file" --clobber
