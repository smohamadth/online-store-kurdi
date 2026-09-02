/**
 * Plugin manifest + config-schema unit tests.
 *
 * Pins the install gate (id/version/hooks/permissions/configSchema) and the
 * config DSL used by the admin form (types, required, default, secret, max).
 */
import { describe, it, expect } from 'vitest';
import {
  pluginManifestSchema,
  validatePluginConfig,
  maskSecretConfig,
  KNOWN_HOOKS,
} from '../../../src/modules/plugins/plugin.schema';

const valid = {
  id: 'slack-alerts',
  name: 'Slack Alerts',
  description: 'Post order events to Slack',
  version: '1.2.3',
  author: 'Acme',
  kind: 'webhook',
  hooks: ['order.created'],
  permissions: ['webhook'],
  configSchema: {},
};

describe('pluginManifestSchema', () => {
  it('accepts a minimal valid manifest', () => {
    const parsed = pluginManifestSchema.parse(valid);
    expect(parsed.id).toBe('slack-alerts');
    expect(parsed.hooks).toEqual(['order.created']);
  });

  it('rejects an uppercase / symbol id', () => {
    for (const bad of ['Bad_id', 'bad id', 'bad_id!', '-lead']) {
      const res = pluginManifestSchema.safeParse({ ...valid, id: bad });
      expect(res.success).toBe(false);
    }
  });

  it('rejects a >40 char id', () => {
    const res = pluginManifestSchema.safeParse({ ...valid, id: 'a'.repeat(41) });
    expect(res.success).toBe(false);
  });

  it('rejects non-semver versions', () => {
    for (const bad of ['1.0', 'latest', 'v1.0.0', 'one.two.three']) {
      const res = pluginManifestSchema.safeParse({ ...valid, version: bad });
      expect(res.success).toBe(false);
    }
  });

  it('accepts semver pre-release and build tags', () => {
    for (const good of ['1.0.0-beta.1', '2.0.0+build42', '1.2.3-rc.1+build.5']) {
      const res = pluginManifestSchema.safeParse({ ...valid, version: good });
      expect(res.success).toBe(true);
    }
  });

  it('rejects unknown hooks (the install gate)', () => {
    const res = pluginManifestSchema.safeParse({ ...valid, hooks: ['order.shipped'] });
    expect(res.success).toBe(false);
  });

  it('accepts every known hook', () => {
    const res = pluginManifestSchema.safeParse({ ...valid, hooks: [...KNOWN_HOOKS] });
    expect(res.success).toBe(true);
  });

  it('rejects unknown permissions', () => {
    const res = pluginManifestSchema.safeParse({ ...valid, permissions: ['filesystem'] });
    expect(res.success).toBe(false);
  });

  it('rejects unknown manifest keys (strict)', () => {
    const res = pluginManifestSchema.safeParse({ ...valid, main: 'evil.js' });
    expect(res.success).toBe(false);
  });

  it('rejects an invalid configSchema field', () => {
    const res = pluginManifestSchema.safeParse({
      ...valid,
      configSchema: { token: { type: 'list' } },
    });
    expect(res.success).toBe(false);
  });
});

describe('validatePluginConfig', () => {
  const manifest = pluginManifestSchema.parse({
    ...valid,
    configSchema: {
      channel: { type: 'string', required: true, max: 32 },
      notify: { type: 'boolean', default: true },
      retries: { type: 'number', max: 10 },
      token: { type: 'string', secret: true },
    },
  });

  it('validates types and strips unknown keys', () => {
    const out = validatePluginConfig(manifest, { channel: '#general', hacked: 'x' });
    expect(out).toEqual({ channel: '#general', notify: true });
  });

  it('applies defaults for missing optional fields', () => {
    const out = validatePluginConfig(manifest, { channel: '#g' });
    expect(out.notify).toBe(true);
  });

  it('enforces required fields', () => {
    expect(() => validatePluginConfig(manifest, {})).toThrow(/channel/);
    expect(() => validatePluginConfig(manifest, { channel: '' })).toThrow(/channel/);
  });

  it('enforces type + max', () => {
    expect(() => validatePluginConfig(manifest, { channel: 42 })).toThrow(/string/);
    const out = validatePluginConfig(manifest, { channel: 'x'.repeat(100) });
    expect(out.channel.length).toBe(32);
    const num = validatePluginConfig(manifest, { channel: '#g', retries: 99 });
    expect(num.retries).toBe(10);
  });

  it('rejects a non-object config', () => {
    expect(() => validatePluginConfig(manifest, 'nope')).toThrow(/object/);
  });
});

describe('maskSecretConfig', () => {
  it('masks secret fields and leaves others intact', () => {
    const manifest = pluginManifestSchema.parse({
      ...valid,
      configSchema: { token: { type: 'string', secret: true }, channel: { type: 'string' } },
    });
    const masked = maskSecretConfig(manifest, { token: 'abc', channel: '#g' });
    expect(masked.token).toBe('••••••••');
    expect(masked.channel).toBe('#g');
  });
});
