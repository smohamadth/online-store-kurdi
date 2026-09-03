"""Browser proof that the marketing UI actually mounts and works.

The component suites run in happy-dom against mocked modules, which proves the
logic but NOT that these components survive being mounted in a real Next.js
page: a bad import, a server/client boundary mistake, or a crash inside
AppShell would pass every jsdom test and still leave a blank storefront.

Covers:
  - the exit-intent popup fires on a real storefront page, submits, and stays
    dismissed across a reload;
  - the popup is suppressed on /cart and /checkout (a popup over the payment
    step costs a real order);
  - a bundle created through the API renders on the product page with
    server-computed pricing, and "Add all to cart" adds every component.

Creates its own bundle fixture and deletes it at the end, so the suite is
repeatable - a previous run's leftovers must not look like a regression.
"""
import json
import os
import sys
import urllib.error
import urllib.request

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")

results = []

def trigger_exit_intent(page):
    """Simulate the shopper's pointer leaving through the top of the window.

    Tries a real pointer movement first (page.mouse), because that is what the
    component is actually built for. Chromium clamps mouse coordinates to the
    viewport, so it cannot produce the clientY <= 0 the handler looks for -
    hence the synthetic dispatch as well. Doing both means the check exercises
    the real path when it can and still reaches the handler when it cannot.
    """
    try:
        page.mouse.move(700, 400)
        page.mouse.move(700, 0)
    except Exception:
        pass
    page.evaluate(
        """() => {
            const ev = new MouseEvent('mouseout', {
                bubbles: true, cancelable: true, clientX: 700, clientY: -5,
            });
            // relatedTarget is readonly on the constructor in some engines;
            // define it explicitly so the handler's null check is meaningful.
            Object.defineProperty(ev, 'relatedTarget', { value: null });
            document.dispatchEvent(ev);
        }"""
    )
    page.wait_for_timeout(800)


def goto(page, url, settle=1500):
    """Navigate reliably.

    `networkidle` means "no network connections for 500ms", which a long-poll,
    a retrying request or a hanging third-party asset prevents forever -
    Playwright itself discourages it. regression-ui.py already hit this and
    aborted whole sweeps. Wait for `load` (a hard requirement), then treat
    networkidle as best-effort.
    """
    page.goto(url, wait_until="load", timeout=60000)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except PWTimeout:
        pass
    page.wait_for_timeout(settle)




def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))
    if not ok:
        # Raw job logs are not always reachable, but ::error:: annotations are
        # exposed through the checks API - so a failure here is diagnosable
        # without the log.
        safe = f"{name}: {detail}".replace("\n", " ").replace("\r", " ")
        print(f"::error::verify-marketing-ui: {safe}")


def _api(method, path, token=None, body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "{}")
        except Exception:
            return e.code, {}


def _admin_token():
    _, d = _api("POST", "/auth/login",
                body={"email": "admin@store.com", "password": "admin123"})
    return d["data"]["accessToken"]


# ---------------------------------------------------------------------------
# Fixture: a bundle built from two real, in-stock products.
# ---------------------------------------------------------------------------
try:
    token = _admin_token()
except Exception as exc:  # noqa: BLE001
    print(f"::error::verify-marketing-ui: admin login failed: {exc!r}")
    print("0/1 passed")
    sys.exit(1)

_, plist = _api("GET", "/products?limit=50")
stocked = [
    p for p in plist.get("data", [])
    if (p.get("quantity") or 0) >= 2 and p.get("status") == "active" and p.get("slug")
]
check("at least two stocked products exist to bundle", len(stocked) >= 2,
      f"found {len(stocked)}")

