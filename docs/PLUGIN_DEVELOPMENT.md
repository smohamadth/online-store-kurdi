# Plugin development — architecture & developer guide

The store builder's plugin system lets a developer ship an **integration
package** (webhooks, event-driven automation) that an admin can **install,
configure, enable/disable, test and remove at runtime** — no rebuild, no
deploy, no database migration.

> **The one-paragraph model.** A plugin is a directory with a `plugin.json`
> manifest declaring which store events ("hooks") it cares about and a
> config schema. Installed plugins are **data-only**: they receive store
> events as signed webhooks POSTed to an admin-configured URL. Bundled
> plugins (shipped in the repo) may additionally register **code handlers**
> that run inside the API process. Both kinds are managed from
> **Admin → Plugins** and take effect immediately.

---

## 1. Plugin package anatomy

```
plugins/<id>/                      # (zip of this directory)
├── plugin.json        # REQUIRED — manifest (validated on install)
├── README.md          # recommended — shown to the admin
├── assets/            # optional — images/docs the plugin ships
└── (no code — installed plugins are data-only; see §4)
```

### `plugin.json` (the contract)

```jsonc
{
  "id": "order-webhook",            // ^[a-z0-9][a-z0-9-]*$, max 40, unique
  "name": "Order Webhook",
  "description": "Posts every new order to your ERP.",
  "version": "1.2.0",               // semver
  "author": "Kurdi Studio",
  "kind": "webhook",                // "webhook" (installed) | "code" (bundled only)
  "hooks": ["order.created", "payment.settled"],   // events this plugin receives
  "permissions": ["webhook"],       // v1: only "webhook"
  "configSchema": {                 // the admin config form (tiny DSL, §3)
    "url":      { "type": "string", "required": true, "label": "Endpoint URL" },
    "secret":   { "type": "string", "secret": true, "label": "Signing secret" },
    "timeoutMs": { "type": "number", "default": 5000, "label": "Timeout (ms)" }
  }
}
```

The schema is enforced by `apps/api/src/modules/plugins/plugin.schema.ts`
(install gate + config save) and mirrored by `scripts/plugin-pack.mjs`
(pack gate).

### Events (hooks) v1

| Event | When | Payload highlights |
|---|---|---|
| `order.created` | an order is placed (any payment method) | order id, orderNumber, totals, items, paymentMethod, paymentStatus, customer email |
| `payment.settled` | an order is marked paid (offline settle or Stripe webhook) | order id/number, amount, currency, transactionId, gateway |
| `product.created` | a product is created | product id, slug, name, price, quantity, categoryId, status |
| `product.updated` | a product is updated | same fields as created (current values) |
| `customer.registered` | a new account registers | user id, email, firstName, lastName |

Every delivery envelope is:

```json
{
  "event": "order.created",
  "pluginId": "order-webhook",
  "occurredAt": "2026-09-01T10:00:00.000Z",
  "store": { "name": "My Store" },
  "data": { ...hook payload... }
}
```

A plugin may declare `hooks` that don't exist yet — the platform rejects
unknown hook names at install so a typo is caught, not silently dropped.

## 2. The two tiers: bundled vs installed

| | **Bundled** (in the repo) | **Installed** (admin upload) |
|---|---|---|
| Where it lives | `apps/api/src/modules/plugins/bundled/<id>/` (code) | `<PLUGINS_DIR>/packages/<id>/` (files, written at runtime) |
| Handlers | **code handlers** run in-process (static import map) + optional webhook config | **webhook only** — events are POSTed to the configured URL |
| Takes effect | at boot (handlers registered when the API starts) | immediately (the hook emitter reads the disk catalog per event) |
| Removable by admin | no (bundled registry, `default`-style protection) | yes (guarded: must be disabled first) |
| Add one | code review + release (bundled registry) | `npm run plugin:pack -- <dir>` → upload the `.zip` |

**Why installed plugins are webhook-only.** Executing uploaded code in the
API process would be a remote-code-execution hole. The same rule as themes:
runtime-installed artifacts are **data**, never code. Webhooks cover the
overwhelming majority of real integrations (ERP sync, Slack/Telegram
notifications, CRMs, analytics pipes) with zero security risk. When a
plugin needs in-process logic, it ships bundled with the platform (or the
store operator runs it as a separate service and receives the webhook).

## 3. Config schema (the tiny DSL)

`configSchema` drives the admin form and validation:

```ts
type ConfigField = {
  type: 'string' | 'boolean' | 'number';
  label?: string;        // shown in the admin form
  required?: boolean;    // default false
  default?: string | boolean | number;
  secret?: boolean;      // stored encrypted-ish: never returned by GET (masked)
  max?: number;          // string length / number max
};
type ConfigSchema = Record<string, ConfigField>;
```

- Config is stored per plugin in `<PLUGINS_DIR>/state/<id>.json`
  (`{ enabled, config }`) — no database, no migration.
- `secret: true` fields are masked in API responses (`••••••••`), written
  plainly to the state file (same trust level as the existing
  `customCss`/SMTP settings), and included in webhook signatures.
- **Secret round-trip:** a save whose secret field carries the mask means
  "unchanged" — the API keeps the stored value instead of overwriting it
  with the placeholder (the admin UI sends the mask for blank secret
  inputs; a mask sent for a never-set secret leaves it unset).
- Saving config validates every field against the schema; unknown keys are
  stripped (same policy as themes).

## 4. Webhook delivery

