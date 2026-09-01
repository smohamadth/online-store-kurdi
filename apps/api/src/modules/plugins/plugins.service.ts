// ---------------------------------------------------------------------------
// Plugin service — catalog, state and lifecycle for installed plugins.
//
// Storage (file-based, no DB — same philosophy as the theme studio):
//   <PLUGINS_DIR>/
//     packages/<id>/          uploaded package (plugin.json + README + assets)
//     state/<id>.json         { installedAt, enabled, config, secret }
//     state/<id>.log.jsonl    execution log (webhook delivery attempts)
//
// Bundled plugins have no on-disk package: they are the static in-process
// code map (bundledRegistry.ts). They can never be overwritten/uninstalled
// and are always enabled.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { extractZipToMap, normalizeEntryPaths } from '../../utils/zipPackage';
import { pluginManifestSchema, validatePluginConfig, maskSecretConfig, KNOWN_HOOKS, HOOK_METHODS } from './plugin.schema';
import type { PluginManifest, HookName } from './plugin.schema';
import { isBundledPluginId, listBundledPluginIds, getBundledPlugin } from './bundledRegistry';
import { isValidWebhookUrl } from './pluginWebhook';
import { logger } from '../../utils/logger';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);
const rename = promisify(fs.rename);

// ---------------------------------------------------------------------------
// Limits (an uploaded .zip is untrusted input — keep in sync with the
// multer limit in the routes).
// ---------------------------------------------------------------------------
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const MAX_LOG_BYTES = 512 * 1024;

export interface PluginState {
  version: 1;
  installedAt: string;
  enabled: boolean;
  config: Record<string, string | boolean | number>;
  /** HMAC signing secret for webhook delivery (webhook-kind plugins). */
  secret?: string;
  /** Admin-configured webhook target URL (webhook-kind plugins). */
  url?: string;
  /** Admin-configured per-plugin delivery timeout (ms). */
  timeoutMs?: number;
}

/** The admin-facing view of a plugin (secrets masked). */
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  kind: 'webhook' | 'code';
  hooks: HookName[];
  bundled: boolean;
  enabled: boolean;
  installedAt: string | null;
  config: Record<string, string | boolean | number>;
  configSchema: PluginManifest['configSchema'];
  logCount: number;
  /** Admin-configured webhook target (webhook-kind installed plugins). */
  url?: string;
  timeoutMs?: number;
}

function pluginsDir(): string {
  return path.resolve(process.cwd(), process.env.PLUGINS_DIR || 'plugins');
}

function packageDir(id: string): string {
  return path.join(pluginsDir(), 'packages', id);
}

function statePath(id: string): string {
  return path.join(pluginsDir(), 'state', `${id}.json`);
}

function logPath(id: string): string {
  return path.join(pluginsDir(), 'state', `${id}.log.jsonl`);
}

/** Ensure the storage tree exists (idempotent; also called at boot). */
export async function initPluginsStorage(): Promise<void> {
  await mkdir(path.join(pluginsDir(), 'packages'), { recursive: true });
  await mkdir(path.join(pluginsDir(), 'state'), { recursive: true });
}

/** Read a plugin's state file. Returns null if missing/corrupt. */
async function readState(id: string): Promise<PluginState | null> {
  if (!fs.existsSync(statePath(id))) return null;
  try {
    const raw = await readFile(statePath(id), 'utf8');
    return JSON.parse(raw) as PluginState;
  } catch {
    return null;
  }
}

async function writeState(id: string, state: PluginState): Promise<void> {
  await mkdir(path.dirname(statePath(id)), { recursive: true });
  await writeFile(statePath(id), JSON.stringify(state, null, 2), 'utf8');
}

/** Read an installed plugin's manifest from its package dir. */
async function readInstalledManifest(id: string): Promise<PluginManifest | null> {
  const file = path.join(packageDir(id), 'plugin.json');
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = pluginManifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    return parsed;
  } catch (err) {
    logger.error(`[plugins] corrupt manifest for "${id}": ${(err as Error)?.message}`);
    return null;
  }
}

