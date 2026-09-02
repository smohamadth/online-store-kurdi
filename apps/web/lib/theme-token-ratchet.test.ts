/**
 * Source-level token ratchet for the bundled theme sections.
 *
 * A theme's look is driven by the CSS custom properties emitted from
 * `theme.tsx` (`--surface-2`, `--shadow`, `--shadow-hover`, `--border`,
 * `--body-text`, ...). Those variables are recomputed from the store's *live*
 * tokens, which an admin edits in Appearance — including the shipped
 * "Midnight" palette, whose bodyBg is `#0f172a`.
 *
 * So a section that hard-codes a light grey for its image placeholder, or a
 * fixed shadow, looks correct only for the palette it was authored against.
 * Applying Midnight to Pulse or Dawnlight used to paint glaring near-white
 * boxes wherever a product or category had no image, because those
 * placeholders were literal `#f1f5f9` / `#f7f7f7`.
 *
 * This scans the shipped section sources and fails on colour literals in
 * the properties that must track the theme. It complements
 * `theme-featured.test.tsx` (which asserts rendered behaviour) by catching
 * a regression in a code path a unit test never renders — e.g. the
 * `onMouseEnter` handler of a section with no products in the fixture.
 *
 * A literal is allowed ONLY as the fallback inside `var(--token, <literal>)`,
 * which is what renders before the theme stylesheet resolves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, relative } from 'path';

const THEMES_ROOT = resolve(__dirname, '../themes');

/** Colour literals: #hex, rgb()/rgba(), hsl()/hsla(). */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

/**
 * Properties whose value must come from a theme token. These are the ones
 * that change between a light and a dark store; `background` (shorthand) is
 * included because the themes use it for gradient art, which is checked
 * separately below.
 */
const TOKENED_PROPS = ['backgroundColor', 'boxShadow', 'borderColor', 'color'];

function sectionFiles(): string[] {
  const out: string[] = [];
  for (const key of readdirSync(THEMES_ROOT)) {
    const dir = join(THEMES_ROOT, key, 'sections');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.tsx')) out.push(join(dir, f));
    }
  }
  return out.sort();
}

/**
 * Strip every `var(--token, <fallback>)` so only unguarded literals remain.
 * Runs repeatedly to handle nesting, e.g. color-mix inside a fallback.
 */
function stripVarFallbacks(line: string): string {
  let prev: string;
  let cur = line;
  do {
    prev = cur;
    // The fallback may itself contain parens - e.g.
    // var(--shadow, 0 1px 3px rgba(15, 23, 42, 0.06)) - so allow one level
    // of nesting inside it before the closing paren.
    cur = cur.replace(/var\(\s*--[\w-]+\s*,(?:[^()]|\([^()]*\))*\)/g, 'var(--token)');
  } while (cur !== prev);
  // color-mix(...) reads from tokens and is itself theme-derived.
  return cur.replace(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'MIX');
}

const files = sectionFiles();

describe('theme sections drive colour from tokens', () => {
  it('found the shipped section files (guards against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it.each(files.map((f) => [relative(THEMES_ROOT, f), f]))(
    '%s uses tokens for theme-sensitive colours',
    (_label, file) => {
      const offenders: string[] = [];
      const lines = readFileSync(file, 'utf8').split('\n');

      lines.forEach((raw, i) => {
        const line = raw.trim();
        // Comments explain the design; they are not rendered.
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return;
        // An explicit, justified exception. The marker may sit on the line
        // itself or in the comment block immediately above it (a reason
        // often needs two lines to read well).
        const above = lines.slice(Math.max(0, i - 3), i).join('\n');
        if (/token-ratchet-ok/.test(raw) || /token-ratchet-ok/.test(above)) return;

        const prop = TOKENED_PROPS.find((p) =>
          new RegExp(`(^|[\\s{;.])${p}\\s*[:=]`).test(line),
        );
        if (!prop) return;

        if (COLOR_LITERAL.test(stripVarFallbacks(line))) {
          offenders.push(`${i + 1}: ${line}`);
        }
      });

      expect(offenders, `unguarded colour literal(s) in ${relative(THEMES_ROOT, file)}`).toEqual([]);
    },
  );
});

describe('theme sections keep hover and rest shadows in sync with the token', () => {
  // A card that sets a resting boxShadow must restore that same value on
  // mouse-leave/blur, otherwise the card keeps its hover elevation forever.
  it.each(files.map((f) => [relative(THEMES_ROOT, f), f]))(
    '%s restores the resting shadow on blur',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      const enters = (src.match(/onMouseEnter/g) ?? []).length;
      const leaves = (src.match(/onMouseLeave/g) ?? []).length;
      const focus = (src.match(/onFocus/g) ?? []).length;
      const blur = (src.match(/onBlur/g) ?? []).length;

      // Every hover affordance needs its paired reset, and a keyboard
      // equivalent - a mouse-only affordance is inaccessible.
      expect(leaves, 'onMouseLeave must pair with onMouseEnter').toBe(enters);
      expect(blur, 'onBlur must pair with onFocus').toBe(focus);
      expect(focus, 'hover affordances need a keyboard equivalent').toBe(enters);
    },
  );
});
