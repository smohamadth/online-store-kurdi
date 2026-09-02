#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# Database convergence for the API container entrypoint.
#
# IMPORTANT - this deliberately does NOT generate migrations inside the
# container. A migration generated in the container's filesystem would be
# lost on the next restart, leaving the database ahead of the migration
# history: `prisma migrate dev` would then detect that "drift" and offer to
# RESET the database (data loss) or fail without a TTY. Generating
# migrations is a HOST/REPO action (see scripts/sync-migrations.sh); the
# container only deploys and verifies.
#
# Flow:
#   1. migrate deploy            - apply every committed migration
#   2. migrate diff --exit-code  - is the deployed state == schema.prisma?
#      - in sync  -> start the server
#      - drifted  -> FAIL FAST with an actionable message. A store that
#                    boots against a schema it didn't create will 500 on
#                    every query that touches the missing tables - failing
#                    loudly at boot is the only honest outcome.
# ---------------------------------------------------------------------------
set -e

PRISMA=node_modules/.bin/prisma
# The Prisma CLI is a devDependency of apps/api, so npm hoists its
# binary to the repo root - try the workspace-local path first, then
# the hoisted one, then npx (which resolves up the tree).
[ -x "$PRISMA" ] || PRISMA=../../node_modules/.bin/prisma
[ -x "$PRISMA" ] || PRISMA="npx prisma"

echo "==> store-api: applying committed migrations (prisma migrate deploy)"
"$PRISMA" migrate deploy

echo "==> store-api: verifying schema.prisma matches the deployed migrations"
if "$PRISMA" migrate diff \
    --from-migrations ./prisma/migrations \
    --to-schema-datamodel ./prisma/schema.prisma \
    --exit-code >/dev/null 2>&1; then
  echo "    in sync"
else
  echo ""
  echo "    x schema drift: prisma/schema.prisma has moved ahead of the"
  echo "      committed migrations, so this image cannot create the full"
  echo "      database schema."
  echo ""
  echo "      Fix on the HOST (needs network for the Prisma engine):"
  echo ""
  echo "        scripts/sync-migrations.sh"
  echo ""
  echo "      ...commit the generated migration, rebuild the image,"
  echo "      and re-run compose."
  echo ""
  exit 1
fi

echo "==> store-api: ensuring plugin storage exists"
# Plugins are file-based (no DB): packages/ + state/ under PLUGINS_DIR
# (default apps/api/plugins; the prod compose mounts a named volume here).
PLUGINS_DIR="${PLUGINS_DIR:-plugins}"
mkdir -p "$PLUGINS_DIR/packages" "$PLUGINS_DIR/state"

echo "==> store-api: seeding bundled themes into \$THEMES_DIR"
# The themes directory is a shared volume (docker-compose.prod.yml mounts
# themes_data at /app/apps/web/themes). The API image bakes in the bundled
# themes at /app/apps/web/themes; on a fresh volume only the bundled
# themes exist, and admin-installed themes live alongside them. Copy any
# bundled theme that is missing from the volume so the disk catalog (the
# runtime source of truth for "what themes are installed") always contains
# the platform themes. Keys that already exist are left untouched so an
# edited bundled theme is never overwritten at boot.
THEMES_DIR="${THEMES_DIR:-../web/themes}"
SEED_DIR="${SEED_THEMES_DIR:-../web/themes}"
mkdir -p "$THEMES_DIR"
for d in "$SEED_DIR"/*/; do
  [ -e "$d" ] || continue
  key="$(basename "$d")"
  if [ ! -e "$THEMES_DIR/$key/theme.json" ]; then
    cp -R "$d" "$THEMES_DIR/$key"
    echo "    seeded bundled theme: $key"
  fi
done

echo "==> store-api: starting server on :${PORT:-3001}"
# If a command was passed (e.g. `docker compose run --rm api prisma db
# seed`), the DB-convergence steps above still run first, then we exec
# that command instead of the server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
exec node dist/server.js
