# Troubleshooting

## "the URL must start with the protocol `file:`" (Prisma P1012)

```
❌ Database connection failed: error: Error validating datasource `db`:
   the URL must start with the protocol `file:`
```

**Cause:** `DATABASE_URL` in `apps/api/.env` disagrees with `provider` in
`apps/api/prisma/schema.prisma`. The schema ships as **sqlite**, which needs a
`file:` URL, but your `.env` has a `postgresql://` one.

**This was our fault.** Both `.env.example` files used to contain a PostgreSQL
URL while every setup doc said `cp .env.example apps/api/.env` — so following
the instructions produced a broken install. The templates are fixed, but an
`.env` created earlier still has the old value.

### Fix

Edit `apps/api/.env` and set:

```
DATABASE_URL="file:./dev.db"
```

Then restart the API. Nothing else needs to change.

### You should not see the raw Prisma error any more

The API now checks this at startup and prints the fix instead:

```
❌ DATABASE_URL does not match your Prisma schema.

   schema.prisma provider : sqlite
   expected URL to start  : file:
   your DATABASE_URL uses : postgresql://

   Fix - edit apps/api/.env and set:

     DATABASE_URL="file:./dev.db"
```

### Actually want PostgreSQL?

1. set `provider = "postgresql"` in `apps/api/prisma/schema.prisma`
2. put your `postgresql://...` URL in `apps/api/.env`
3. re-run `cd apps/api && npx prisma migrate dev`

The committed migrations were generated for SQLite, so step 3 is required —
they will not apply cleanly to PostgreSQL as-is.

Covered by `scripts/verify-env-config.py`.

## "Cannot read properties of undefined (reading 'findUnique')"

Symptom: the admin shows **Settings not loaded — Cannot read properties of
undefined (reading 'findUnique')**, or any admin page 500s, even though the
API is clearly running and says `✅ Database connected successfully`.

**Cause:** the *generated* Prisma client is out of date. `@prisma/client` is
only a stub - the real client is written into `node_modules/.prisma/client` by
`prisma generate`. That directory is **not** tracked by git and is wiped by
`npm install`, `npm ci` and `rm -rf node_modules`.

A client generated before a model existed simply has no property for it:

```
prisma.product        -> object      (existed in the old schema)
prisma.themeSettings  -> undefined   (added later)  ->  .findUnique of undefined
```

`prisma.$connect()` still succeeds, which is why the server looks healthy.

### Fix

```bash
cd apps/api
npx prisma generate
npm run db:deploy        # only if you also pulled new migrations
```

Then restart the API.

### This should not happen again

* `postinstall` now runs `prisma generate` automatically in both the repo root
  and `apps/api`, so `npm install` can no longer leave a stale client.
* The API **refuses to start** against a stale client and prints exactly which
  models are missing plus the commands above, instead of starting and failing
  later.
* If it somehow still happens at runtime, the API returns
  `code: "PRISMA_CLIENT_STALE"` with an actionable message rather than the raw
  `undefined` TypeError.

## "Appearance / admin settings don't save" (Windows)

Symptom: you change a colour in **Admin → Appearance**, press *Save changes*,
and the value snaps back to the old one. Or the storefront keeps showing the
old theme no matter what you do.

**Root cause (fixed in this release):** the API bound *only* the IPv4 loopback
`127.0.0.1`, while the browser calls `http://localhost:3001`. On Windows,
`localhost` resolves to the IPv6 address `::1` **before** `127.0.0.1`. The
browser connected to `::1`, got *connection refused*, and every write silently
failed — while reads appeared to work because the storefront was painting from
the theme cached in `localStorage`.

The server now listens on **both** `127.0.0.1` and `[::1]`. You should see two
lines on startup:

```
✅ Server running on http://127.0.0.1:3001
✅ Also listening on http://[::1]:3001 (IPv6 loopback)
```

If you only see the first line, IPv6 is disabled on your machine. That is fine,
but you must then point the frontend at IPv4 explicitly. Create
`apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001/api
```

### How to confirm this is your problem

Open the browser devtools **Network** tab and press Save. A failed request
shows as `(failed) net::ERR_CONNECTION_REFUSED` against `localhost:3001`.
The Console will now also print an explicit `[theme] Could not reach …` error
instead of failing silently.

### Other causes of the same symptom

1. **The database is out of date.** The API returns `MIGRATION_REQUIRED` and the
   admin shows the real message. Fix:
   ```
   cd apps/api && npm run db:deploy
   ```
   then restart the API.
2. **You are looking at a stale cache.** The theme is cached in `localStorage`
   under `themeSettings` so the page can paint before the API answers. Hard
   reload with `Ctrl+Shift+R`.
3. **Two API processes.** If an old `tsx` process is still holding port 3001,
   your edits go to whichever one answers. Kill them all and start one.

## `EACCES: permission denied 0.0.0.0:3000` (Windows)

```
Error: listen EACCES: permission denied 0.0.0.0:3000
```

This is **not** a bug in the app. Windows is refusing to let Node bind the port.
It is almost always one of three things.

The dev scripts now bind to `127.0.0.1` instead of `0.0.0.0`, which resolves the
most common case on its own. If you still hit it, work through these.

### 1. The port sits in a Windows *reserved* range (most common)

Hyper-V, WSL2, Docker Desktop and Windows Sandbox reserve blocks of TCP ports.
Anything inside a reserved block fails with `EACCES` even when nothing is
listening on it, and even in an Administrator terminal.

Check the reserved ranges:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

