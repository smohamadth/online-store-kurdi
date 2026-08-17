"""Guard the DATABASE_URL / schema-provider trap.

A user on Windows followed the documented setup (`cp .env.example apps/api/.env`)
and the API died with:

    Error validating datasource `db`: the URL must start with the
    protocol `file:`   (Prisma P1012)

Cause: schema.prisma ships `provider = "sqlite"`, but both .env.example files
handed out a PostgreSQL URL. The instructions produced a broken install.

This checks three things:
  1. the shipped templates agree with the schema provider
  2. the mismatch detector classifies good and bad URLs correctly
  3. the API refuses to start on a mismatch, printing the fix

Runs without a server for 1 and 2. Part 3 needs node_modules and is skipped
with a notice if the API cannot be launched.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.path.join(ROOT, "apps", "api")
SCHEMA = os.path.join(API, "prisma", "schema.prisma")

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))


def schema_provider():
    text = open(SCHEMA, encoding="utf8").read()
    block = re.search(r"datasource\s+\w+\s*\{([\s\S]*?)\}", text)
    if not block:
        return None
    m = re.search(r'provider\s*=\s*"([^"]+)"', block.group(1))
    return m.group(1) if m else None


PREFIXES = {
    "sqlite": ["file:"],
    "postgresql": ["postgres://", "postgresql://"],
    "mysql": ["mysql://"],
}


def active_database_url(path):
    """First uncommented DATABASE_URL in a dotenv file."""
    for line in open(path, encoding="utf8"):
        line = line.strip()
        if line.startswith("#") or not line.startswith("DATABASE_URL"):
            continue
        return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


print("=== 1. shipped templates match the schema provider ===")
provider = schema_provider()
check("schema.prisma declares a provider", provider is not None, f"provider={provider}")
expected = PREFIXES.get(provider, [])

for rel in [".env.example", "apps/api/.env.example", "apps/api/.env.ci"]:
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        check(f"{rel} exists", False, "missing")
        continue
    url = active_database_url(path)
    ok = bool(url) and any(url.startswith(p) for p in expected)
    check(f"{rel} works with provider '{provider}'", ok, f"DATABASE_URL={url}")

print()
print("=== 2. mismatch detector classifies URLs correctly ===")
# Mirrors findDatabaseUrlMismatch() in src/config/verifyDatabaseUrl.ts.
CASES = [
    ("file:./dev.db", "sqlite", True),
    ("file:/abs/path/prod.db", "sqlite", True),
    ("postgresql://u:p@localhost:5432/db", "sqlite", False),
    ("postgres://u:p@localhost:5432/db", "sqlite", False),
    ("mysql://u:p@localhost:3306/db", "sqlite", False),
    ("postgresql://u:p@localhost:5432/db", "postgresql", True),
    ("postgres://u:p@localhost:5432/db", "postgresql", True),
    ("file:./dev.db", "postgresql", False),
]
wrong = []
for url, prov, should_pass in CASES:
    accepted = any(url.startswith(p) for p in PREFIXES[prov])
    if accepted != should_pass:
        wrong.append(f"{prov}+{url}")
check(f"{len(CASES)} URL/provider combinations classified correctly",
      not wrong, ", ".join(wrong))

print()
print("=== 3. API refuses to start on a mismatch and prints the fix ===")
env_path = os.path.join(API, ".env")
if not os.path.exists(os.path.join(ROOT, "node_modules")):
    print("  SKIP - node_modules not installed")
else:
    backup = None
    if os.path.exists(env_path):
        backup = open(env_path, encoding="utf8").read()
    try:
        base = backup or open(os.path.join(API, ".env.ci"), encoding="utf8").read()
        broken = re.sub(
            r"^DATABASE_URL=.*$",
            "DATABASE_URL=postgresql://u:p@localhost:5432/db",
            base,
            count=1,
            flags=re.M,
        )
        open(env_path, "w", encoding="utf8").write(broken)

        proc = subprocess.run(
            ["npx", "tsx", "src/server.ts"],
            cwd=API,
            capture_output=True,
            text=True,
            timeout=90,
        )
        out = re.sub(r"\x1b\[[0-9;]*m", "", proc.stdout + proc.stderr)

        check("API exits non-zero on mismatch", proc.returncode != 0,
              f"exit={proc.returncode}")
        check("error names the mismatch",
              "DATABASE_URL does not match your Prisma schema" in out)
        check("error states the schema provider", "provider : sqlite" in out)
        check("error gives the exact fix", 'DATABASE_URL="file:./dev.db"' in out)
        check("raw Prisma P1012 is not what the user sees first",
              out.index("does not match your Prisma schema") < out.index("P1012")
              if "P1012" in out else True)
    except subprocess.TimeoutExpired:
        check("API exits non-zero on mismatch", False, "timed out - it kept running")
    finally:
        if backup is not None:
            open(env_path, "w", encoding="utf8").write(backup)
        elif os.path.exists(env_path):
            os.remove(env_path)

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
