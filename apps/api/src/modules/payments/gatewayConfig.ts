// ---------------------------------------------------------------------------
// Payment gateway configuration storage.
//
// Credentials live in StoreSettings.paymentGateways as a JSON map:
//   { "<gatewayId>": { enabled, ...credentialFields } }
//
// This module is the ONLY reader/writer of that column. It exposes:
//   - getGatewayConfigs()      full config (admin + order placement)
//   - getEnabledGateways()     secret-free metadata for the checkout/settings
//   - isGatewayConfigured()    does a gateway have its credentials filled?
//   - saveGatewayConfigs()     admin write path
//
// Secrets NEVER leave this module: the public settings endpoint calls only
// getEnabledGateways(), which returns `{ id, label, enabled, country, hint }`
// with no credential values. The admin-only settings route returns the full
// config so the form can be populated and edited.
// ---------------------------------------------------------------------------
import { prisma } from '../../config/database';
import { GATEWAYS, GATEWAY_BY_ID, resolveGatewayId } from './gateways/registry';
import type { GatewayConfig } from './gateways/types';
import { env } from '../../config/environment';

type ConfigMap = Record<string, GatewayConfig>;

export function parseGatewayConfigs(raw: string | null | undefined): ConfigMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ConfigMap;
    }
  } catch {
    // Malformed JSON -> treat as empty (a save will rewrite it).
  }
  return {};
}

async function loadConfigs(): Promise<ConfigMap> {
  const row = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
  return parseGatewayConfigs(row?.paymentGateways);
}

export async function getGatewayConfigs(): Promise<ConfigMap> {
  return loadConfigs();
}

export async function getGatewayConfig(id: string | undefined | null): Promise<GatewayConfig | null> {
  const resolved = resolveGatewayId(id);
  if (!resolved) return null;
  const configs = await loadConfigs();
  return configs[resolved] ?? null;
}

/** True when the gateway is enabled and its required credential fields are filled. */
export async function isGatewayConfigured(id: string | undefined | null): Promise<boolean> {
  const resolved = resolveGatewayId(id);
  if (!resolved) return false;
  const def = GATEWAY_BY_ID[resolved];
  if (!def) return false;

  // Stripe can also be configured via env vars (backward compatible).
  if (resolved === 'stripe') {
    if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) return true;
  }

  const config = await getGatewayConfig(resolved);
  if (!config || config.enabled === false) return false;
  const required = def.fields.filter((f) => f.required && f.type !== 'boolean');
  for (const field of required) {
    const val = config[field.key];
    if (val === undefined || val === null || String(val) === '') return false;
  }
  return true;
}

export interface GatewayPublicInfo {
  id: string;
  name: string;
  label: string;
  country: 'IR' | 'IQ' | 'global';
  /** True when the checkout should offer this gateway. */
  enabled: boolean;
  currencyHint?: string;
  description?: string;
}

/** Secret-free list of gateways, with enabled status, for the checkout + settings. */
export async function getEnabledGateways(): Promise<GatewayPublicInfo[]> {
  const configs = await loadConfigs();
  const out: GatewayPublicInfo[] = [];
  for (const def of GATEWAYS) {
    const cfg = configs[def.id];
    let enabled = false;
    if (def.id === 'stripe' && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
      enabled = true;
    } else if (cfg && cfg.enabled !== false) {
      const required = def.fields.filter((f) => f.required && f.type !== 'boolean');
      enabled = required.every((f) => {
        const v = cfg[f.key];
        return v !== undefined && v !== null && String(v) !== '';
      });
    }
    out.push({
      id: def.id,
      name: def.name,
      label: def.label,
      country: def.country,
      enabled,
      currencyHint: def.currencyHint,
      description: def.description,
    });
  }
  return out;
}

/**
 * Save the full gateway config (admin). Merges the incoming map over the
 * existing config so unlisted gateways are untouched, and only persists keys
 * that are known gateway fields (dropping arbitrary payload keys).
 */
export async function saveGatewayConfigs(
  incoming: Record<string, GatewayConfig>,
): Promise<ConfigMap> {
  const existing = await loadConfigs();
  const next: ConfigMap = { ...existing };

  for (const [rawId, cfg] of Object.entries(incoming)) {
    const id = resolveGatewayId(rawId);
    if (!id || !GATEWAY_BY_ID[id]) continue;
    const def = GATEWAY_BY_ID[id];
    const knownKeys = new Set(def.fields.map((f) => f.key));
    // Always carry `enabled` through; coerce to boolean.
    const clean: GatewayConfig = { enabled: Boolean(cfg && cfg.enabled) };
    if (cfg && typeof cfg === 'object') {
      for (const key of Object.keys(cfg)) {
        if (knownKeys.has(key)) clean[key] = cfg[key];
      }
    }
    next[id] = clean;
  }

  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    update: { paymentGateways: JSON.stringify(next) },
    create: { id: 'default', paymentGateways: JSON.stringify(next) },
  });
  return next;
}

/** Delete a gateway's config (sets it to disabled + empty). */
export async function clearGatewayConfig(id: string): Promise<void> {
  const resolved = resolveGatewayId(id);
  if (!resolved) return;
  const existing = await loadConfigs();
  delete existing[resolved];
  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    update: { paymentGateways: JSON.stringify(existing) },
    create: { id: 'default', paymentGateways: JSON.stringify(existing) },
  });
}