/** Read the plugin.json + README text of an installed package. */
export async function readPackageDocs(id: string): Promise<{ readme: string | null; manifest: PluginManifest | null }> {
  const manifest = await readInstalledManifest(id);
  const readmeFile = path.join(packageDir(id), 'README.md');
  let readme: string | null = null;
  if (fs.existsSync(readmeFile)) {
    try {
      readme = await readFile(readmeFile, 'utf8');
    } catch {
      readme = null;
    }
  }
  return { readme, manifest };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** Synthesize the admin-facing view for a bundled (code) plugin. */
function bundledPluginInfo(handlers: ReturnType<typeof getBundledPlugin>): PluginInfo | null {
  if (!handlers) return null;
  const hooks: HookName[] = KNOWN_HOOKS.filter((h) => handlers[HOOK_METHODS[h]] !== undefined);
  return {
    id: handlers.id,
    name: handlers.id
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' '),
    description: 'Platform-bundled plugin (in-process code handler).',
    version: 'bundled',
    author: 'Platform',
    kind: 'code',
    hooks,
    bundled: true,
    enabled: true,
    installedAt: null,
    config: {},
    configSchema: {},
    logCount: 0,
  };
}

/** The full plugin catalog: bundled + installed, sorted by id. */
export async function listPlugins(): Promise<PluginInfo[]> {
  await initPluginsStorage().catch(() => {});
  const out: PluginInfo[] = [];

  for (const id of listBundledPluginIds()) {
    const info = bundledPluginInfo(getBundledPlugin(id));
    if (info) out.push(info);
  }

  let ids: string[] = [];
  try {
    ids = (await readdir(path.join(pluginsDir(), 'packages'))).filter((e) => !e.startsWith('.'));
  } catch {
    // no packages dir yet
  }
  for (const id of ids.sort()) {
    const manifest = await readInstalledManifest(id);
    if (!manifest) continue;
    const state = await readState(id);
    const logCount = await countLogLines(id);
    out.push({
      id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      author: manifest.author,
      kind: manifest.kind,
      hooks: [...manifest.hooks],
      bundled: false,
      enabled: state?.enabled ?? true,
      installedAt: state?.installedAt ?? null,
      config: maskSecretConfig(manifest, state?.config ?? {}),
      configSchema: manifest.configSchema,
      logCount,
      url: state?.url,
      timeoutMs: state?.timeoutMs,
    });
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getPluginInfo(id: string): Promise<PluginInfo | null> {
  if (isBundledPluginId(id)) return bundledPluginInfo(getBundledPlugin(id));
  const manifest = await readInstalledManifest(id);
  if (!manifest) return null;
  const state = await readState(id);
  return {
    id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    kind: manifest.kind,
    hooks: [...manifest.hooks],
    bundled: false,
    enabled: state?.enabled ?? true,
    installedAt: state?.installedAt ?? null,
    config: maskSecretConfig(manifest, state?.config ?? {}),
    configSchema: manifest.configSchema,
    logCount: await countLogLines(id),
    url: state?.url,
    timeoutMs: state?.timeoutMs,
  };
}

/** Installed + enabled plugins, for the emitter (always returns [] on error). */
export async function listEnabledInstalledPlugins(): Promise<{ id: string; manifest: PluginManifest; config: PluginState }[]> {
  await initPluginsStorage().catch(() => {});
  let ids: string[] = [];
  try {
    ids = (await readdir(path.join(pluginsDir(), 'packages'))).filter((e) => !e.startsWith('.'));
  } catch {
    return [];
  }
  const out: { id: string; manifest: PluginManifest; config: PluginState }[] = [];
  for (const id of ids) {
    const manifest = await readInstalledManifest(id);
    const state = await readState(id);
    if (!manifest || !state || state.enabled === false) continue;
    out.push({ id, manifest, config: state });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Install / update / uninstall
// ---------------------------------------------------------------------------

/**
 * Install a plugin from an uploaded .zip.
 *
 * Flow: extract + validate → parse & validate plugin.json (the install
 * gate — unknown hooks, bad ids, oversized packages, hostile paths all
 * fail here, BEFORE anything is written) → refuse bundled ids → atomic
 * swap of the package dir → state file with a fresh HMAC secret.
 */
export async function installPluginFromZip(buffer: Buffer): Promise<PluginManifest> {
  if (!buffer || buffer.length === 0) throw new Error('Empty plugin package');
  if (buffer.length > MAX_ZIP_BYTES) throw new Error('Plugin package exceeds 5MB');

  const files = normalizeEntryPaths(await extractZipToMap(buffer), 'plugin.json');
  const manifestRaw = files.get('plugin.json');
  if (!manifestRaw) {
    throw new Error('Plugin package must contain a plugin.json at its root');
  }
  let manifest: PluginManifest;
  try {
    manifest = pluginManifestSchema.parse(JSON.parse(manifestRaw.toString('utf8')));
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Invalid plugin.json';
    throw new Error(`Invalid plugin.json: ${msg.replace(/^.*\n/, '')}`);
  }
  if (manifest.kind === 'code') {
    // Uploaded plugins are data-only by design: code cannot run from a zip.
    throw new Error('Uploaded plugins must be kind "webhook". Code plugins are platform-bundled only.');
  }
  if (isBundledPluginId(manifest.id)) {
    throw new Error(`Plugin "${manifest.id}" is a bundled platform plugin and cannot be overwritten by an install`);
  }

  // Extract into a sibling temp dir, then atomically swap.
  const tmp = path.join(pluginsDir(), 'packages', `.install-${manifest.id}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    for (const [name, content] of files) {
      const target = path.join(tmp, name);
      const rel = path.relative(tmp, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Unsafe path in plugin package: "${name}"`);
      }
      if (name === '.bundled' || name.endsWith('/.bundled')) continue;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }

    const finalDir = packageDir(manifest.id);
    const backup = path.join(pluginsDir(), 'packages', `.install-backup-${manifest.id}-${Date.now()}`);
    const hadExisting = fs.existsSync(finalDir);
    if (hadExisting) {
      await rm(backup, { recursive: true, force: true });
      await rename(finalDir, backup);
    }
    try {
      await rename(tmp, finalDir);
    } catch (e) {
      if (hadExisting) await rename(backup, finalDir).catch(() => {});
      throw e;
    }
    if (hadExisting) await rm(backup, { recursive: true, force: true });

    // Fresh state: enabled, empty config, new HMAC secret.
    const state: PluginState = {
      version: 1,
      installedAt: new Date().toISOString(),
      enabled: true,
      config: {},
      secret: cryptoRandomHex(32),
    };
    await writeState(manifest.id, state);
    logger.info(`[plugins] installed "${manifest.id}" v${manifest.version} (hooks: ${manifest.hooks.join(', ') || 'none'})`);
    return manifest;
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

/**
 * Update a plugin's config + enable/disable + webhook URL/timeout.
 * `config` is validated against the manifest's configSchema first.
 */
export async function updatePluginConfig(
  id: string,
  input: { enabled?: boolean; url?: string; timeoutMs?: number; config?: unknown }
): Promise<PluginInfo> {
  if (isBundledPluginId(id)) {
    throw new Error(`Plugin "${id}" is a bundled platform plugin and cannot be configured`);
  }
  const manifest = await readInstalledManifest(id);
  if (!manifest) throw new Error(`Plugin "${id}" is not installed`);
  const state = (await readState(id)) ?? {
    version: 1 as const,
    installedAt: new Date().toISOString(),
    enabled: true,
    config: {},
    secret: cryptoRandomHex(32),
  };

  const config = input.config !== undefined ? validatePluginConfig(manifest, input.config) : state.config;

  let url = state.url;
  if (input.url !== undefined) {
    if (input.url.trim() === '') {
      url = undefined;
    } else {
      if (!isValidWebhookUrl(input.url)) {
        throw new Error('Webhook URL must be http(s) and absolute');
      }
      url = input.url.trim();
    }
  }
  const timeoutMs = input.timeoutMs !== undefined ? Math.min(Math.max(Number(input.timeoutMs) || 5000, 100), 30_000) : state.timeoutMs;

  const next: PluginState = {
    ...state,
    enabled: input.enabled ?? state.enabled,
    config,
    url,
    timeoutMs,
  };
  await writeState(id, next);
  logger.info(`[plugins] updated "${id}" (enabled=${next.enabled}, hooks=${manifest.hooks.join(', ') || 'none'})`);
  return (await getPluginInfo(id))!;
}

/** Uninstall a plugin. Bundled plugins can never be uninstalled; a plugin
 *  that is still enabled must be disabled first (deliberate guard so the
 *  admin can't nuke a plugin that is actively delivering events). */
export async function uninstallPlugin(id: string): Promise<void> {
  if (isBundledPluginId(id)) {
    throw new Error(`Plugin "${id}" is a bundled platform plugin and cannot be uninstalled`);
  }
  if (!fs.existsSync(packageDir(id))) throw new Error(`Plugin "${id}" is not installed`);
  const state = await readState(id);
  if (state?.enabled !== false) {
    throw new Error('Disable the plugin before uninstalling it');
  }
  await rm(packageDir(id), { recursive: true, force: true });
  await rm(statePath(id), { recursive: true, force: true });
  await rm(logPath(id), { recursive: true, force: true });
  logger.info(`[plugins] uninstalled "${id}"`);
}

// ---------------------------------------------------------------------------
// Execution log
// ---------------------------------------------------------------------------

export interface ExecLogLine {
  ts: string;
  event: HookName;
  eventId: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number | null;
}

async function countLogLines(id: string): Promise<number> {
  if (!fs.existsSync(logPath(id))) return 0;
  try {
    return (await readFile(logPath(id), 'utf8')).split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** Append one execution-log line (cap 512KB: oldest lines dropped). */
export async function appendExecLog(id: string, line: Omit<ExecLogLine, 'ts'>): Promise<void> {
  try {
    await mkdir(path.dirname(logPath(id)), { recursive: true });
    const entry = `${JSON.stringify({ ...line, ts: new Date().toISOString() })}\n`;
    const file = logPath(id);
    if (fs.existsSync(file) && (await readFile(file)).length + entry.length > MAX_LOG_BYTES) {
      const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
      const kept = lines.slice(Math.max(0, lines.length - 100));
      await writeFile(file, `${kept.join('\n')}\n`, 'utf8');
    }
    await fs.promises.appendFile(file, entry, 'utf8');
  } catch (err) {
    logger.error(`[plugins] exec log append failed for "${id}": ${(err as Error)?.message}`);
  }
}

/** Read the execution log (newest first). */
export async function readExecLog(id: string): Promise<ExecLogLine[]> {
  if (!fs.existsSync(logPath(id))) return [];
  try {
    const lines = (await readFile(logPath(id), 'utf8')).split('\n').filter(Boolean);
    return lines
      .map((l) => {
        try {
          return JSON.parse(l) as ExecLogLine;
        } catch {
          return null;
        }
      })
      .filter((l): l is ExecLogLine => l !== null)
      .reverse();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Admin "test" button — dispatch a sample payload for the hook the admin
// chooses, using the plugin's current config, and record the attempt.
// ---------------------------------------------------------------------------

export const SAMPLE_PAYLOADS: Record<HookName, unknown> = {
  'order.created': {
    orderId: 'ord_test_0001',
    orderNumber: '1001',
    total: 49.99,
    currency: 'USD',
    status: 'paid',
    paymentMethod: 'card',
    items: [
      { productId: 'prod_1', name: 'Sample T-Shirt', quantity: 1, unitPrice: 49.99 },
    ],
    customer: { email: 'sample@example.com', name: 'Sample Customer' },
  },
  'payment.settled': {
    orderId: 'ord_test_0001',
    orderNumber: '1001',
    amount: 49.99,
    currency: 'USD',
    transactionId: 'txn_test_0001',
    gateway: 'stripe',
  },
  'product.created': {
    productId: 'prod_test_0001',
    slug: 'sample-product',
    name: 'Sample Product',
    price: 19.99,
    currency: 'USD',
    stock: 10,
    status: 'active',
  },
  'product.updated': {
    productId: 'prod_test_0001',
    slug: 'sample-product',
    name: 'Sample Product (updated)',
    price: 24.99,
    currency: 'USD',
    stock: 8,
    status: 'active',
  },
  'customer.registered': {
    customerId: 'cus_test_0001',
    email: 'sample@example.com',
    name: 'Sample Customer',
  },
};

/** Fire one event through the real emit pipeline and record it. */
export async function testPlugin(id: string, event: HookName): Promise<{ ok: boolean; lines: ExecLogLine[] }> {
  if (!KNOWN_HOOKS.includes(event)) throw new Error(`Unknown hook "${event}"`);
  const info = await getPluginInfo(id);
  if (!info) throw new Error(`Plugin "${id}" is not installed`);
  if (!info.hooks.includes(event)) {
    throw new Error(`Plugin "${id}" does not subscribe to "${event}"`);
  }
  const { emit } = await import('./pluginHooks');
  await emit(event, SAMPLE_PAYLOADS[event]);
  return { ok: true, lines: await readExecLog(id) };
}

function cryptoRandomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}
