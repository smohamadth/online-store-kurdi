"""Custom storefront pages (CMS), the admin shell layout, and the sidebar.

Covers three things added together:

1. PAGE BUILDER. Pages like /privacy were hardcoded .tsx files an admin could
   not touch. Admin-authored pages now live at /p/<slug>. The important
   assertions are the ones that protect the storefront:
     - content is sanitised ON WRITE (it is rendered with
       dangerouslySetInnerHTML, so storing raw HTML would be stored XSS)
     - a DRAFT is indistinguishable from a missing page publicly, and returns a
       real HTTP 404 rather than a soft 404 that Google would index
     - a page cannot claim a reserved address such as /admin

2. ADMIN LAYOUT. The storefront footer rendered underneath the admin panel,
   leaving a 64px gap and then 342px of shop links inside the dashboard.

3. SIDEBAR. 17 links in a flat list; the last items fell outside the viewport.

Fixtures are prefixed and removed in a finally block, so the suite is
repeatable.
"""
import json
import os
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")

PREFIX = "pagetest-"
results = []
created = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))


def call(method, path, token=None, body=None):
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
        except Exception:  # noqa: BLE001
            return e.code, {}


def web_status(path):
    req = urllib.request.Request(f"{WEB}{path}", headers={"User-Agent": "verify-pages"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def login(email, password):
    st, d = call("POST", "/auth/login", body={"email": email, "password": password})
    if st != 200:
        raise SystemExit(f"login failed for {email}: {st} {d}")
    return d["data"]["accessToken"]


admin = login("admin@store.com", "admin123")
customer = login("customer@example.com", "customer123")


def make(slug, **fields):
    st, d = call("POST", "/pages", admin, {"slug": f"{PREFIX}{slug}", "title": "T", **fields})
    if st in (200, 201):
        created.append(d["data"]["id"])
    return st, d


try:
    # =====================================================================
    print("=== 1. create, sanitise, publish ===")
    # =====================================================================
    st, d = make(
        "hello",
        title="Hello World",
        content='<p onclick="alert(1)">safe</p><script>alert(2)</script><strong>bold</strong>',
        status="draft",
    )
    check("admin can create a page", st == 201, f"status={st}")
    page = d.get("data", {})
    pid = page.get("id")

    check("script tag stripped on write", "<script" not in page.get("content", ""))
    check("inline handler stripped on write", "onclick" not in page.get("content", ""))
    check("safe formatting preserved", "<strong>bold</strong>" in page.get("content", ""))
    check("new pages default to draft", page.get("status") == "draft", str(page.get("status")))
    check("draft has no publishedAt", page.get("publishedAt") in (None, ""))

    # =====================================================================
    print()
    print("=== 2. a draft must be invisible to the public ===")
    # =====================================================================
    st, _ = call("GET", f"/pages/slug/{PREFIX}hello")
    check("API 404s a draft for anonymous callers", st == 404, f"status={st}")

    code, body = web_status(f"/p/{PREFIX}hello")
    check("storefront returns a REAL 404 for a draft", code == 404, f"status={code}")
    check("draft title does not leak in the 404 body", "Hello World" not in body)

    st, listing = call("GET", "/pages")
    slugs = [p["slug"] for p in listing.get("data", [])]
    check("draft absent from the public page list", f"{PREFIX}hello" not in slugs)

    st, all_pages = call("GET", "/pages/all", admin)
    admin_slugs = [p["slug"] for p in all_pages.get("data", [])]
    check("but admin CAN see the draft", f"{PREFIX}hello" in admin_slugs)

    # =====================================================================
    print()
    print("=== 3. publishing makes it live ===")
    # =====================================================================
    st, d = call("PUT", f"/pages/{pid}", admin, {"status": "published", "showInFooter": True})
    check("publish succeeds", st == 200, f"status={st}")
    check("publishedAt is stamped", bool(d["data"].get("publishedAt")))

    code, body = web_status(f"/p/{PREFIX}hello")
    check("published page returns 200", code == 200, f"status={code}")
    check("page content renders", "bold" in body)
    check("page title renders", "Hello World" in body)
    check("page has its own <title>", f"<title>" in body and "Hello World" in body)
    check("published page is indexable", "noindex" not in body)

    # =====================================================================
    print()
    print("=== 4. unpublishing takes it down again ===")
    # =====================================================================
    call("PUT", f"/pages/{pid}", admin, {"status": "draft"})
    code, _ = web_status(f"/p/{PREFIX}hello")
    check("unpublished page returns 404 again", code == 404, f"status={code}")
    st, d = call("GET", f"/pages/{pid}", admin)
    check("publishedAt cleared on unpublish", d["data"].get("publishedAt") in (None, ""))
    call("PUT", f"/pages/{pid}", admin, {"status": "published"})

    # =====================================================================
    print()
    print("=== 5. slug rules ===")
    # =====================================================================
    st, _ = call("POST", "/pages", admin, {"slug": "admin", "title": "Evil"})
    check("reserved slug 'admin' rejected", st == 400, f"status={st}")
    st, _ = call("POST", "/pages", admin, {"slug": "products", "title": "Evil"})
    check("reserved slug 'products' rejected", st == 400, f"status={st}")
    st, _ = call("POST", "/pages", admin, {"slug": f"{PREFIX}hello", "title": "Dup"})
    check("duplicate slug rejected with 409", st == 409, f"status={st}")
    st, _ = call("POST", "/pages", admin, {"slug": "Not A Slug!", "title": "Bad"})
    check("malformed slug rejected with 400", st == 400, f"status={st}")
    st, _ = call("POST", "/pages", admin, {"slug": f"{PREFIX}notitle"})
    check("missing title rejected with 400", st == 400, f"status={st}")

    # =====================================================================
    print()
    print("=== 5b. images in page content ===")
    # =====================================================================
    # <img> is allowed so admins can illustrate a page, but the src rules must
    # still hold: a data: URI can carry an SVG containing <script>.
    st, d = make(
        "withimage",
        title="Page With Image",
        content=(
            '<p>Intro</p>'
            '<img src="/uploads/content/photo.jpg" alt="A photo">'
            '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">'
            '<img src="x" onerror="alert(1)">'
            '<figure><img src="/uploads/content/b.jpg" alt="b"><figcaption>Caption</figcaption></figure>'
        ),
        status="published",
    )
    check("page with images can be created", st == 201, f"status={st}")
    content = d.get("data", {}).get("content", "")

    check("a real uploaded image is KEPT", "/uploads/content/photo.jpg" in content)
    check("alt text is kept", 'alt="A photo"' in content)
    check("figure/figcaption kept", "<figcaption>" in content)
    check("data: URI image is neutralised", "data:image" not in content)
    check("onerror handler stripped", "onerror" not in content)

    code, body = web_status(f"/p/{PREFIX}withimage")
    check("page with an image renders", code == 200, f"status={code}")
    check("the image reaches the storefront HTML",
          "/uploads/content/photo.jpg" in body)

    # =====================================================================
    print()
    print("=== 6. authorisation ===")
    # =====================================================================
    st, _ = call("POST", "/pages", None, {"slug": f"{PREFIX}anon", "title": "X"})
    check("anonymous cannot create a page", st == 401, f"status={st}")
    st, _ = call("POST", "/pages", customer, {"slug": f"{PREFIX}cust", "title": "X"})
    check("customer cannot create a page", st in (401, 403), f"status={st}")
    st, _ = call("GET", "/pages/all", customer)
    check("customer cannot list drafts", st in (401, 403), f"status={st}")
    st, _ = call("PUT", f"/pages/{pid}", customer, {"title": "Hacked"})
    check("customer cannot edit a page", st in (401, 403), f"status={st}")
    st, _ = call("DELETE", f"/pages/{pid}", customer)
    check("customer cannot delete a page", st in (401, 403), f"status={st}")

    # =====================================================================
    print()
    print("=== 7. admin UI: layout, sidebar, page builder ===")
    # =====================================================================
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1500, "height": 950})
        page_ui = ctx.new_page()
        console = []
        page_ui.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

        page_ui.goto(f"{WEB}/login", wait_until="networkidle")
        page_ui.fill('input[type="email"]', "admin@store.com")
        page_ui.fill('input[type="password"]', "admin123")
        page_ui.get_by_role("button", name="Sign In", exact=True).click()
        page_ui.wait_for_timeout(3500)

        page_ui.goto(f"{WEB}/admin", wait_until="networkidle")
        page_ui.wait_for_timeout(2000)

        # --- the footer gap ------------------------------------------------
        layout = page_ui.evaluate("""() => {
            const shell = document.querySelector('[data-admin-shell]');
            const footer = document.querySelector('footer');
            return {
              gap: document.body.scrollHeight - Math.round(shell.getBoundingClientRect().height),
              footerPresent: !!footer,
            };
        }""")
        check("no storefront footer inside the admin panel", layout["footerPresent"] is False)
        check("no dead space below the admin shell", layout["gap"] <= 2,
              f"gap={layout['gap']}px")

        # --- sidebar --------------------------------------------------------
        body_text = page_ui.inner_text("body")
        for heading in ["CATALOGUE", "SELLING", "CUSTOMERS", "STOREFRONT", "SYSTEM"]:
            check(f"sidebar group '{heading}' present", heading in body_text.upper())

        nav = page_ui.evaluate("""() => {
            const nav = document.querySelector('[data-admin-nav]');
            const items = [...document.querySelectorAll('[data-nav-item]')];
            const last = items[items.length - 1];
            const nb = nav.getBoundingClientRect();
            const before = nav.scrollTop;
            nav.scrollTop = nav.scrollHeight;
            const reachable = last.getBoundingClientRect().bottom <= nb.bottom + 2;
            nav.scrollTop = before;
            return { count: items.length, reachable };
        }""")
        check("every nav destination is present", nav["count"] >= 17, f"count={nav['count']}")
        check("the last nav item is reachable", nav["reachable"])

        active = page_ui.evaluate("""() => {
            const a = document.querySelector('[data-nav-item="/admin"]');
            return a ? a.getAttribute('aria-current') : null;
        }""")
        check("current page marked with aria-current", active == "page", str(active))

        # The user card used to float with a strip of empty navy beneath it.
        card = page_ui.evaluate("""() => {
            const logout = [...document.querySelectorAll('button')]
              .find(b => b.textContent.trim() === 'Logout');
            const card = logout.closest('div').parentElement;
            const rail = card.parentElement;
            return {
              gap: Math.round(rail.getBoundingClientRect().bottom
                              - card.getBoundingClientRect().bottom),
              railFillsViewport:
                Math.round(rail.getBoundingClientRect().height) >= window.innerHeight - 1,
            };
        }""")
        check("sidebar fills the viewport height", card["railFillsViewport"])
        check("no empty strip below the user card", card["gap"] <= 1, f"gap={card['gap']}px")

        # --- announcement bar must be storefront-only -----------------------
        #
        # Enabling the bar in Admin -> Appearance made it render inside the
        # admin panel too, pushing the 100vh shell down and putting shop
        # marketing above the dashboard. The guard existed in the component but
        # NOTHING TESTED IT - no suite ever switched the bar on, so the fix was
        # never actually exercised. It is turned on here deliberately.
        BANNER = "PAGETEST ANNOUNCEMENT"
        st, _ = call("PUT", "/theme", admin, {
            "showAnnouncement": True,
            "announcementText": BANNER,
        })
        check("announcement bar can be enabled", st == 200, f"status={st}")

        for admin_path in ["/admin", "/admin/profile", "/admin/settings"]:
            page_ui.goto(f"{WEB}{admin_path}", wait_until="networkidle")
            page_ui.wait_for_timeout(1500)
            check(
                f"announcement bar hidden on {admin_path}",
                BANNER not in page_ui.inner_text("body"),
            )

        # ...and the admin shell must start flush at the top, not be pushed
        # down by a bar rendered above it.
        top = page_ui.evaluate(
            "() => Math.round(document.querySelector('[data-admin-shell]')"
            ".getBoundingClientRect().top)"
        )
        check("admin shell still starts at the top of the page", top <= 1, f"top={top}px")

        # --- storefront must still have its chrome --------------------------
        page_ui.goto(WEB, wait_until="networkidle")
        page_ui.wait_for_timeout(1500)
        sf = page_ui.evaluate("() => ({ footer: !!document.querySelector('footer') })")
        check("storefront still renders its footer", sf["footer"] is True)
        check("footer lists the published page",
              "Hello World" in page_ui.inner_text("body"))
        check("announcement bar DOES show on the storefront",
              BANNER in page_ui.inner_text("body"))

        # --- create a page through the real UI ------------------------------
        page_ui.goto(f"{WEB}/admin/pages", wait_until="networkidle")
        page_ui.wait_for_timeout(2000)
        check("Pages screen lists the page", f"{PREFIX}hello" in page_ui.inner_text("body"))

        # THE DEFAULT WORKFLOW - no boxes ticked.
        #
        # This previously ticked "Published" before saving, which is why it
        # never caught the real complaint: a page created the ordinary way
        # (New page -> type a title -> Create) defaulted to DRAFT and then
        # 404'd when the admin visited it. Testing my own assumption instead of
        # the user's path made a broken flow look covered.
        page_ui.get_by_role("button", name="+ New page").click()
        page_ui.wait_for_timeout(800)
        page_ui.get_by_label("Title", exact=True).fill("UI Made Page")
        page_ui.wait_for_timeout(300)

        slug_val = page_ui.get_by_label("Address (slug)", exact=True).input_value()
        check("slug auto-derives from the title", slug_val == "ui-made-page", slug_val)

        page_ui.get_by_label("Address (slug)", exact=True).fill(f"{PREFIX}ui")
        # Deliberately NOT touching the Published checkbox.
        page_ui.get_by_role("button", name="Create page").click()
        page_ui.wait_for_timeout(2500)

        check("save confirmation names the live address",
              f"/p/{PREFIX}ui" in page_ui.inner_text("body"))

        st, all_pages = call("GET", "/pages/all", admin)
        made = [p for p in all_pages["data"] if p["slug"] == f"{PREFIX}ui"]
        check("page created through the UI reached the database", len(made) == 1)
        if made:
            created.append(made[0]["id"])
            check("a page created the DEFAULT way is published",
                  made[0]["status"] == "published", made[0]["status"])
            code, body = web_status(f"/p/{PREFIX}ui")
            check("visiting a newly created page returns 200, not 404",
                  code == 200, f"status={code} — this was the reported bug")
            check("the new page renders its title", "UI Made Page" in body)

        # a duplicate slug must surface the server error, not a fake success
        page_ui.get_by_role("button", name="+ New page").click()
        page_ui.wait_for_timeout(800)
        page_ui.get_by_label("Title", exact=True).fill("Duplicate")
        page_ui.get_by_label("Address (slug)", exact=True).fill(f"{PREFIX}ui")
        page_ui.get_by_role("button", name="Create page").click()
        page_ui.wait_for_timeout(2500)
        check("duplicate slug shows the server's reason",
              "already exists" in page_ui.inner_text("body").lower())
        page_ui.get_by_role("button", name="Cancel").click()
        page_ui.wait_for_timeout(500)

        check("no console errors during normal use",
              not [c for c in console if "409" not in c and "Failed to load resource" not in c],
              "; ".join(console[:2]))

        b.close()

finally:
    # Put the announcement bar back how we found it. A suite that leaves the
    # storefront advertising "PAGETEST ANNOUNCEMENT" is worse than no suite.
    call("PUT", "/theme", admin, {"showAnnouncement": False, "announcementText": ""})

    for pid_ in created:
        call("DELETE", f"/pages/{pid_}", admin)
    # Belt and braces: remove anything left carrying the prefix.
    st, everything = call("GET", "/pages/all", admin)
    leftovers = [p for p in everything.get("data", []) if p["slug"].startswith(PREFIX)]
    for p in leftovers:
        call("DELETE", f"/pages/{p['id']}", admin)
    print(f"\n(cleanup: removed {len(set(created)) + len(leftovers)} fixture page(s))")

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