If `3000` (or `3001`) falls inside a listed range, pick a port outside it:

```powershell
# API - edit apps/api/.env
PORT=4001

# Web
cd apps\web
npx next dev -H 127.0.0.1 -p 4000
```

Remember to point the frontend at the new API port in `apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:4001/api
```

You can also free the range by restarting the Windows NAT service (run as
Administrator — this briefly drops Docker/WSL networking):

```powershell
net stop winnat
net start winnat
```

### 2. Something is already using the port

`EADDRINUSE` is the usual error here, but a half-dead process can surface as
`EACCES` too:

```powershell
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

### 3. Firewall / antivirus blocking all-interface binds

Binding `0.0.0.0` requests **every** network interface, which some corporate
policies and antivirus products block. Binding `127.0.0.1` (now the default)
only listens locally and is usually permitted.

---

## Need the dev server reachable from another device?

`127.0.0.1` is local-only by design. For phone testing on your LAN:

```bash
npm run dev:lan --workspace=apps/web     # binds 0.0.0.0
```

For the API, set `HOST` before starting:

```powershell
set HOST=0.0.0.0 && npm run dev:api      # cmd
$env:HOST="0.0.0.0"; npm run dev:api     # PowerShell
```

---

## Other common issues

### Admin gallery is empty / "No banners yet"

The database has no banner rows yet. Either:

```bash
cd apps/api
npm run setup          # migrate + generate + seed (fresh install)
# or just the banners:
node prisma/seed-banners.js
```

…or open **Admin → Gallery & Banners** and click **Import the default slides**.

### Changes to `apps/api` do not take effect

`tsx` loads the code once at startup and does not watch by default. Restart the
API after editing anything under `apps/api/src`.

### `Cannot find module '@prisma/client'`

```bash
cd apps/api && npx prisma generate
```

### Everything returns HTTP 429

The rate limiter tripped. Development skips read-only GETs, but if you changed
`RATE_LIMIT_MAX`, restart the API — the limiter state is in memory.


---

## Admin → Appearance (or any admin page) won't save

**Symptom:** you change a setting, press Save, and nothing persists.

**Cause:** almost always that your **database is behind the code**. Features
added later (Appearance/theme, banners, menus) each ship a Prisma migration.
If you pull new code without running migrations, the table does not exist and
every read and write to it fails.

The API now tells you this directly:

```
MIGRATION_REQUIRED — main.ThemeSettings does not exist in the database.
Your database is out of date - run `npm run db:deploy` in apps/api,
then restart the API.
```

**Fix:**

```bash
cd apps/api
npm run db:deploy     # apply any pending migrations
npx prisma generate   # regenerate the client
```

Or from the repository root:

```bash
npm run db:deploy
```

> Note: the root `npm run setup` expects Docker/PostgreSQL. With the default
> SQLite setup use `cd apps/api && npm run setup` instead, which runs
> migrate deploy + generate + seed.

Then **restart the API**. `tsx` loads the code once at startup and does not
watch, so a running server keeps using the old Prisma client.

### If `db:deploy` reports "table already exists"

This happens when a table was created with `prisma db push` (which does not
record a migration). Tell Prisma the migration is already applied:

```bash
npx prisma migrate resolve --applied 20260813052757_add_theme_settings
npx prisma migrate resolve --applied 20260813060826_add_card_bg
npx prisma migrate status     # should say "Database schema is up to date!"
```

### Still not saving?

Open the browser devtools Network tab and press Save. The `PUT /api/theme`
response tells you exactly what happened:

| Status | Meaning |
|---|---|
| **200** | Saved. If the storefront looks unchanged, hard-refresh — the theme is cached in `localStorage`. |
| **401** | Session expired — sign out and back in. |
| **403** | The account is not an admin/manager. |
| **400** | Validation failed; the message names the field (e.g. a bad hex colour). |
| **500 / MIGRATION_REQUIRED** | Run the migration steps above. |

## A page or blog post 404s (or shows "Page not found") after you create it

Three separate causes have produced this exact symptom. Check in order.

1. **The title is not in Latin script.** `slugify()` used to strip every
   non-Latin character, so `کۆمپانیای ئێمە` became the empty string and the
   page saved under an address you never saw. Fixed 2026-08-20: slugs now keep
   letters from any script, and a title that still slugifies to nothing falls
   back to `page-<id>`. If you created pages before that fix, open each one and
   set a slug by hand.
2. **HTTP 200 but the body says "Page not found".** Next.js hands
   `params.slug` to a server component already percent-encoded, so the old
   `encodeURIComponent(slug)` double-encoded it and the API lookup missed. Use
   `encodeRouteParam` from `lib/routeParam.ts` for every dynamic segment.
3. **The page is a draft.** Drafts 404 by design. New pages default to
   Published; anything created before 2026-08-20 may still be a draft.

Covered by `scripts/verify-page-slugs.py`.

## An empty block of navy in the admin sidebar

Two different layout bugs, both reported the same way:

- Dead space **above** the user card - the `<nav>` had `flex: 1` and claimed
  every spare pixel.
- A large lighter block **below** the Logout button - the user panel had
  `flex: 1 1 auto` and STRETCHED, up to ~510px on a 1300px-tall screen.

The rail must be: nav `flex: 0 1 auto`, user panel `flex: 0 0 auto` with
`marginTop: auto`. Any slack then sits above the card in the rail's own
`#1a1a2e`, so it is invisible. Measure before changing anything -
`scripts/verify-admin-rail.py` checks seven viewport heights and asserts the
painted colour of the gap, not just its size.
