#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Store-builder installer for a client server.
#
#   ./scripts/install-store.sh            # docker compose install (default)
#   ./scripts/install-store.sh --node     # plain node install (no docker)
#   ./scripts/install-store.sh --seed     # seed demo data (default: yes with docker)
#   ./scripts/install-store.sh --no-seed
#
# What it does, in order:
#   1. checks prerequisites (node 18+, docker for docker mode)
#   2. generates apps/api/.env with a fresh random JWT_SECRET if absent
#   3. installs dependencies (npm ci)
#   4. converges the database:
#        a. prisma migrate deploy               (committed migrations)
#        b. drift check: schema.prisma vs the committed migrations
#        c. if drifted, regenerates the missing migration NON-INTERACTIVELY
#           (migrate dev --name auto_sync_schema) and deploys it
#      -> the database always ends up matching this checkout's schema,
#         which is what makes a fresh client-server install one command.
#   5. seeds the store (unless --no-seed)
#   6. builds and starts (docker compose, or next build + node)
#
# Re-running it is safe: it is an installer, not a reset. It never drops
# data; only `prisma migrate` commands run, and only forward.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="docker"
SEED=1

for arg in "$@"; do
  case "$arg" in
    --node) MODE="node" ;;
    --seed) SEED=1 ;;
    --no-seed) SEED=0 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m    x %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. prerequisites ------------------------------------------------------
log "Checking prerequisites"
command -v node >/dev/null || die "node is not installed (need >= 18)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "node 18+ required (found $(node -v))"
command -v npm >/dev/null || die "npm is not installed"
if [ "$MODE" = "docker" ]; then
  command -v docker >/dev/null || die "docker is not installed (or pass --node)"
  docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"
fi
echo "    node $(node -v), npm $(npm -v), mode: $MODE"

# --- 2. .env ----------------------------------------------------------------
log "Preparing apps/api/.env"
ENV_FILE="$REPO_ROOT/apps/api/.env"
if [ ! -f "$ENV_FILE" ]; then
  JWT="$(openssl rand -hex 32 2>/dev/null || node -p 'require("crypto").randomBytes(32).toString("hex")')"
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  # .env.example ships an obviously-placeholder JWT secret; replace it.
  if sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$JWT/" "$ENV_FILE" 2>/dev/null; then
    rm -f "$ENV_FILE.bak"
  else
    # BSD sed (macOS)
    sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=$JWT/" "$ENV_FILE"
  fi
  echo "    created $ENV_FILE with a fresh random JWT_SECRET"
  warn "edit $ENV_FILE before going live (SMTP, Stripe, FRONTEND_URL)"
else
  echo "    $ENV_FILE already exists - keeping it"
fi

# --- 3. dependencies ---------------------------------------------------------
log "Installing dependencies (npm ci)"
( cd "$REPO_ROOT" && npm ci --no-audit --no-fund )

# --- 4. database -------------------------------------------------------------
#
# Docker mode: the database runs INSIDE the compose network, so the host
# cannot reach it. Convergence happens at container boot instead: the API
# image's entrypoint runs `prisma migrate deploy` and then VERIFIES that
# the deployed state matches prisma/schema.prisma, failing fast (with an
# actionable message) if the committed migrations lag the schema. It never
# generates migrations inside the container - that would create ephemeral
# migrations that "disappear" on restart and turn into a drift/reset risk.
#
# Node mode: the database is on the host, so we converge it here, and
# self-heal by generating the missing migration (this is safe on a host
# checkout: the generated files persist in ./prisma/migrations).
#
log "Converging the database"
cd "$REPO_ROOT/apps/api"

if [ "$MODE" = "docker" ]; then
  echo "    (docker mode) the database lives in the compose network;"
  echo "    migrations are applied and verified at container boot."
  echo "    If boot fails on 'schema drift', run: scripts/sync-migrations.sh"
else
  echo "    4a. applying committed migrations (prisma migrate deploy)"
  npx prisma migrate deploy

  echo "    4b. checking schema drift (schema.prisma vs committed migrations)"
  if npx prisma migrate diff \
      --from-migrations ./prisma/migrations \
      --to-schema-datamodel ./prisma/schema.prisma \
      --exit-code >/dev/null 2>&1; then
    echo "    in sync - nothing to do"
  else
    echo "    schema has drifted: generating the missing migration (auto_sync_schema)"
    npx prisma migrate dev --name auto_sync_schema --skip-generate
    echo "    deploying the generated migration"
    npx prisma migrate deploy
  fi
fi

# --- 5 + 6. seed, build, start (order depends on mode) ------------------------
if [ "$MODE" = "docker" ]; then
  # Docker mode order: up the stack first (the API entrypoint converges
  # the database on boot), THEN seed through the api container so the
  # seed uses the compose-network DATABASE_URL (the host cannot reach
  # the containerised postgres).
  log "Building and starting the stack (docker compose, profile: mail)"
  COMPOSE="docker compose -f docker/docker-compose.prod.yml --profile mail"
  ( cd "$REPO_ROOT" \
    && POSTGRES_PASSWORD="$(grep '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)" \
       JWT_SECRET="$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)" \
    $COMPOSE up -d --build )

  echo "    waiting for the API health endpoint..."
  for i in $(seq 1 60); do
    if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -sf http://localhost:3001/health >/dev/null 2>&1 \
    || { echo "    api is not healthy - check: $COMPOSE logs api"; exit 1; }

  if [ "$SEED" = "1" ]; then
    log "Seeding the store (demo catalog, admin@store.com / admin123)"
    ( cd "$REPO_ROOT" && $COMPOSE run --rm --no-deps api node_modules/.bin/prisma db seed )
  else
    echo "    skipping seed (--no-seed)"
  fi

  echo
  echo "    storefront:  http://localhost:8080"
  echo "    api:         http://localhost:3001/health"
  echo "    mail sink:   http://localhost:8025 (profile: mail)"
  echo "    minio:       http://localhost:9001"
  echo
  echo "    logs: $COMPOSE logs -f"
  warn "change the admin password (admin@store.com / admin123) before going live"
else
  # Node mode: database is on the host - converge it, seed it, build.
  if [ "$SEED" = "1" ]; then
    log "Seeding the store (demo catalog, admin@store.com / admin123)"
    npx prisma db seed
  else
    echo "    skipping seed (--no-seed)"
  fi

  log "Building the web app (next build)"
  ( cd "$REPO_ROOT/apps/web" && npm run build )
  log "Starting API (node dist/server.js) - run: (cd apps/api && npm run build && npm start)"
  log "Starting web (next start)          - run: (cd apps/web && npm start)"
  echo
  echo "    build done - start the two processes above (or your service manager)"
fi

log "Install complete"
