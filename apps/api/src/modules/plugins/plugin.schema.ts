// ---------------------------------------------------------------------------
// Plugin manifest + config schema (the contract).
//
// A plugin package ships a `plugin.json` manifest. Installed plugins are
// DATA-ONLY: they declare which store events they care about and how their
// admin config form looks; the platform delivers events as signed webhooks.
// Bundled (in-repo) plugins may additionally register in-process code
// handlers (see pluginHooks.ts / bundledRegistry.ts).
//
// The schema here is the install gate AND the config-save gate, mirroring
// the "one validated contract" policy of the theme system.
// ---------------------------------------------------------------------------
import { z } from 'zod';

/** Events the platform can emit. Adding one = emit at the event + document. */
export const KNOWN_HOOKS = [
  'order.created',
  'payment.settled',
  'product.created',
  'product.updated',
  'customer.registered',
] as const;

export type HookName = (typeof KNOWN_HOOKS)[number];

/** Mapping hook name → bundled code-handler method (PluginHandlers). */
export const HOOK_METHODS = {
  'order.created': 'onOrderCreated',
  'payment.settled': 'onPaymentSettled',
  'product.created': 'onProductCreated',
  'product.updated': 'onProductUpdated',
  'customer.registered': 'onCustomerRegistered',
} as const satisfies Record<HookName, string>;

/** The handler method names a bundled code plugin may implement. */
export type HookMethod = (typeof HOOK_METHODS)[HookName];

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/;

/**
 * The tiny config DSL. `secret: true` fields are masked in API responses;
 * `default` seeds the admin form; `required` is enforced on save.
 */
const configFieldSchema = z
  .object({
    type: z.enum(['string', 'boolean', 'number']),
    label: z.string().max(80).optional(),
    required: z.boolean().optional(),
    default: z.union([z.string(), z.boolean(), z.number()]).optional(),
    secret: z.boolean().optional(),
    max: z.number().int().positive().optional(),
  })
  .strict();

export const pluginManifestSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(40)
      .regex(ID_RE, 'Plugin id must be lowercase a-z, 0-9 or "-", starting with a letter or digit'),
    name: z.string().min(1, 'Plugin name is required').max(80),
    description: z.string().min(1, 'Plugin description is required').max(500),
    version: z.string().regex(SEMVER_RE, 'Plugin version must be semver (e.g. 1.0.0)'),
    author: z.string().min(1, 'Plugin author is required').max(120),
    kind: z.enum(['webhook', 'code']),
    hooks: z.array(z.enum(KNOWN_HOOKS)).max(20).default([]),
    permissions: z.array(z.enum(['webhook'])).max(5).default(['webhook']),
    configSchema: z.record(z.string().max(60), configFieldSchema).default({}),
  })
  .strict();

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export type ConfigField = z.infer<typeof configFieldSchema>;

/**
 * Validate a raw config object against a manifest's configSchema.
 * Unknown keys are stripped; required fields must be present; types and
 * `max` are enforced. Returns the cleaned config (never throws for
 * shape reasons — throws a readable Error on violations).
 */
export function validatePluginConfig(manifest: PluginManifest, raw: unknown): Record<string, string | boolean | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Plugin config must be an object');
  }
  const out: Record<string, string | boolean | number> = {};
  const input = raw as Record<string, unknown>;

  for (const [field, spec] of Object.entries(manifest.configSchema ?? {})) {
    const value = input[field];
    if (value === undefined || value === null || value === '') {
      if (spec.required) throw new Error(`Config field "${field}" is required`);
      if (spec.default !== undefined) out[field] = spec.default;
      continue;
    }
    if (spec.type === 'string') {
      if (typeof value !== 'string') throw new Error(`Config field "${field}" must be a string`);
      const capped = spec.max ? value.slice(0, spec.max) : value;
      out[field] = capped;
    } else if (spec.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`Config field "${field}" must be a boolean`);
      out[field] = value;
    } else {
      if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`Config field "${field}" must be a number`);
      out[field] = spec.max !== undefined ? Math.min(value, spec.max) : value;
    }
  }
  return out;
}

/** Placeholder used in API responses in place of a secret config value. */
export const SECRET_MASK = '••••••••';

/** Mask secret config fields for API responses. */
export function maskSecretConfig(manifest: PluginManifest, config: Record<string, string | boolean | number>): Record<string, string | boolean | number> {
  const out = { ...config };
  for (const [field, spec] of Object.entries(manifest.configSchema ?? {})) {
    if (spec.secret && out[field] !== undefined) out[field] = SECRET_MASK;
  }
  return out;
}
