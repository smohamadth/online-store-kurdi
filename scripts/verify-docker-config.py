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
print("=== 1. schema provider matches the compose DATABASE_URL ===")

schema = read("apps/api/prisma/schema.prisma")
ds = re.search(r"datasource\s+\w+\s*\{([\s\S]*?)\}", schema)
provider = None
if ds:
    m = re.search(r'provider\s*=\s*"([^"]+)"', ds.group(1))
    provider = m.group(1) if m else None
check("schema.prisma declares a provider", provider is not None, f"provider={provider}")

EXPECTED = {
    "sqlite": ("file:",),
    "postgresql": ("postgres://", "postgresql://"),
    "mysql": ("mysql://",),
}

# The migration history is locked to one provider; migrations written for
# SQLite cannot be applied to Postgres, so this must agree too.
lock_provider = None
try:
    lm = re.search(r'provider\s*=\s*"([^"]+)"', read("apps/api/prisma/migrations/migration_lock.toml"))
    lock_provider = lm.group(1) if lm else None
except FileNotFoundError:
    pass
check("migration_lock.toml agrees with schema.prisma",
      lock_provider == provider,
      f"lock={lock_provider} schema={provider}")

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
        # Strip a ${VAR:?...} / ${VAR:-...} wrapper down to the literal scheme.
        scheme = url.split("://")[0] + "://" if "://" in url else url.split(":")[0] + ":"
        prefixes = EXPECTED.get(provider or "", ())
        ok = any(url.startswith(p) for p in prefixes)
        check(f"{compose}: DATABASE_URL matches provider '{provider}'",
              ok, f"url starts {scheme}, expected one of {prefixes}")


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
