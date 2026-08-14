# Troubleshooting

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
