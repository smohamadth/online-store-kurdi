# Deployment — installing the store on a client server

Two supported modes. Both end in the same place: a database whose schema
matches this checkout, a seeded store, and the storefront up.

## Mode A — Docker (recommended for client installs)

Prereqs on the server: Docker + Compose v2, Node 18+ (for the installer's
prisma steps — the app itself runs in containers).

```bash
git clone <repo> /opt/store && cd /opt/store
./scripts/install-store.sh            # docker compose install + seed
```

The installer:

1. creates `apps/api/.env` with a **fresh random `JWT_SECRET`** (edit it for
   SMTP / Stripe / `FRONTEND_URL` before go-live),
2. runs `npm ci`,
3. converges the database:
   - `prisma migrate deploy` (committed migrations),
   - a **drift check** — if `schema.prisma` has moved ahead of the committed
     migrations (pre-release reality), it regenerates the missing migration
     non-interactively (`migrate dev --name auto_sync_schema`) and deploys it.
     The database always ends up matching the checkout.
4. seeds the demo catalog + `admin@store.com / admin123`,
5. `docker compose -f docker/docker-compose.prod.yml --profile mail up -d --build`.

Services: postgres 16, redis 7, minio (object storage for uploads), api
(entrypoint runs `migrate deploy` on every boot, so upgrades converge
automatically), web (Next standalone, published on `:8080` — `WEB_PORT`
to change), optional MailHog on `:8025`.

Point a reverse proxy (nginx/Caddy/Traefik) at `:8080` and `:3001` for the
API, and put TLS in front. `PUBLIC_API_URL` in the compose environment must
be the URL the **customer's browser** uses to reach the API — the web image
bakes it in at build time.

## Mode B — plain Node (no Docker)

```bash
./scripts/install-store.sh --node     # deps + DB convergence + seed + web build
# then run:
(cd apps/api && npm run build && npm start)   # API  on :3001
(cd apps/web && npm start)                     # Web  on :3000
```

Bring your own Postgres/Redis/MinIO (or the dev compose for local
`DATABASE_URL`/`REDIS_URL`), or edit `apps/api/.env` to point at managed
services.

## Configuration (apps/api/.env)

| Key | When needed | Notes |
|---|---|---|
| `JWT_SECRET` | always | installer generates it; 32+ chars |
| `DATABASE_URL`, `REDIS_URL`, `MINIO_*` | always | |
| `SMTP_HOST/PORT/USER/PASS` | to send real email | without it, emails are logged only (order confirmations still "work" for the customer-facing flow; the admin test-email endpoint reports `delivered: false` honestly) |
| `FRONTEND_URL` | always | used in emails + Stripe return URLs |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | for card payment | see below |
| `PUBLIC_API_URL` (compose env) | always | browser-facing API URL, baked into the web image at build time |

### Enabling card payment (Stripe)

1. `STRIPE_SECRET_KEY=sk_live_...` in `apps/api/.env`.
2. Stripe dashboard → Webhooks → add endpoint
   `https://<api-host>/api/payments/webhooks/stripe`, event
   `checkout.session.completed`; copy its `whsec_...` secret to
   `STRIPE_WEBHOOK_SECRET`.
3. Restart the API. The card option appears in checkout (the store reports
   the capability via `GET /api/settings` → `stripeEnabled`).

No keys → the store stays in offline mode (cash on delivery / bank
transfer, settled by staff) and card orders are rejected *before* an order
row is created.

## Upgrading

```bash
git pull
./scripts/install-store.sh          # idempotent: migrations converge forward,
                                    # image rebuild picks up the new schema
```

The API container's entrypoint runs `prisma migrate deploy` on boot, so a
`docker compose up -d --build` after a pull is enough once the image is
rebuilt.

## Rollback

Migrations only run forward. To roll back an upgrade: keep the previous
image tag (`docker image ls store-api`), redeploy it, and revert the schema
only if the new migration was non-additive (destructive migrations are
called out in the commit that ships them).
