#!/usr/bin/env node
/**
 * Normalize absolute image URLs stored in the database back to relative paths.
 *
 * WHY: an earlier version of the admin ImageUpload component prepended the API
 * base URL (e.g. http://localhost:3001) before saving. Those rows break the
 * moment the store is deployed to a real domain, or when the API port changes.
 * Image paths must be stored RELATIVE (e.g. /uploads/products/abc/large.webp);
 * getImageUrl() prepends the current API base at render time.
 *
 * Usage:
 *   node scripts/normalize-image-urls.js            # dry run, shows what would change
 *   node scripts/normalize-image-urls.js --apply    # actually write the changes
 *   node scripts/normalize-image-urls.js --apply --host https://old-cdn.example.com
 *
 * Safe to run repeatedly - it is idempotent.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const hostIdx = args.indexOf('--host');
const EXTRA_HOST = hostIdx !== -1 ? args[hostIdx + 1] : null;

// Any localhost/127.0.0.1 origin, plus an optional user-supplied origin.
const PATTERNS = [/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i];
if (EXTRA_HOST) {
  PATTERNS.push(new RegExp('^' + EXTRA_HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/$/, ''), 'i'));
}

/**
 * Strip a known origin, but ONLY when the remainder points at our uploads dir.
 * We must never rewrite genuine external URLs (a CDN, a supplier's image host,
 * or social links), so anything that does not resolve to /uploads is left alone.
 */
function normalize(value) {
  if (!value || typeof value !== 'string') return null;
  for (const re of PATTERNS) {
    if (re.test(value)) {
      const stripped = value.replace(re, '');
      if (stripped.startsWith('/uploads/')) return stripped;
      return null; // absolute, but not one of our uploads - leave untouched
    }
  }
  return null;
}

// model -> image-bearing fields. Deliberately EXCLUDES link fields
// (linkUrl, secondaryUrl, social URLs, downloadUrl) which are legitimately absolute.
const TARGETS = [
  { model: 'productImage', fields: ['url', 'thumbnail', 'medium', 'large', 'zoom'] },
  { model: 'category', fields: ['image'] },
  { model: 'banner', fields: ['image', 'mobileImage'] },
  { model: 'user', fields: ['avatar'] },
];

async function run() {
  console.log(APPLY ? '=== APPLYING CHANGES ===' : '=== DRY RUN (pass --apply to write) ===');
  if (EXTRA_HOST) console.log(`Also stripping origin: ${EXTRA_HOST}`);
  console.log('');

  let grandTotal = 0;

  for (const { model, fields } of TARGETS) {
    const delegate = prisma[model];
    if (!delegate) {
      console.log(`- ${model}: model not found in this schema, skipping`);
      continue;
    }

    const rows = await delegate.findMany();
    let changed = 0;

    for (const row of rows) {
      const patch = {};
      for (const f of fields) {
        const next = normalize(row[f]);
        if (next !== null && next !== row[f]) patch[f] = next;
      }
      if (Object.keys(patch).length === 0) continue;

      changed++;
      grandTotal++;
      for (const [f, v] of Object.entries(patch)) {
        console.log(`  ${model}#${row.id} ${f}:`);
        console.log(`    - ${row[f]}`);
        console.log(`    + ${v}`);
      }
      if (APPLY) {
        await delegate.update({ where: { id: row.id }, data: patch });
      }
    }

    console.log(`- ${model}: ${changed} of ${rows.length} row(s) ${APPLY ? 'updated' : 'would change'}`);
  }

  console.log('');
  if (grandTotal === 0) {
    console.log('✅ No absolute upload URLs found - database is clean.');
  } else if (APPLY) {
    console.log(`✅ Normalized ${grandTotal} row(s).`);
  } else {
    console.log(`⚠️  ${grandTotal} row(s) need fixing. Re-run with --apply.`);
  }
}

run()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
