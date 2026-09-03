"""Static checks on the Docker deployment configuration.

Runs without Docker, so it works in CI and on a dev machine. Three things it
guards, each of which has actually been wrong in this repo:

  1. The Prisma provider and the compose DATABASE_URL must agree. schema.prisma
     ships provider = "sqlite" while docker-compose.prod.yml hands the API a
     postgresql:// URL, so `docker compose up` dies at API startup. The
     existing verify-env-config.py checks the .env TEMPLATES but never looked
     at the compose files, which is where this mismatch lives.

  2. Credentials must be mandatory (${VAR:?msg}), not defaulted (${VAR:-...}).
     A default means a production deploy that forgets a variable comes up with
     a password published in this repository - and those particular strings
     are not in the API's placeholder-secret blocklist either, so neither
     safety net catches it.

  3. .dockerignore must exist and exclude node_modules. Both Dockerfiles run
     `npm ci` and THEN `COPY . .`, so a copied host node_modules overwrites
     the freshly installed tree - a correctness problem, not just a slow build.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))
    if not ok:
        safe = f"{name}: {detail}".replace("\n", " ")
        print(f"::error::verify-docker-config: {safe}")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


# ---------------------------------------------------------------------------
# 1. Provider vs compose DATABASE_URL
# ---------------------------------------------------------------------------
print("=== 1. every compose DATABASE_URL has a matching schema + migrations ===")

# The project supports both providers: SQLite for development and CI, and
# PostgreSQL for deployment. scripts/entrypoint-api.sh picks the schema at
# runtime from DATABASE_URL, so what matters is that whichever URL a compose
# file uses, the corresponding schema AND migration set both exist and agree.

EXPECTED = {
    "sqlite": ("file:",),
    "postgresql": ("postgres://", "postgresql://"),
    "mysql": ("mysql://",),
}

# (label, schema file, migrations dir)
VARIANTS = [
    ("sqlite", "apps/api/prisma/schema.prisma", "apps/api/prisma/migrations"),
    ("postgresql", "apps/api/prisma/schema.postgres.prisma", "apps/api/prisma/migrations-postgres"),
]


def provider_of(rel):
    try:
        text = read(rel)
    except FileNotFoundError:
        return None
    ds = re.search(r"datasource\s+\w+\s*\{([\s\S]*?)\}", text)
    if not ds:
        return None
    m = re.search(r'provider\s*=\s*"([^"]+)"', ds.group(1))
    return m.group(1) if m else None


available = {}
for label, schema_file, migrations_dir in VARIANTS:
    prov = provider_of(schema_file)
    check(f"{schema_file} declares provider '{label}'", prov == label, f"got {prov}")
    if prov != label:
        continue

    lock_path = os.path.join(migrations_dir, "migration_lock.toml")
    try:
        lock = re.search(r'provider\s*=\s*"([^"]+)"', read(lock_path))
        lock_provider = lock.group(1) if lock else None
    except FileNotFoundError:
        lock_provider = None
    # The migration history is locked to one provider; a mismatch here means
    # `migrate deploy` would refuse to run.
    check(f"{lock_path} agrees with its schema", lock_provider == label,
          f"lock={lock_provider} schema={label}")

    has_migration = os.path.isdir(os.path.join(ROOT, migrations_dir)) and any(
        f.endswith(".sql")
        for root, _dirs, files in os.walk(os.path.join(ROOT, migrations_dir))
        for f in files
    )
    check(f"{migrations_dir} contains at least one migration", has_migration)

    if lock_provider == label and has_migration:
        available[label] = True

for compose in ("docker/docker-compose.prod.yml", "docker/docker-compose.yml"):
    try:
        text = read(compose)
    except FileNotFoundError:
        continue
    urls = re.findall(r"DATABASE_URL:\s*(\S+)", text)
    if not urls:
        check(f"{compose}: no DATABASE_URL to check", True, "not set here")
        continue
    for url in urls:
        matched = [p for p, prefixes in EXPECTED.items() if url.startswith(prefixes)]
        prov = matched[0] if matched else None
        scheme = url.split("://")[0] + "://" if "://" in url else url.split(":")[0] + ":"
        check(f"{compose}: DATABASE_URL scheme is one we support",
              prov is not None,
              scheme if prov else f"unrecognised scheme {scheme}")
        if prov:
            ok = available.get(prov, False)
            check(f"{compose}: a '{prov}' schema + migration set exists", ok,
                  "ready" if ok else
                  f"URL is {scheme} but no usable {prov} schema/migrations were found")


# ---------------------------------------------------------------------------
# 2. Credentials must be mandatory, not defaulted
# ---------------------------------------------------------------------------
print()
print("=== 2. production credentials have no silent defaults ===")

# Anything that grants access to data. Optional integrations (SMTP, Stripe)
# may default to empty - the store simply runs without them.
MUST_BE_MANDATORY = [
    "JWT_SECRET",
    "POSTGRES_PASSWORD",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
]

prod = read("docker/docker-compose.prod.yml")
for var in MUST_BE_MANDATORY:
    defaulted = re.findall(rf"\$\{{{var}:-([^}}]*)\}}", prod)
    mandatory = re.findall(rf"\$\{{{var}:\?([^}}]*)\}}", prod)
    ok = not defaulted and bool(mandatory)
    if defaulted:
        detail = f"has a silent default: {defaulted}"
    elif not mandatory:
        detail = "not referenced with ${VAR:?...}"
    else:
        detail = "mandatory"
    check(f"{var} is mandatory in docker-compose.prod.yml", ok, detail)

# A :? with no message tells the operator nothing.
for var, msg in re.findall(r"\$\{(\w+):\?([^}]*)\}", prod):
    check(f"{var}'s :? carries an explanatory message",
          bool(msg.strip()),
          "message is empty" if not msg.strip() else "ok")


# ---------------------------------------------------------------------------
# 3. .dockerignore
# ---------------------------------------------------------------------------
print()
print("=== 3. build context is bounded ===")

try:
    ignore = read(".dockerignore")
except FileNotFoundError:
    ignore = None

check(".dockerignore exists", ignore is not None,
      "without it the host node_modules overwrites the image's npm ci")

if ignore:
    patterns = [l.strip() for l in ignore.splitlines()
                if l.strip() and not l.strip().startswith("#")]
    for needed in ("node_modules", ".git"):
        check(f".dockerignore excludes {needed}",
              any(p.rstrip("/") == needed for p in patterns),
              f"patterns: {patterns[:6]}")

    # Things the Dockerfiles COPY must NOT be excluded.
    required = ["package.json", "package-lock.json", "apps/api/prisma/schema.prisma"]
    for req in required:
        blocked = [p for p in patterns
                   if not p.startswith("!") and (p.rstrip("/") == req or req.startswith(p.rstrip("/") + "/"))]
        check(f".dockerignore keeps {req}", not blocked, f"excluded by {blocked}")


print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