When an event fires, the API calls `emit(event, payload)` (never throws;
errors go to the execution log). For every **enabled** installed plugin
that declared the event and has a configured `url`:

1. Build the envelope (§1) and the delivery options (`timeoutMs`, default
   5000, cap 30 000).
2. Every POST carries `X-Store-Webhook-Id` (a fresh UUID per attempt, so
   receivers can dedupe); when the plugin has a `secret` (every installed
   plugin gets a random one at install time) it also carries
   `X-Store-Webhook-Signature: sha256=<hex HMAC>` over the raw body — a
   receiver can verify the payload really came from this store.
3. `POST` with `Content-Type: application/json` and a
   `User-Agent: store-builder-webhook/1.0`.
4. Record the outcome (delivered / HTTP status / error) in the plugin's
   execution log (`<PLUGINS_DIR>/state/<id>.log.jsonl`, capped at 512 KB).
5. Delivery is **fire-and-forget** from the storefront's perspective
   (`void emit(...)` in routes) so a slow receiver never blocks an order.

The admin can **Test** a plugin from Admin → Plugins: it dispatches a
sample `order.created` payload to the configured URL and returns the
response/error — the standard way to verify a receiver before going live.

## 5. Bundled code plugins

A bundled plugin is a directory under
`apps/api/src/modules/plugins/bundled/<id>/` exporting handlers:

```ts
// bundled/my-erp/index.ts
import type { PluginHandlers } from '../../pluginHooks';

export const myErp: PluginHandlers = {
  id: 'my-erp',
  async onOrderCreated(payload, ctx) { /* in-process logic */ },
  async onPaymentSettled(payload, ctx) { /* ... */ },
};
```

The static import map `bundledRegistry.ts` registers it at boot (same
pattern as `themeSections.tsx` — a typo is a build error, not a runtime
404). Bundled plugins can also declare a config schema and webhook URL in
code, and they are subject to the same enable/disable state files.

The repo ships one bundled example: `bundled/order-logger` (logs every
order event through the platform logger — the "hello world" of plugins).

## 6. Runtime flow

```
order placed ──► order.routes.ts ──► hooks.emit('order.created', payload)
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
              bundled handlers                   installed plugins
              (static import map,              (disk catalog, enabled,
               in-process)                     webhook dispatcher)
                        │                               │
                        └──────────► execution log ◄────┘
```

- The hook registry (`pluginHooks.ts`) is a plain in-process map; emitters
  live at real business events (§1 table). Adding a new hook = emit at the
  event + document the payload.
- `emit` is safe: handler/dispatcher failures are logged, never thrown to
  the caller.
- The public API surface (all admin/manager):

| Endpoint | Role |
|---|---|
| `GET    /api/plugins` | list bundled + installed (with state, masked config) |
| `GET    /api/plugins/:id` | one plugin (incl. its `README.md` for the detail view) |
| `POST   /api/plugins/install` | install/update a `.zip` (validated, atomic, bundled-protected) |
| `PATCH  /api/plugins/:id` | enable/disable and/or save config + webhook url/timeout (validated) |
| `POST   /api/plugins/:id/test` | dispatch a sample event through the real pipeline |
| `GET    /api/plugins/:id/log` | last execution-log entries |
| `DELETE /api/plugins/:id` | uninstall (installed only, must be disabled) |

## 7. Storage & production

- `PLUGINS_DIR` env (default `./plugins` relative to the API cwd →
  `apps/api/plugins`): `packages/<id>/` holds installed manifests + assets,
  `state/<id>.json` holds `{ enabled, config }`, `state/<id>.log.jsonl` the
  execution log. All file-based — no database schema, no migration.
- `docker-compose.prod.yml` mounts a `plugins_data` volume at
  `/app/apps/api/plugins` and sets `PLUGINS_DIR`; the entrypoint creates it.
- Bundled plugins live in the compiled image — nothing to persist.

## 8. Developer workflow

```bash
# author plugins/<id>/plugin.json (+ README, assets)
npm run plugin:pack -- order-webhook          # validate + zip → dist/plugins/
# hand the .zip to the store admin → Admin → Plugins → Install
```

`scripts/plugin-pack.mjs` validates the manifest exactly like the install
gate (id regex, semver, kind, hooks subset, permissions, configSchema
shape), then zips `plugin.json`, `README.md` and `assets/`.

## 9. Security invariants

- A plugin zip is **data, never code**: only JSON/text/images are read;
  no script is ever executed from an installed package.
- Extraction is zip-slip-safe (absolute paths, `..`, backslashes, drive
  letters and symlinks rejected; entry/size caps) — the same hardened
  extractor the theme installer uses.
- Manifest is validated end-to-end before anything is written; an update
  replaces the previous version atomically; a smuggled `.bundled` marker
  is stripped.
- Bundled ids can never be overwritten or uninstalled through the API.
- Webhook URLs must be `http(s)`; delivery is signed with HMAC-SHA256 when
  a secret is configured; secrets are masked in API responses.
- `emit` never blocks or breaks the storefront: delivery is
  fire-and-forget, timeout-capped, failure-logged.

## 10. Roadmap (deliberately not in v1)

- **Storefront/UI extension points** (plugin-provided admin pages or
  storefront widgets) need a safe render model — the natural next step is
  mirroring the theme runtime overlay.
- **Payload templates** (custom JSON shapes per webhook).
- **Retries with backoff** and per-plugin delivery dashboards.
- **Plugin store / license checks** for `paid` plugins (metadata exists in
  the manifest shape; enforcement is a marketplace concern).