bundle_id = None
anchor = None
if len(stocked) >= 2:
    anchor, second = stocked[0], stocked[1]
    # Remove a leftover from an interrupted run before recreating it.
    _, existing = _api("GET", "/bundles")
    for b in existing.get("data", []):
        if b.get("slug") == "ui-verify-bundle":
            _api("DELETE", f"/bundles/{b['id']}", token)

    st, created = _api("POST", "/bundles", token, {
        "name": "UI Verify Bundle",
        "slug": "ui-verify-bundle",
        "discountType": "percentage",
        "discountValue": 20,
        "items": [
            {"productId": anchor["id"], "quantity": 1},
            {"productId": second["id"], "quantity": 1},
        ],
    })
    check("bundle fixture created", st == 201, f"status={st}")
    bundle_id = (created.get("data") or {}).get("id")

    expected_total = round(float(anchor["price"]) + float(second["price"]), 2)
    expected_price = round(expected_total * 0.8, 2)
    api_price = round(float((created.get("data") or {}).get("bundlePrice", 0)), 2)
    check("API prices the bundle server-side", abs(api_price - expected_price) < 0.02,
          f"expected {expected_price}, got {api_price}")

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # -------------------------------------------------------------------
        # 1. Bundle widget on the product page.
        # -------------------------------------------------------------------
        if bundle_id and anchor:
            ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
            page = ctx.new_page()
            console = []
            page.on("console",
                    lambda m: console.append(m.text) if m.type == "error" else None)

            goto(page, f"{WEB}/products/{anchor['slug']}", 2000)

            offer = page.locator('[data-testid="bundle-offer"]')
            if offer.count() == 0:
                # Report enough to tell "API returned nothing" apart from
                # "component did not mount".
                _, listed = _api("GET", "/bundles")
                slugs = [b.get("slug") for b in listed.get("data", [])]
                detail = (f"api bundles={slugs}; url={page.url}; "
                          f"console_errors={console[:2]}")
            else:
                detail = ""
            check("bundle offer renders on the product page", offer.count() > 0, detail)

            if offer.count() > 0:
                body = page.inner_text("body")
                check("bundle name is shown", "UI Verify Bundle" in body)

                now = page.locator('[data-testid="bundle-now-ui-verify-bundle"]')
                check("discounted price is displayed", now.count() > 0,
                      now.first.inner_text() if now.count() else "absent")

                # The rendered price must match what the API computed - the
                # component must never derive a price of its own.
                if now.count() > 0:
                    shown = now.first.inner_text()
                    digits = "".join(c for c in shown if c.isdigit() or c == ".")
                    check("displayed price matches the server's",
                          abs(float(digits) - expected_price) < 0.02,
                          f"shown {shown}, server {expected_price}")

                add = page.locator('[data-testid="bundle-add-ui-verify-bundle"]')
                check("add-all button is present", add.count() > 0)
                if add.count() > 0:
                    add.first.click()
                    page.wait_for_timeout(1200)
                    check("button confirms the add",
                          "Added" in add.first.inner_text(),
                          add.first.inner_text())

                    # Both components must land in the cart as separate lines.
                    goto(page, f"{WEB}/cart", 1500)
                    cart_text = page.inner_text("body")
                    check("first component is in the cart", anchor["name"] in cart_text)
                    check("second component is in the cart", second["name"] in cart_text)

            check("no console errors on the product page", len(console) == 0,
                  "; ".join(console[:2]))
            ctx.close()

        # -------------------------------------------------------------------
        # 2. Exit-intent popup on the storefront.
        # -------------------------------------------------------------------
        ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
        page = ctx.new_page()
        goto(page, WEB, 1500)

        check("popup is not shown before any trigger",
              page.locator('[data-testid="email-capture-popup"]').count() == 0)

        # Exit intent: pointer leaves through the TOP of the viewport.
        trigger_exit_intent(page)
        popup = page.locator('[data-testid="email-capture-popup"]')
        if popup.count() == 0:
            marker = page.evaluate(
                "() => localStorage.getItem('email_capture_done')")
            popup_detail = f"url={page.url}; dismissed_marker={marker}"
        else:
            popup_detail = ""
        check("popup opens on exit intent", popup.count() > 0, popup_detail)

        if popup.count() > 0:
            page.fill('[data-testid="email-capture-input"]', "ui-verify@example.com")
            page.click('[data-testid="email-capture-submit"]')
            page.wait_for_timeout(2000)
            check("popup confirms the signup",
                  page.locator('[data-testid="email-capture-success"]').count() > 0)

            # The address must be a real, unsubscribable subscriber - not just
            # a capture row - or we have recreated the unmailable-list problem.
            _, subs = _api("GET", "/newsletter/subscribers", token)
            emails = (subs.get("data") or {}).get("subscribers", [])
            check("the captured address is on the newsletter list",
                  "ui-verify@example.com" in emails)

        # Once per browser: a reload must not bring it back.
        page.reload(wait_until="load", timeout=60000)
        page.wait_for_timeout(1200)
        trigger_exit_intent(page)
        check("popup stays dismissed after a reload",
              page.locator('[data-testid="email-capture-popup"]').count() == 0)
        ctx.close()

        # -------------------------------------------------------------------
        # 3. Suppression on cart/checkout, in a FRESH browser context so the
        #    once-per-browser marker is not what is being observed.
        # -------------------------------------------------------------------
        # NOTE: /checkout bounces to /cart when the cart is empty, so a naive
        # "go to /checkout and assert no popup" would pass for the wrong
        # reason - it would really be testing /cart. Each route is asserted
        # against the URL the browser actually settled on.
        for route in ("/cart", "/checkout"):
            ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
            page = ctx.new_page()
            goto(page, f"{WEB}{route}", 1500)
            landed = page.url
            trigger_exit_intent(page)
            suppressed_route = any(r in landed for r in ("/cart", "/checkout"))
            check(f"requesting {route} lands on a suppressed route",
                  suppressed_route, f"landed on {landed}")
            check(f"popup is suppressed on {route} (landed {landed.split(WEB)[-1] or '/'})",
                  page.locator('[data-testid="email-capture-popup"]').count() == 0)
            ctx.close()

        # A suppressed route must not consume the single showing.
        ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
        page = ctx.new_page()
        # Whether this lands on /checkout or bounces to /cart, both are
        # suppressed routes, which is all this case needs.
        goto(page, f"{WEB}/checkout", 1500)
        goto(page, WEB, 1200)
        trigger_exit_intent(page)
        check("visiting checkout does not burn the one showing",
              page.locator('[data-testid="email-capture-popup"]').count() > 0)
        ctx.close()

        browser.close()
except Exception as exc:  # noqa: BLE001
    # A crash here exits 1 with nothing in the annotations, which is exactly
    # the situation that made the first failure undiagnosable.
    import traceback
    tb = traceback.format_exc().strip().replace("\n", " | ")
    print(f"::error::verify-marketing-ui crashed: {exc!r}")
    print(f"::error::traceback: {tb[-800:]}")
    results.append(False)
finally:
    # Leave the store as we found it.
    try:
        if bundle_id:
            _api("DELETE", f"/bundles/{bundle_id}", _admin_token())
    except Exception:  # noqa: BLE001
        pass

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
