"""Generate a PostgreSQL baseline migration from schema.prisma.

Why a baseline rather than porting the history:

The committed history is 24 SQLite migrations (~1,900 lines) including the
SQLite table-rebuild dance (PRAGMA foreign_keys=OFF; CREATE new_X; INSERT
SELECT; DROP; RENAME) and a backfill using randomblob(), which has no
PostgreSQL equivalent. Hand-porting all of that is a large error-prone
transcription job whose only product is a database identical to what one
CREATE TABLE per model produces.

The three migrations containing INSERT/UPDATE were checked: two are
rebuild-copies and one backfills rows that predate it. All three are no-ops
against a fresh database, so a baseline loses nothing.

Normally `prisma migrate dev` writes this. It cannot run in every environment
(it needs the downloadable query engine and a live database), so this emits
the same DDL deterministically from the schema. It is checked against the
schema by tests/unit/config/postgresBaseline.test.ts.

Usage:
    python3 scripts/generate-postgres-baseline.py            # print
    python3 scripts/generate-postgres-baseline.py --write    # write migration
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA = os.path.join(ROOT, "apps/api/prisma/schema.prisma")

# Prisma scalar -> PostgreSQL column type, matching what `prisma migrate` emits.
SCALARS = {
    "String": "TEXT",
    "Int": "INTEGER",
    "Float": "DOUBLE PRECISION",
    "Boolean": "BOOLEAN",
    "DateTime": "TIMESTAMP(3)",
    "Json": "JSONB",
    "Decimal": "DECIMAL(65,30)",
    "BigInt": "BIGINT",
    "Bytes": "BYTEA",
}


def read_schema():
    with open(SCHEMA, encoding="utf-8") as fh:
        return fh.read()


def parse_models(src):
    """Return {model: {'block': str, 'table': str}} preserving file order.

    `table` honours @@map: two models in this schema map to snake_case table
    names, and emitting the model name instead would create tables the
    generated Prisma client never queries.
    """
    models = {}
    for m in re.finditer(r"^model\s+(\w+)\s*\{([\s\S]*?)^\}", src, re.M):
        name, block = m.group(1), m.group(2)
        mapped = re.search(r'@@map\("([^"]+)"\)', block)
        models[name] = {"block": block, "table": mapped.group(1) if mapped else name}
    return models


def split_attrs(line):
    """Separate `name Type` from its trailing @attributes.

    Strips a trailing `//` comment first: many fields are documented inline
    (`type String // percentage, fixed`), and anchoring the field regex on
    end-of-line silently dropped every one of them.
    """
    c = line.find("//")
    if c != -1:
        line = line[:c]
    idx = line.find("@")
    return (line[:idx] if idx != -1 else line).strip(), (line[idx:] if idx != -1 else "")


def parse_fields(block, model_names):
    """Parse one model body into column and relation descriptors."""
    cols, rels, uniques, indexes, pk = [], [], [], [], None

    for raw in block.split("\n"):
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        # An inline comment must not reach the @@index/@@unique matchers either.
        if "//" in line and not line.startswith("@@"):
            pass  # handled by split_attrs below

        if line.startswith("@@"):
            u = re.match(r"@@unique\(\[([^\]]+)\]", line)
            if u:
                uniques.append([c.strip() for c in u.group(1).split(",")])
            i = re.match(r"@@index\(\[([^\]]+)\]", line)
            if i:
                indexes.append([c.strip() for c in i.group(1).split(",")])
            continue

        head, attrs = split_attrs(line)
        m = re.match(r"^(\w+)\s+([\w\[\]?]+)$", head)
        if not m:
            continue
        name, rawtype = m.group(1), m.group(2)

        is_list = rawtype.endswith("[]")
        optional = rawtype.endswith("?")
        base = rawtype.rstrip("?").rstrip("[]")

        # A field typed as another model is a relation, not a column.
        if base in model_names:
            rel = re.search(r'@relation\((?:"[^"]*",\s*)?fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]', attrs)
            if rel and not is_list:
                on_delete = "CASCADE"
                od = re.search(r"onDelete:\s*(\w+)", attrs)
                if od:
                    on_delete = {
                        "Cascade": "CASCADE", "SetNull": "SET NULL",
                        "Restrict": "RESTRICT", "NoAction": "NO ACTION",
                    }.get(od.group(1), "CASCADE")
                rels.append({
                    "target": base,
                    "fields": [f.strip() for f in rel.group(1).split(",")],
                    "references": [r.strip() for r in rel.group(2).split(",")],
                    "onDelete": on_delete,
                })
            continue

        if is_list or base not in SCALARS:
            continue

        col = {
            "name": name,
            "type": SCALARS[base],
            "optional": optional,
            "default": None,
            "unique": "@unique" in attrs,
        }

        if "@id" in attrs:
            pk = name

        # `[^)]*` stops at the inner paren of uuid()/now()/autoincrement(),
        # yielding "uuid(" - match balanced content instead.
        d = re.search(r"@default\((\w+\(\)|[^)]*)\)", attrs)
        if d:
            v = d.group(1).strip()
            if v in ("uuid()", "cuid()"):
                col["default"] = None            # generated in application code
            elif v == "now()":
                col["default"] = "CURRENT_TIMESTAMP"
            elif v == "autoincrement()":
                col["type"] = "SERIAL"
            elif v in ("true", "false"):
                col["default"] = v
            elif v.startswith('"'):
                col["default"] = "'" + v.strip('"').replace("'", "''") + "'"
            else:
                col["default"] = v

        cols.append(col)

    return cols, rels, uniques, indexes, pk


def emit(models):
    out = [
        "-- PostgreSQL baseline for the store schema.",
        "--",
        "-- Generated from prisma/schema.prisma by",
        "-- scripts/generate-postgres-baseline.py, which exists because the",
        "-- committed history is SQLite-only: it uses the PRAGMA table-rebuild",
        "-- pattern and a randomblob() backfill, neither of which ports. The",
        "-- three migrations carrying INSERT/UPDATE were checked and are all",
        "-- no-ops against a fresh database, so nothing is lost by baselining.",
        "--",
        "-- Regenerate with:  python3 scripts/generate-postgres-baseline.py --write",
        "",
    ]

    names = set(models)

    # Tables first, then every FK, so declaration order cannot matter.
    all_rels = []
    for model, data in models.items():
        table = data["table"]
        cols, rels, uniques, indexes, pk = parse_fields(data["block"], names)
        all_rels.append((table, rels))

        out.append(f'-- {model}' + (f' (table "{table}")' if table != model else ''))
        out.append(f'CREATE TABLE "{table}" (')
        parts = []
        for c in cols:
            seg = f'    "{c["name"]}" {c["type"]}'
            if not c["optional"]:
                seg += " NOT NULL"
            if c["default"] is not None:
                seg += f' DEFAULT {c["default"]}'
            parts.append(seg)
        if pk:
            parts.append(f'    CONSTRAINT "{table}_pkey" PRIMARY KEY ("{pk}")')
        out.append(",\n".join(parts))
        out.append(");")

        for c in cols:
            if c["unique"] and c["name"] != pk:
                out.append(
                    f'CREATE UNIQUE INDEX "{table}_{c["name"]}_key" ON "{table}"("{c["name"]}");'
                )
        for cols_ in uniques:
            cn = "_".join(cols_)
            quoted = ", ".join(f'"{c}"' for c in cols_)
            out.append(f'CREATE UNIQUE INDEX "{table}_{cn}_key" ON "{table}"({quoted});')
        for cols_ in indexes:
            cn = "_".join(cols_)
            quoted = ", ".join(f'"{c}"' for c in cols_)
            out.append(f'CREATE INDEX "{table}_{cn}_idx" ON "{table}"({quoted});')
        out.append("")

    out.append("-- Foreign keys (added after every table exists).")
    table_of = {m: d["table"] for m, d in models.items()}
    for model, rels in all_rels:
        for r in rels:
            fk = "_".join(r["fields"])
            f_cols = ", ".join(f'"{c}"' for c in r["fields"])
            r_cols = ", ".join(f'"{c}"' for c in r["references"])
            out.append(
                f'ALTER TABLE "{model}" ADD CONSTRAINT "{model}_{fk}_fkey" '
                f'FOREIGN KEY ({f_cols}) REFERENCES "{table_of.get(r["target"], r["target"])}"({r_cols}) '
                f'ON DELETE {r["onDelete"]} ON UPDATE CASCADE;'
            )

    return "\n".join(out) + "\n"


def main():
    src = read_schema()
    models = parse_models(src)
    sql = emit(models)

    if "--write" in sys.argv:
        # Also emit the PostgreSQL schema variant, so the schema and the
        # baseline can never be regenerated independently of each other.
        pg_schema = src.replace('provider = "sqlite"', 'provider = "postgresql"', 1)
        pg_schema = pg_schema.replace(
            '  // To move to PostgreSQL: change provider to "postgresql", set DATABASE_URL,\n'
            '  // then re-run `prisma migrate dev` to regenerate the migrations for PG.\n', '')
        header = (
            "// PostgreSQL variant of schema.prisma.\n"
            "//\n"
            "// GENERATED - do not edit. Produced from schema.prisma by\n"
            "// scripts/generate-postgres-baseline.py --write, and checked against it by\n"
            "// tests/unit/config/postgresBaseline.test.ts.\n"
            "//\n"
            "// Why a second file rather than flipping `provider` in the original: the\n"
            "// dev workflow, CI and all ~1,200 integration tests run on SQLite. Changing\n"
            "// the provider globally to serve Docker would break every one of them, and a\n"
            "// deployment concern should not dictate how the project is developed.\n"
            "// Prisma selects between them with --schema.\n\n"
        )
        pg_path = os.path.join(ROOT, "apps/api/prisma/schema.postgres.prisma")
        with open(pg_path, "w", encoding="utf-8") as fh:
            fh.write(header + pg_schema)
        print(f"wrote {pg_path}")

        d = os.path.join(ROOT, "apps/api/prisma/migrations-postgres/00000000000000_baseline")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "migration.sql"), "w", encoding="utf-8") as fh:
            fh.write(sql)
        lock = os.path.join(ROOT, "apps/api/prisma/migrations-postgres/migration_lock.toml")
        with open(lock, "w", encoding="utf-8") as fh:
            fh.write('# Please do not edit this file manually\nprovider = "postgresql"\n')
        print(f"wrote {d}/migration.sql  ({len(models)} models)")
    else:
        print(sql)


if __name__ == "__main__":
    main()
