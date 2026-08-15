"""End-to-end proof that the home-page banner is editable and persists.

Edits the banner through the real admin UI, then reloads the storefront in a
SEPARATE browser context (no shared localStorage) and asserts the new copy is
actually there - i.e. it came from the database, not from a cache.
"""
import os
import re, sys
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1500, "height": 1100})
    page = ctx.new_page()
    console = []
    page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

    # storefront shows the banner
    page.goto(WEB, wait_until="networkidle")
    page.wait_for_timeout(1500)
    check("banner renders on home page",
          "Join thousands of happy customers" in page.inner_text("body"))

    # log in
    page.goto(f"{WEB}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "admin@store.com")
    page.fill('input[type="password"]', "admin123")
    page.get_by_role("button", name="Sign In", exact=True).click()
    page.wait_for_timeout(3500)

    # edit the banner
    page.goto(f"{WEB}/admin/banners", wait_until="networkidle")
    page.wait_for_timeout(2500)
    check("banner listed in admin",
          "Join thousands of happy customers" in page.inner_text("body"))

    page.locator('[data-banner-row="strip"]').get_by_role(
        "button", name=re.compile("Edit")).first.click()
    page.wait_for_timeout(1500)

    NEW = "Shop with confidence in Kurdistan"
    page.get_by_label("Banner title").fill(NEW)
    page.get_by_role("button", name=re.compile("Save Changes|Create Banner")).click()
    page.wait_for_timeout(3000)

    # fresh context = no localStorage, so this can only come from the database
    ctx2 = b.new_context(viewport={"width": 1400, "height": 1000})
    sf = ctx2.new_page()
    sf.goto(WEB, wait_until="networkidle")
    sf.wait_for_timeout(2000)
    body = sf.inner_text("body")
    check("edited banner text persisted to a FRESH browser", NEW in body, )
    check("old text is gone", "Join thousands of happy customers" not in body)

    # move the banner via the home page builder
    page.goto(f"{WEB}/admin/appearance", wait_until="networkidle")
    page.get_by_role("button", name=re.compile("Home page")).click()
    page.wait_for_timeout(2500)
    check("banner block appears in the builder",
          page.locator('[data-home-row="bannerStrip"]').count() == 1)

    page.locator('[data-home-row="bannerStrip"]').get_by_role(
        "button", name="Move up").click()
    page.wait_for_timeout(2500)
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name=re.compile("Home page")).click()
    page.wait_for_timeout(2500)
    keys = page.locator("[data-home-row]").evaluate_all(
        "els => els.map(e => e.getAttribute('data-home-row'))")
    check("banner reorder survived a reload",
          keys.index("bannerStrip") < keys.index("dealCountdown"), str(keys))

    # hide it
    cb = page.locator('[data-home-row="bannerStrip"] input[type="checkbox"]').first
    cb.click()
    page.wait_for_timeout(2500)
    sf.reload(wait_until="networkidle")
    sf.wait_for_timeout(1500)
    check("hiding the banner removes it from the storefront",
          NEW not in sf.inner_text("body"))

    # restore
    cb.click()
    page.wait_for_timeout(2000)

    check("no console errors", len(console) == 0, "; ".join(console[:2]))
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
