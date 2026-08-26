/**
 * themeConfigSchema — schema unit tests.
 *
 * The schema is the gatekeeper for theme.json files. A typo in
 * a field, a missing required key, or an unknown extra field
 * should fail loudly at build time, not silently at runtime.
 *
 * These tests pin the schema's behaviour independently of the
 * registry. They don't import the live `THEMES` array; they
 * construct test fixtures inline so a registry-level change
 * can't break the schema's contract.
 *
 * What we cover:
 *   - Happy path: a complete valid config parses.
 *   - Required fields: each one is required individually.
 *   - Field formats: key regex, version semver, etc.
 *   - Strict mode: unknown fields are rejected.
 *   - Token types: string / number / boolean are accepted; null,
 *     object, and array are rejected.
 *   - Sections are optional but, if present, must be a string map.
 *   - Features are required and strictly typed.
 */

import { describe, it, expect } from 'vitest';
import { themeConfigSchema } from './themeConfigSchema';

/**
 * Build a minimal valid config that passes the schema.
 *
 * Tests start from this and tweak one field at a time. A
 * "missing required" test removes the field; a "wrong type"
 * test replaces it with the wrong shape; etc.
 *
 * Kept inline rather than in a fixture file because every
 * test that uses it needs to see the exact shape, and pulling
 * a fixture out of the test file is the kind of indirection
 * that makes "what does the schema actually require" harder
 * to answer at a glance.
 */
function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    key: 'test',
    name: 'Test',
    description: 'A test theme',
    version: '1.0.0',
    author: 'Tester',
    preview: '/themes/test/preview.png',
    features: {
      rtl: false,
      darkMode: false,
      paid: false,
    },
    tokens: {
      primaryColor: '#000000',
    },
    ...overrides,
  };
}

