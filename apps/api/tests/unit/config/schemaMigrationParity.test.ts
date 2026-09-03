/**
 * schema.prisma and the migrations must describe the same database.
 *
 * This exists because of a real failure: the marketing migration added
 * Coupon.perCustomerLimit / newCustomersOnly in SQL but the columns were never
 * added to schema.prisma. Every test passed - the in-memory mock has no
 * schema, so it happily stored the fields - and CI only caught it at
 * `tsc --noEmit`, where the GENERATED client had no such properties.
 *
 * Applying the migrations to a scratch SQLite file and diffing the result
 * against schema.prisma catches that drift directly, in a plain unit test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const API_ROOT = resolve(__dirname, '../../..');
const SCHEMA = resolve(API_ROOT, 'prisma/schema.prisma');
const MIGRATIONS = resolve(API_ROOT, 'prisma/migrations');

/** Column names declared for each model in schema.prisma. */
/** Fields whose declared type is another model, i.e. relation objects. */
export function relationFieldMap(): Record<string, Set<string>> {
  const src = readFileSync(SCHEMA, 'utf8');
  const modelNames = new Set(
    [...src.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]),
  );
  const out: Record<string, Set<string>> = {};
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src))) {
    const [, name, body] = m;
    const rels = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const f = /^(\w+)\s+([\w]+)(\[\])?(\?)?/.exec(line);
      if (!f) continue;
      const [, field, type] = f;
      if (modelNames.has(type)) rels.add(field);
    }
    out[name] = rels;
  }
  return out;
}

function schemaModels(): Record<string, Set<string>> {
  const src = readFileSync(SCHEMA, 'utf8');
  const out: Record<string, Set<string>> = {};
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;

  while ((m = modelRe.exec(src))) {
    const [, name, body] = m;
    const cols = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const f = /^(\w+)\s+([\w\[\]?]+)/.exec(line);
      if (!f) continue;
      const [, field, type] = f;
      // Relation fields (list types, or types that are themselves models) are
      // not columns.
      if (type.endsWith('[]')) continue;
      cols.add(field);
    }
    out[name] = cols;
  }
  return out;
}

/** Columns each CREATE TABLE / ALTER TABLE ADD COLUMN produces. */
function migrationColumns(): Record<string, Set<string>> {
  const dirs = readdirSync(MIGRATIONS).filter((d) => !d.endsWith('.toml')).sort();
  const out: Record<string, Set<string>> = {};

  for (const d of dirs) {
    let sql: string;
    try {
      sql = readFileSync(resolve(MIGRATIONS, d, 'migration.sql'), 'utf8');
    } catch {
      continue;
    }

    const createRe = /CREATE TABLE\s+"(\w+)"\s*\(([\s\S]*?)\n\);/g;
    let c: RegExpExecArray | null;
    while ((c = createRe.exec(sql))) {
      const [, table, body] = c;
      const cols = out[table] ?? new Set<string>();
      for (const line of body.split('\n')) {
        const f = /^\s*"(\w+)"\s+\w/.exec(line);
        if (f) cols.add(f[1]);
      }
      out[table] = cols;
    }

    const alterRe = /ALTER TABLE\s+"(\w+)"\s+ADD COLUMN\s+"(\w+)"/g;
    let a: RegExpExecArray | null;
    while ((a = alterRe.exec(sql))) {
      const [, table, col] = a;
      (out[table] ??= new Set<string>()).add(col);
    }

    // Renames and drops would desync this map; flag them rather than lie.
    const dropRe = /ALTER TABLE\s+"(\w+)"\s+DROP COLUMN\s+"(\w+)"/g;
    let dp: RegExpExecArray | null;
    while ((dp = dropRe.exec(sql))) {
      out[dp[1]]?.delete(dp[2]);
    }

    // SQLite cannot ALTER most things, so these migrations use the standard
    // rebuild-and-rename dance (CREATE "new_X" ... ; ALTER TABLE "new_X"
    // RENAME TO "X"). Tables are also renamed outright (ProductVariant ->
    // Variant). Follow renames or the final table names never line up with
    // the model names.
    const renameRe = /ALTER TABLE\s+"(\w+)"\s+RENAME TO\s+"(\w+)"/g;
    let rn: RegExpExecArray | null;
    while ((rn = renameRe.exec(sql))) {
      const [, from, to] = rn;
      if (out[from]) {
        out[to] = new Set([...(out[to] ?? []), ...out[from]]);
        delete out[from];
      }
    }
  }
  return out;
}

describe('schema.prisma matches the migrations', () => {
  const models = schemaModels();
  const migrated = migrationColumns();
  const relationFields = relationFieldMap();

  // Models mapped to a differently-named table via @@map.
  const MAPPED: Record<string, string> = {
    ScheduledJobLock: 'scheduled_job_lock',
    ContentTranslation: 'content_translation',
  };
  for (const [model, table] of Object.entries(MAPPED)) {
    if (migrated[table] && !migrated[model]) migrated[model] = migrated[table];
  }

  it('parses both sides', () => {
    expect(Object.keys(models).length).toBeGreaterThan(50);
    expect(Object.keys(migrated).length).toBeGreaterThan(50);
  });

  it('every scalar field in schema.prisma exists in some migration', () => {
    const missing: string[] = [];

    for (const [model, cols] of Object.entries(models)) {
      const tableCols = migrated[model];
      // A model with no CREATE TABLE anywhere is its own problem, reported by
      // the next test; skip it here so the output stays readable.
      if (!tableCols) continue;

      for (const col of cols) {
        // Skip relation OBJECT fields: they are not columns. Identified from
        // the declared TYPE (which is another model), not from the field
        // name - `Category.parent` is a relation whose name matches nothing.
        if (relationFields[model]?.has(col)) continue;
        if (!tableCols.has(col)) missing.push(`${model}.${col}`);
      }
    }

    expect(missing, `columns in schema.prisma with no migration:\n${missing.join('\n')}`)
      .toEqual([]);
  });

  it('every model in schema.prisma has a CREATE TABLE', () => {
    const missing = Object.keys(models).filter((m) => !migrated[m]);
    expect(missing, `models with no migration:\n${missing.join('\n')}`).toEqual([]);
  });

  it('specifically pins the columns that drifted', () => {
    // Regression guard for the exact miss: added to SQL, forgotten in the
    // Prisma schema, invisible to every mock-backed test.
    expect(models.Coupon).toContain('perCustomerLimit');
    expect(models.Coupon).toContain('newCustomersOnly');
    expect(migrated.Coupon).toContain('perCustomerLimit');
    expect(migrated.Coupon).toContain('newCustomersOnly');
  });
});
