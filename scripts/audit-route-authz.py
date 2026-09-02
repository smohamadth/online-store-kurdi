#!/usr/bin/env python3
"""
Audit every Express route for a missing authentication/authorization guard.

Why this exists
---------------
Authorization in this API is per-route middleware (`authenticate`,
`authorize('admin')`), sometimes hoisted to a blanket `router.use(...)` at the
top of a file. That is easy to get right 40 times and wrong once, and the one
time it is wrong there is no test that notices: a route with no guard returns
200 to anonymous callers and every existing test still passes.

This walks the route files, resolves which guards apply to each route
(blanket `router.use` guards apply to every route declared after them), and
reports mutating routes (POST/PUT/PATCH/DELETE) plus known-sensitive GETs
that end up with no guard at all.

Routes that are *deliberately* public - login, register, webhooks, public
catalogue reads - are annotated in the source with

    // authz-ok: <reason>

on the route line or in the comment block just above it. That keeps the
justification next to the code instead of in a list that rots here.

Exit code 1 if any unguarded route is found.
"""
import re
import sys
from pathlib import Path

API_SRC = Path(__file__).resolve().parent.parent / "apps" / "api" / "src"

ROUTE_RE = re.compile(r"^\s*router\.(get|post|put|patch|delete)\s*\(\s*(['\"`])(.*?)\2", re.M)
USE_RE = re.compile(r"^\s*router\.use\s*\((.*)$", re.M)
GUARD_RE = re.compile(r"\b(authenticate|authorize|requireAuth|adminOnly|requireAdmin|authenticateApiKey|optionalAuth)\b")
MUTATING = {"post", "put", "patch", "delete"}

# GETs that expose data no anonymous caller should see. Matched against the
# full mounted path.
SENSITIVE_GET = re.compile(
    r"/(admin|users|orders|analytics|accounting|inventory|settings|payouts|"
    r"commissions|wallet|developers|import-export|plugins|theme-studio)\b"
)


def mount_map(app_ts: Path) -> dict:
    """router variable name -> mounted prefix, from app.use('/api/x', router)."""
    out = {}
    for m in re.finditer(r"app\.use\(\s*['\"]([^'\"]+)['\"]\s*,\s*(\w+)", app_ts.read_text()):
        out.setdefault(m.group(2), m.group(1))
    return out


def import_map(app_ts: Path) -> dict:
    """router variable name -> source file stem it was imported from."""
    out = {}
    for m in re.finditer(r"import\s+(\w+)\s+from\s+['\"]([^'\"]+)['\"]", app_ts.read_text()):
        out[m.group(1)] = m.group(2)
    return out


def exempt(lines, idx) -> bool:
    """Is this route annotated `authz-ok`, on its line or just above it?"""
    window = lines[max(0, idx - 4): idx + 1]
    return any("authz-ok" in ln for ln in window)


def analyze(path: Path, prefix: str):
    text = path.read_text()
    lines = text.split("\n")

    # Offsets of blanket guards: every route declared after one inherits it.
    blanket = []
    for m in USE_RE.finditer(text):
        # Grab the whole call, which may wrap across lines.
        chunk = text[m.start(): m.start() + 400]
        if GUARD_RE.search(chunk.split("\n")[0]) or GUARD_RE.search(chunk[:200]):
            blanket.append(m.start())

    findings = []
    for m in ROUTE_RE.finditer(text):
        verb, route_path = m.group(1), m.group(3)
        idx = text[: m.start()].count("\n")

        covered_by_blanket = any(b < m.start() for b in blanket)
        # The handler's middleware list is everything up to the callback.
        tail = text[m.end(): m.end() + 500]
        head = tail.split("async")[0].split("=>")[0]
        has_own_guard = bool(GUARD_RE.search(head))

        if covered_by_blanket or has_own_guard or exempt(lines, idx):
            continue

        full = (prefix.rstrip("/") + "/" + route_path.lstrip("/")).replace("//", "/")
        if verb in MUTATING or SENSITIVE_GET.search(full):
            findings.append((idx + 1, verb.upper(), full))

    return findings


def main() -> int:
    app_ts = API_SRC / "app.ts"
    mounts, imports = mount_map(app_ts), import_map(app_ts)

    # Map each route file to the prefix it is mounted under.
    file_prefix = {}
    for var, prefix in mounts.items():
        src = imports.get(var)
        if not src:
            continue
        rel = src.replace("./", "")
        cand = API_SRC / (rel + ".ts")
        if cand.exists():
            file_prefix.setdefault(cand.resolve(), prefix)

    total = 0
    for path in sorted(API_SRC.rglob("*.routes.ts")):
        prefix = file_prefix.get(path.resolve(), "/api")
        found = analyze(path, prefix)
        if found:
            print(f"\n{path.relative_to(API_SRC)}")
            for line, verb, full in found:
                print(f"  L{line:<5} {verb:<7} {full}")
            total += len(found)

    print()
    if total:
        print(f"FAIL: {total} route(s) with no authentication/authorization guard.")
        print("Add authenticate/authorize, or annotate with `// authz-ok: <reason>`.")
        return 1
    print("OK: every mutating and sensitive route has a guard.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