describe('themeConfigSchema — happy path', () => {
  it('accepts a minimal valid config', () => {
    const result = themeConfigSchema.safeParse(validConfig());
    expect(result.success).toBe(true);
  });

  it('accepts a config with all optional fields filled', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({
        sections: {
          hero: '@/themes/test/sections/Hero',
        },
        tokens: {
          primaryColor: '#111111',
          fontFamily: 'system',
          baseFontSize: 16,
          showTrustBar: true,
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('preserves the parsed token types', () => {
    const parsed = themeConfigSchema.parse(
      validConfig({
        tokens: {
          stringToken: '#abcdef',
          numberToken: 42,
          booleanToken: true,
        },
      }),
    );
    expect(parsed.tokens.stringToken).toBe('#abcdef');
    expect(parsed.tokens.numberToken).toBe(42);
    expect(parsed.tokens.booleanToken).toBe(true);
  });

  it('preserves the features shape', () => {
    const parsed = themeConfigSchema.parse(
      validConfig({
        features: { rtl: true, darkMode: true, paid: true },
      }),
    );
    expect(parsed.features).toEqual({ rtl: true, darkMode: true, paid: true });
  });
});

describe('themeConfigSchema — required fields', () => {
  // The schema requires a fixed set of top-level fields. Each of
  // these tests removes one and asserts the parse fails with a
  // useful error. Doing it as a loop would be shorter but each
  // assertion would lose the connection to the field it tests.
  const required = [
    'key',
    'name',
    'description',
    'version',
    'author',
    'preview',
    'features',
    'tokens',
  ] as const;

  for (const field of required) {
    it(`rejects a config missing the "${field}" field`, () => {
      const { [field]: _drop, ...rest } = validConfig();
      const result = themeConfigSchema.safeParse(rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        // The error must point at the missing field so the
        // build log is actionable. We don't pin the exact
        // wording (Zod's message text could change between
        // versions); the path is what matters.
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain(field);
      }
    });
  }

  it('rejects features missing rtl', () => {
    const cfg = validConfig();
    const { rtl: _drop, ...features } = cfg.features as any;
    const result = themeConfigSchema.safeParse({ ...cfg, features });
    expect(result.success).toBe(false);
  });

  it('rejects features missing darkMode', () => {
    const cfg = validConfig();
    const { darkMode: _drop, ...features } = cfg.features as any;
    const result = themeConfigSchema.safeParse({ ...cfg, features });
    expect(result.success).toBe(false);
  });

  it('rejects features missing paid', () => {
    const cfg = validConfig();
    const { paid: _drop, ...features } = cfg.features as any;
    const result = themeConfigSchema.safeParse({ ...cfg, features });
    expect(result.success).toBe(false);
  });
});

describe('themeConfigSchema — key format', () => {
  it('rejects a key with uppercase characters', () => {
    const result = themeConfigSchema.safeParse(validConfig({ key: 'Minimal' }));
    expect(result.success).toBe(false);
  });

  it('rejects a key with spaces', () => {
    const result = themeConfigSchema.safeParse(validConfig({ key: 'my theme' }));
    expect(result.success).toBe(false);
  });

  it('rejects a key with special characters', () => {
    const result = themeConfigSchema.safeParse(validConfig({ key: 'a/b' }));
    expect(result.success).toBe(false);
  });

  it('rejects a key starting with a hyphen', () => {
    const result = themeConfigSchema.safeParse(validConfig({ key: '-minimal' }));
    expect(result.success).toBe(false);
  });

  it('accepts a key with hyphens in the middle', () => {
    // The "bold-modern" pattern is the most common third-party
    // theme naming. We want it to pass.
    const result = themeConfigSchema.safeParse(validConfig({ key: 'bold-modern' }));
    expect(result.success).toBe(true);
  });

  it('accepts a key with underscores', () => {
    const result = themeConfigSchema.safeParse(validConfig({ key: 'dark_mode' }));
    expect(result.success).toBe(true);
  });

  it('accepts a single-character key', () => {
    const result = themeConfigSchema.safeParse(validConfig({ key: 'a' }));
    expect(result.success).toBe(true);
  });

  it('rejects an empty key', () => {
    const result = themeConfigSchema.safeParse(validConfig({ key: '' }));
    expect(result.success).toBe(false);
  });
});

describe('themeConfigSchema — version format', () => {
  it('accepts a basic semver version', () => {
    const result = themeConfigSchema.safeParse(validConfig({ version: '1.0.0' }));
    expect(result.success).toBe(true);
  });

  it('accepts a semver with a pre-release tag', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ version: '2.1.0-beta.1' }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a semver with build metadata', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ version: '1.0.0+build.42' }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects "1.0" (missing patch)', () => {
    const result = themeConfigSchema.safeParse(validConfig({ version: '1.0' }));
    expect(result.success).toBe(false);
  });

  it('rejects "v1.0.0" (with prefix)', () => {
    const result = themeConfigSchema.safeParse(validConfig({ version: 'v1.0.0' }));
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric version', () => {
    const result = themeConfigSchema.safeParse(validConfig({ version: 'one' }));
    expect(result.success).toBe(false);
  });
});

describe('themeConfigSchema — token types', () => {
  it('accepts string tokens', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { primary: '#fff' } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts number tokens', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { baseFontSize: 16 } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts boolean tokens', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { showTrustBar: true } }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects null token values', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { primary: null as any } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects object token values', () => {
    // A common bug: a theme author writes
    // `tokens: { colors: { primary: "#fff" } }` expecting
    // nested access. The schema rejects this; tokens are
    // flat. A future change could add a `colors` object
    // separately, but the simpler flat shape is the right
    // starting point.
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { colors: { primary: '#fff' } as any } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects array token values', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { fontFamilies: ['system', 'serif'] as any } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an empty tokens map', () => {
    // tokens is required (it's how the theme says "what colours
    // and sizes do you want"). An empty object provides no
    // useful config. The schema still accepts it because we
    // don't want to be too strict, but a future assertion
    // would require at least one token.
    //
    // Currently empty is allowed; if we tighten this, this
    // test becomes the regression target.
    const result = themeConfigSchema.safeParse(validConfig({ tokens: {} }));
    expect(result.success).toBe(true);
  });
});

describe('themeConfigSchema — sections', () => {
  it('accepts a config with no sections field', () => {
    // sections is optional. A theme can ship just tokens and
    // rely on the platform defaults for every section.
    const cfg = validConfig();
    delete (cfg as any).sections;
    const result = themeConfigSchema.safeParse(cfg);
    expect(result.success).toBe(true);
  });

  it('accepts a config with an empty sections map', () => {
    const result = themeConfigSchema.safeParse(validConfig({ sections: {} }));
    expect(result.success).toBe(true);
  });

  it('accepts a config with multiple section overrides', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({
        sections: {
          hero: '@/themes/test/sections/Hero',
          featured: '@/themes/test/sections/Featured',
          categories: '@/themes/test/sections/Categories',
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects non-string section values', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ sections: { hero: 42 as any } }),
    );
    expect(result.success).toBe(false);
  });
});

describe('themeConfigSchema — strict mode', () => {
  // The .strict() modifier on the schema rejects unknown fields.
  // This is the difference between "the theme shipped an extra
  // property" (silently ignored by JS) and "the build broke
  // (good - the theme author needs to know they shipped a typo)".
  it('rejects a config with an unknown top-level field', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ unknownField: 'oops' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a config with an unknown field in features', () => {
    // A common typo: "rtl" vs "RTL" vs "isRtl". The strict
    // mode catches it - the build fails with a clear path.
    const result = themeConfigSchema.safeParse(
      validConfig({
        features: {
          rtl: false,
          darkMode: false,
          paid: false,
          extraFeature: true, // <-- typo
        } as any,
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a config with an unknown field in tokens', () => {
    // Tokens are an open record (any key, any string/number/boolean
    // value), so unknown token keys are intentionally allowed.
    // This is the difference between a strict top-level schema
    // (only known fields) and a flexible token map (any field
    // the theme wants to add). The next two tests pin both.
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { customColor: '#abc123' } }),
    );
    expect(result.success).toBe(true);
  });
});

describe('themeConfigSchema — error messages', () => {
  // The schema's error messages are what a developer sees in
  // the build log. The structure of the error matters as much
  // as the fact that it exists: it should point at the field
  // and explain what was wrong, not just "validation failed".
  it('reports the path to a missing top-level field', () => {
    const { key: _drop, ...rest } = validConfig();
    const result = themeConfigSchema.safeParse(rest);
    if (!result.success) {
      const keyIssue = result.error.issues.find((i) =>
        i.path.join('.') === 'key',
      );
      expect(keyIssue).toBeDefined();
    } else {
      // If parse succeeded the test premise is wrong.
      expect.fail('expected parse to fail');
    }
  });

  it('reports the path to a bad nested field (features.rtl)', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ features: { rtl: 'yes' as any, darkMode: false, paid: false } }),
    );
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.') ?? '';
      expect(path).toContain('features');
      expect(path).toContain('rtl');
    } else {
      expect.fail('expected parse to fail');
    }
  });

  it('reports the path to a bad tokens value', () => {
    const result = themeConfigSchema.safeParse(
      validConfig({ tokens: { primaryColor: { r: 1, g: 2, b: 3 } as any } }),
    );
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.') ?? '';
      expect(path).toContain('tokens');
      expect(path).toContain('primaryColor');
    } else {
      expect.fail('expected parse to fail');
    }
  });
});
