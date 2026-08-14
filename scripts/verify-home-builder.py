"""End-to-end check of the editable home page.

Drives a real browser: logs in as admin, reorders + renames a block, then
reloads the storefront and asserts the change actually shows.
"""
import re, sys
from playwright.sync_api import sync_playwright

WEB = "http://127.0.0.1:3000"
errors = []
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 1000})
    page = ctx.new_page()
    console = []
    page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

    # --- storefront renders the DB-driven layout
    page.goto(WEB, wait_until="networkidle")
    body = page.inner_text("body")
    check("home renders trust bar", "Free shipping" in body)
    check("home renders featured heading", "Featured Products" in body)
    check("home renders newsletter", "Subscribe" in body)

    # --- admin login
    page.goto(f"{WEB}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "admin@store.com")
    page.fill('input[type="password"]', "admin123")
    page.get_by_role("button", name="Sign In", exact=True).click()
    page.wait_for_timeout(3000)

    page.goto(f"{WEB}/admin/appearance", wait_until="networkidle")
    page.get_by_role("button", name=re.compile("Home page")).click()
    page.wait_for_timeout(2500)
    check("builder lists blocks", "Home page blocks" in page.inner_text("body"))

    # --- edit the Featured heading and save
    rows = page.locator("text=Featured products").first
    # open the editor on the featured row
    page.locator('[data-home-row="featured"]').get_by_role("button", name="Edit").click()
    page.wait_for_timeout(600)
    heading = page.locator('[data-home-row="featured"] input[placeholder="Leave empty to hide the heading"]')
    heading.fill("Hand-picked for you")
    page.locator('[data-home-row="featured"]').get_by_role("button", name="Save this block").click()
    page.wait_for_timeout(2500)
    check("save reports success", "saved" in page.inner_text("body").lower())

    # --- verify it persisted on the storefront
    page2 = ctx.new_page()
    page2.goto(WEB, wait_until="networkidle")
    t = page2.inner_text("body")
    check("storefront shows the new heading", "Hand-picked for you" in t)
    check("old heading gone", "Featured Products" not in t)

    # --- hide a block (state-independent: force it visible first)
    page.goto(f"{WEB}/admin/appearance", wait_until="networkidle")
    page.get_by_role("button", name=re.compile("Home page")).click()
    page.wait_for_timeout(2500)
    cb = page.locator('[data-home-row="testimonials"] input[type="checkbox"]').first
    if not cb.is_checked():
        cb.click()
        page.wait_for_timeout(2000)
    page2.reload(wait_until="networkidle")
    check("visible block shows on storefront", "Loved by our customers" in page2.inner_text("body"))

    cb.click()  # hide it
    page.wait_for_timeout(2500)
    page2.reload(wait_until="networkidle")
    check("hidden block disappears from storefront",
          "Loved by our customers" not in page2.inner_text("body"))

    # --- reordering persists
    page.locator('[data-home-row="stats"]').get_by_role("button", name="Move up").click()
    page.wait_for_timeout(2500)
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name=re.compile("Home page")).click()
    page.wait_for_timeout(2500)
    keys = page.locator("[data-home-row]").evaluate_all(
        "els => els.map(e => e.getAttribute('data-home-row'))")
    check("reorder survived a reload", keys.index("stats") < keys.index("features"),
          str(keys))

    # --- restore so the script is idempotent
    cb = page.locator('[data-home-row="testimonials"] input[type="checkbox"]').first
    if not cb.is_checked():
        cb.click()
        page.wait_for_timeout(2000)

    check("no console errors", len(console) == 0, "; ".join(console[:3]))
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
