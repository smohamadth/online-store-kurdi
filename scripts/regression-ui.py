"""Browser regression: every page renders, no console errors, key flows intact."""
import os
import sys
import traceback
from playwright.sync_api import sync_playwright


def annotate(title, message):
    """Emit a GitHub Actions error annotation (no-op outside CI).

    Annotations are the only failure detail visible on the run/PR without
    downloading the log archive, so anything that can end the run has to go
    through here.
    """
    if os.environ.get("GITHUB_ACTIONS") == "true":
        clean = str(message).replace("\r", " ").replace("\n", "%0A")
        print(f"::error title={title}::{clean}")

BASE = os.environ.get("WEB_URL", "http://127.0.0.1:3000")

PUBLIC = ["/", "/products", "/products/classic-t-shirt", "/category/clothing",
          "/cart", "/search?q=shirt", "/deals", "/contact", "/faq",
          "/track-order", "/login", "/register", "/privacy", "/terms", "/returns"]

ADMIN = ["/admin", "/admin/products", "/admin/categories", "/admin/orders",
         "/admin/users", "/admin/coupons", "/admin/inventory", "/admin/reviews",
         "/admin/menus", "/admin/banners", "/admin/appearance", "/admin/shipping",
         "/admin/tax", "/admin/analytics", "/admin/settings", "/admin/profile"]

ACCOUNT = ["/account", "/account/orders", "/account/wishlist",
           "/account/addresses", "/account/profile", "/account/reviews"]


def login(p, email, pw):
    p.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
    p.fill('input[type="email"]', email)
    p.fill('input[type="password"]', pw)
    p.get_by_role("button", name="Sign In", exact=True).last.click()
    p.wait_for_timeout(3000)


# Defaults so the reporting block below is well-defined even if the browser
# section raises before they are assigned.
bad, abad, cbad, n = [], [], [], 0
errors = {}
crash = None

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 950})
    current = {"path": ""}
    p.on("pageerror", lambda e: errors.setdefault(current["path"], []).append(str(e)[:110]))

    try:
        def visit(path):
            current["path"] = path
            p.goto(f"{BASE}{path}", wait_until="networkidle", timeout=60000)
            p.wait_for_timeout(1600)
            body = p.inner_text("body")
            broken = ("Application error" in body or "Something went wrong" in body
                      or "This page could not be found" in body)
            return body, broken

        print("=== PUBLIC PAGES ===")
        bad = []
        for path in PUBLIC:
            body, broken = visit(path)
            if broken or path in errors:
                bad.append(path)
                print(f"  ❌ {path}")
            else:
                print(f"  ✅ {path}")
        print(f"  -> {len(PUBLIC)-len(bad)}/{len(PUBLIC)} ok")

        print()
        print("=== ADMIN PAGES ===")
        login(p, "admin@store.com", "admin123")
        abad = []
        for path in ADMIN:
            body, broken = visit(path)
            if broken or "/login" in p.url or path in errors:
                abad.append(path)
                print(f"  ❌ {path}")
            else:
                print(f"  ✅ {path}")
        print(f"  -> {len(ADMIN)-len(abad)}/{len(ADMIN)} ok")

        print()
        print("=== ACCOUNT PAGES ===")
        cbad = []
        for path in ACCOUNT:
            body, broken = visit(path)
            if broken or path in errors:
                cbad.append(path)
                print(f"  ❌ {path}")
            else:
                print(f"  ✅ {path}")
        print(f"  -> {len(ACCOUNT)-len(cbad)}/{len(ACCOUNT)} ok")

        print()
        print("=== KEY BEHAVIOUR ===")
        p.goto(f"{BASE}/products", wait_until="networkidle", timeout=60000)
        p.wait_for_timeout(2500)
        p.locator('a[href^="/products/"]').first.hover()
        p.wait_for_timeout(700)
        n = p.get_by_role("button", name="Add to cart").count()
        print("  add-to-cart buttons on /products:", n, "✅" if n else "❌")

        p.goto(f"{BASE}/products/classic-t-shirt", wait_until="networkidle", timeout=60000)
        p.wait_for_timeout(2500)
        html = p.content()
        print("  product JSON-LD present:", "application/ld+json" in html)
        print("  exactly one <title>:", html.count("<title>") == 1)

        print()
        print("=== CONSOLE ERRORS ===")
        if errors:
            for k, v in list(errors.items())[:6]:
                print(f"  {k}: {v[0]}")
        else:
            print("  none across all pages")

    except Exception as exc:
        # A crash mid-sweep (a selector that no longer matches, a navigation
        # timeout) previously ended the script with a bare traceback and no
        # annotation, so the run page showed only "exit code 1".
        crash = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()
        print(f"  !! sweep crashed while on {current['path'] or '(startup)'}")

    b.close()

# Fail the build on any broken page, missing add-to-cart button or console
# error. This script previously only printed its findings and always exited 0,
# so a CI job would have gone green with pages returning 500.
failures = []
if crash:
    failures.append(f"sweep crashed: {crash}")
if bad:
    failures.append(f"{len(bad)} public page(s) failed: {', '.join(bad)}")
if abad:
    failures.append(f"{len(abad)} admin page(s) failed: {', '.join(abad)}")
if cbad:
    failures.append(f"{len(cbad)} account page(s) failed: {', '.join(cbad)}")
if not n:
    failures.append("no add-to-cart buttons rendered on /products")
if errors:
    failures.append(f"console errors on {len(errors)} page(s): {', '.join(list(errors)[:5])}")

print()
if failures:
    print("===== FAILED =====")
    for f in failures:
        print("  -", f)
    # Also emit GitHub Actions error annotations. Without these the reason a
    # run went red lives only inside the step log, which is awkward to reach
    # (and unreachable entirely from restricted networks) - the job summary
    # just says "Process completed with exit code 1". Annotations surface the
    # actual failing pages directly on the run and the PR.
    for f in failures:
        annotate("UI regression", f)
    for path, errs in list(errors.items())[:10]:
        annotate(f"Console error on {path}", errs[0])
    sys.exit(1)
print("===== all UI checks passed =====")
