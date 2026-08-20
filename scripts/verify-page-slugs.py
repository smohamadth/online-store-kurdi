#!/usr/bin/env python3
"""Pages and blog posts must be reachable whatever script the title uses.

The bug this guards (found 2026-08-20):

  Title "کۆمپانیای ئێمە" -> slugify() stripped every non-Latin character ->
  slug '' -> the page saved under a blank/other address and /p/<expected>
  returned 404. Reported as "new pages 404". The earlier fix (defaulting
  status to 'published') was a DIFFERENT cause of the same symptom, which is
  why the report came back.

Drives the real admin UI, then fetches the storefront URL.
Fixtures are prefixed 'ktslug-' and deleted in a finally block.
"""
import sys
import time
import urllib.parse
from playwright.sync_api import sync_playwright

WEB = "http://localhost:3000"
API = "http://localhost:3001"
STAMP = str(int(time.time()))
PREFIX = "ktslug"

CASES = [
    ("latin",           f"{PREFIX} About Our Shop {STAMP}"),
    ("kurdish sorani",  f"{PREFIX} کۆمپانیای ئێمە {STAMP}"),
    ("arabic",          f"{PREFIX} سياسة الشحن {STAMP}"),
    ("punctuation",     f"{PREFIX} FAQ & Returns! {STAMP}"),
    ("mixed script",    f"{PREFIX} Shipping گەیاندن {STAMP}"),
]

passed = failed = 0
created = []


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {name} {detail}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


def run(pg, section, admin_path, storefront_prefix, new_btn, save_btn):
    for label, title in CASES:
        pg.goto(f"{WEB}{admin_path}", wait_until="networkidle")
        pg.wait_for_timeout(2000)
        pg.locator(f'button:has-text("{new_btn}")').first.click()
        pg.wait_for_timeout(1200)

        fields = pg.locator("input[type=text], input:not([type])")
        fields.first.fill(title)
        pg.wait_for_timeout(900)
        slug = fields.nth(1).input_value()

        status = {}
        pg.on(
            "response",
            lambda r: status.update(code=r.status)
            if r.request.method == "POST" and "/api/" in r.url
            else None,
        )
        pg.locator(f'button:has-text("{save_btn}")').first.click()
        pg.wait_for_timeout(3000)

        # 1. the slug field must never be blank - a blank slug is the bug
        check(f"{section}/{label}: slug not empty", bool(slug.strip()),
              f"slug={slug!r}")
        if not slug.strip():
            continue

        created.append((section, slug))

        # 2. the save must have been accepted
        check(f"{section}/{label}: saved", status.get("code") in (200, 201),
              f"POST {status.get('code')}")

        # 3. the storefront URL the admin was shown must actually resolve
        url = f"{WEB}{storefront_prefix}{urllib.parse.quote(slug)}"
        resp = pg.goto(url)
        check(f"{section}/{label}: storefront 200",
              resp is not None and resp.status == 200,
              f"{resp.status if resp else 'none'} {storefront_prefix}{slug}")

        # 4. the page must actually render its title, not an error shell
        if resp and resp.status == 200:
            # Must render the real title, not the styled not-found shell.
            # A double-encoded slug produced HTTP 200 + "Page not found",
            # so status alone is not proof the page resolved.
            body = pg.inner_text("body")
            h1 = pg.inner_text("h1") if pg.locator("h1").count() else ""
            check(f"{section}/{label}: renders real page, not not-found",
                  "Page not found" not in h1 and "not found" not in h1.lower(),
                  f"h1={h1[:40]!r}")
            check(f"{section}/{label}: title rendered", title in body,
                  f"h1={h1[:40]!r}")


def cleanup(pg, token):
    for section, slug in created:
        base = "pages" if section == "pages" else "blog"
        try:
            listing = pg.request.get(
                f"{API}/api/{base}/all",
                headers={"Authorization": f"Bearer {token}"},
            ).json()
            for item in listing.get("data", []):
                if item.get("slug") == slug:
                    pg.request.delete(
                        f"{API}/api/{base}/{item['id']}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
        except Exception as exc:  # noqa: BLE001
            print(f"  cleanup warning {base}/{slug}: {exc}")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
        token = ""
        try:
            r = pg.request.post(
                f"{API}/api/auth/login",
                data={"email": "admin@store.com", "password": "admin123"},
            )
            token = r.json()["data"]["accessToken"]

            pg.goto(f"{WEB}/login", wait_until="networkidle")
            pg.wait_for_timeout(3500)
            pg.fill("input[type=email]", "admin@store.com")
            pg.fill("input[type=password]", "admin123")
            pg.press("input[type=password]", "Enter")
            pg.wait_for_timeout(5000)
            if "/login" in pg.url:
                print("FATAL: admin login failed")
                sys.exit(1)

            run(pg, "pages", "/admin/pages", "/p/", "New page", "Create page")
            run(pg, "blog", "/admin/blog", "/blog/", "New post", "Create post")
        finally:
            if token:
                cleanup(pg, token)
            b.close()

    print(f"\n{passed}/{passed + failed} checks passed")
    sys.exit(1 if failed else 0)


main()
