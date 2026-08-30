#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Generate + apply the missing migrations so the repo ships a complete,
# in-sync migrations directory.
#
# WHY THIS EXISTS
#   prisma/schema.prisma has moved ahead of prisma/migrations (the
#   variant-first-class rename, multi-currency, downloads, stock system,
#   review photos, ...). Generating that migration requires the Prisma
#   engine binary, which is network-fetched at run time - so it cannot be
#   generated in every environment (CI sandboxes, air-gapped installs).
#   Run this script ONCE on any machine that has network access:
#
#       scripts/sync-migrations.sh
#
#   It will (non-interactively):
#     1. apply the committed migrations to the configured database,
#     2. detect the drift between the migrations and schema.prisma,
#     3. generate a new migration (auto_sync_schema) that closes the gap,
#     4. apply it, and
#     5. verify the deployed state now matches schema.prisma exactly.
#
#   Then COMMIT prisma/migrations/* and rebuild/redeploy. After that the
#   one-command install (scripts/install-store.sh) needs no drift repair:
#   the container entrypoint verifies and boots.
#
# NOTES
#   - The database must be reachable via apps/api/.env (DATABASE_URL).
#   - For a fresh database this is a pure create - no data is touched.
#   - On an EXISTING database the generated migration includes the
#     ProductVariant -> Variant table rename; Prisma detects renames from
#     the column diff, but review the generated migration.sql before
#     committing (one minute, prevents surprises).
#   - Requires: node 18+, the Prisma CLI (npx), network for the engine.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/../apps/api"

command -v npx >/dev/null || { echo "npx not found - install Node.js 18+ first"; exit 1; }
[ -f .env ] || { echo "apps/api/.env not found - create it from .env.example first"; exit 1; }

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

log "1/5 applying committed migrations"
npx prisma migrate deploy

log "2/5 checking for schema drift (migrations vs schema.prisma)"
if npx prisma migrate diff \
    --from-migrations ./prisma/migrations \
    --to-schema-datamodel ./prisma/schema.prisma \
    --exit-code >/dev/null 2>&1; then
  echo "    already in sync - nothing to generate."
  exit 0
fi
echo "    drift detected - generating the sync migration"

log "3/5 generating migration 'auto_sync_schema'"
# --skip-generate: don't regenerate the client here (postinstall does it).
# On a NON-TTY (CI) Prisma refuses interactive resets, which is exactly
# what we want: no silent data loss, ever.
npx prisma migrate dev --name auto_sync_schema --skip-generate

log "4/5 applying the new migration"
npx prisma migrate deploy

log "5/5 verifying the deployed state matches schema.prisma"
if npx prisma migrate diff \
    --from-migrations ./prisma/migrations \
    --to-schema-datamodel ./prisma/schema.prisma \
    --exit-code >/dev/null 2>&1; then
  echo "    in sync."
else
  echo "    x still out of sync after the sync migration - inspect manually:"
  echo "        npx prisma migrate diff --from-migrations ./prisma/migrations \\"
  echo "            --to-schema-datamodel ./prisma/schema.prisma --script"
  exit 1
fi

echo ""
echo "Done. Review and COMMIT the generated files:"
echo "    git add apps/api/prisma/migrations && git commit -m 'prisma: sync migrations with schema'"
