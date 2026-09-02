#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# CI guard: fail if prisma/migrations has drifted from prisma/schema.prisma.
#
# WHY THIS EXISTS
#   Schema changes have shipped without migrations before (the variant
#   rename, multi-currency, downloads, ...), which breaks fresh
#   `prisma migrate deploy` databases (see KNOWN_GAPS.md #9). This guard
#   makes that visible in CI: it diffs the committed migrations against
#   schema.prisma and fails the build if they no longer reproduce the
#   schema exactly.
#
#   It is the read-only twin of scripts/sync-migrations.sh: sync-migrations
#   *fixes* the drift (needs a networked machine for the engine); this
#   script only *detects* it, so it can run in CI and block regressions.
#
# USAGE (CI api-checks job, before/around `prisma migrate deploy`):
#   scripts/verify-migrations.sh
#
# On failure, run scripts/sync-migrations.sh on a machine with network
# access, then commit apps/api/prisma/migrations/.
#
# Requires: node 18+, npx, and DATABASE_URL (read from apps/api/.env or the
#   environment). The Prisma CLI version is pinned to match CI so the
#   diff engine is deterministic. No running database is needed - the
#   diff runs against the migrations folder + a temp shadow database.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/../apps/api"

command -v npx >/dev/null || { echo "npx not found - install Node.js 18+ first" >&2; exit 1; }
[ -f .env ] || echo "  (note: apps/api/.env not found; using DATABASE_URL from the environment)" >&2

# Match the PRISMA_VERSION pinned in .github/workflows/ci.yml so the schema
# engine used here is the same one CI uses to deploy.
PRISMA_VERSION="${PRISMA_VERSION:-5.22.0}"

echo "==> Checking migrations vs schema.prisma (prisma@${PRISMA_VERSION})"
if npx --yes "prisma@${PRISMA_VERSION}" migrate diff \
    --from-migrations ./prisma/migrations \
    --to-schema-datamodel ./prisma/schema.prisma \
    --exit-code >/dev/null 2>&1; then
  echo "    in sync - migrations fully reproduce schema.prisma."
  exit 0
fi

cat >&2 <<'EOF'

  x Migrations have drifted from prisma/schema.prisma.

    A fresh `prisma migrate deploy` would produce a schema that does not
    match schema.prisma, so clean-checkout deploys and CI would be broken.

    Fix it with (on a machine that has network access for the engine):

        scripts/sync-migrations.sh

    then commit the generated apps/api/prisma/migrations/ and re-run.
EOF
exit 1
