/**
 * Source-level RTL ratchet for the customer-facing UI.
 *
 * The storefront renders dir="rtl" for Kurdish and Arabic visitors, so
 * spacing and alignment must use the logical properties
 * (marginInlineStart, paddingInlineEnd, insetInlineEnd,
 * text-align: start/end). A physical marginLeft renders on the wrong
 * side in RTL.
 *
 * This complements theme-rtl.test.tsx, which checks the *rendered*
 * output of the theme home sections. This one statically scans every
 * customer-facing source file - so a physical property introduced in a
 * component the theme sections never render (cart, checkout, account,
 * static pages) still fails the build.
 *
 * Scope: components/, themes/, lib/ and app/ EXCEPT app/admin/ (the
 * admin shell is deliberately pinned LTR - see app/admin/layout.tsx)
 * and *.test.* files.
 *
 * Deliberately NOT flagged:
 *   - position anchors (left: / right: / inset) - full-width
 *     `left: 0, right: 0` stretches are direction-neutral, and
 *     single-side anchors are a visual choice reviewed case by case;
 *   - auto-margin centering pairs - still physical in name but
 *     direction-neutral, though new code should prefer
 *     marginInlineStart/End.
 *
 * An exception must be justified in place: put `rtl-ratchet-ok` on the
 * offending line (or the line above it) with a reason, e.g.
 *     // rtl-ratchet-ok: dir-conditional pair, mirrors the trigger glyph
 *     const x = isRtl ? { marginRight: 'auto' } : { marginLeft: 'auto' };
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..');
const SCAN_DIRS = ['components', 'themes', 'lib', 'app'];
const EXCLUDES = ['/admin/', '/test/', '.test.ts', '.test.tsx', '.test.js'];

// Physical spacing/alignment properties, camelCase (JSX style objects).
const CAMEL =
  /\b(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft\w*|borderRight\w*|insetLeft|insetRight)\b/;
// Physical text alignment, camelCase.
const CAMEL_ALIGN = /textAlign\s*:\s*['"](left|right)['"]/;
// Kebab-case equivalents (for <style jsx> blocks and template CSS).
const KEBAB =
  /(?:^|[\s{;])(margin-left|margin-right|padding-left|padding-right|border-left|border-right|inset-left|inset-right)\s*:/;
const KEBAB_ALIGN = /text-align\s*:\s*(left|right)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isExcluded(file: string): boolean {
  const norm = file.split('\\').join('/');
  return EXCLUDES.some((ex) => norm.includes(ex));
}

const violations: string[] = [];

for (const dir of SCAN_DIRS) {
  const root = join(WEB_ROOT, dir);
  for (const file of walk(root)) {
    if (isExcluded(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prev = i > 0 ? lines[i - 1] : '';
      if (line.includes('rtl-ratchet-ok') || prev.includes('rtl-ratchet-ok')) {
        continue;
      }
      if (CAMEL.test(line) || CAMEL_ALIGN.test(line) || KEBAB.test(line) || KEBAB_ALIGN.test(line)) {
        violations.push(`${relative(WEB_ROOT, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
      }
    }
  }
}

describe('RTL physical-property ratchet (customer-facing sources)', () => {
  it('has no physical spacing/alignment CSS outside the LTR-pinned admin', () => {
    expect(violations).toEqual([]);
  });
});
