# Troubleshooting

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
