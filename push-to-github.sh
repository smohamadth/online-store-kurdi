#!/usr/bin/env bash
#
# Push the local commits to GitHub.
#
# This sandbox has no GitHub credentials, so the push has to be authenticated
# by you. Pick ONE of the options below.
#
# The push is a FAST-FORWARD: every commit already on GitHub is preserved,
# your local history simply continues from it. Nothing is overwritten.
#
set -euo pipefail

REPO="github.com/smohamadth/online-store-kurdi.git"
BRANCH="main"

cd "$(dirname "$0")"

echo "Local commits waiting to be pushed:"
git log --oneline origin/$BRANCH..HEAD | cat
echo

# ---------------------------------------------------------------------------
# Option A: personal access token passed as an argument or GITHUB_TOKEN env var
#   ./push-to-github.sh ghp_yourTokenHere
#   GITHUB_TOKEN=ghp_... ./push-to-github.sh
#
# Create a token at: https://github.com/settings/tokens
#   - "Fine-grained token" -> select this repo -> Contents: Read and write
#   - or a classic token with the `repo` scope
# ---------------------------------------------------------------------------
TOKEN="${1:-${GITHUB_TOKEN:-}}"

if [ -n "$TOKEN" ]; then
  echo "Pushing with token..."
  # The token is only used for this one command and is not written to disk
  # or stored in the git config.
  git push "https://x-access-token:${TOKEN}@${REPO}" "$BRANCH"
  echo "Done."
  exit 0
fi

# ---------------------------------------------------------------------------
# Option B: no token supplied - fall back to an interactive push.
# Git will prompt for a username and password; for the password paste a
# personal access token (GitHub no longer accepts account passwords).
# ---------------------------------------------------------------------------
echo "No token supplied - trying an interactive push."
echo "Username: your GitHub username"
echo "Password: a personal access token (NOT your account password)"
echo
git push "https://${REPO}" "$BRANCH"
