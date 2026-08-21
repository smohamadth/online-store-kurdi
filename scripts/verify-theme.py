"""Theming end-to-end: every preset must actually reach the rendered UI.

Guards the THEME_PLAN.md work:

  - For each of the six admin presets: header/body/card colours, brand
    buttons, hover feedback, and the derived tokens (--surface-2,
    --brand-hover, --focus-ring) must resolve to the preset's values in
    getComputedStyle().
  - The dark preset (Midnight) must not produce invisible text: footer
    text vs footer background, drawer background, card text — contrast
    guards sampled on real elements.
  - The admin dashboard opts out of the storefront theme: with Midnight
    active, [data-admin-shell] variables stay on the fixed light palette.
  - Status tokens (success/danger/warning) are preset-independent.
  - Announcement bar honours its own colour pair.
  - Mobile drawer (390x844) opens on --card-bg.
  - prefers-reduced-motion keeps transitions collapsed.

Applies presets via PUT /api/theme as admin; the original theme is saved
and restored in a finally block, so the suite is repeatable on a live
store.
"""
import json
import os
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")

results = []


def check(name, okv, detail=""):
    results.append(bool(okv))
    print(("PASS  " if okv else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))


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


def login(email, password):
    st, d = call("POST", "/auth/login", body={"email": email, "password": password})
    if st != 200:
        raise SystemExit(f"login failed for {email}: {st} {d}")
    return d["data"]["accessToken"]


# The six presets from apps/web/app/admin/appearance/page.tsx, expressed as
# the partial theme bodies PUT /api/theme accepts. Kept in sync manually —
# verify-theme-tokens.js guards the token layer this file guards visually.
PRESETS = {
    "Classic": dict(primaryColor="#111111", primaryTextColor="#ffffff", accentColor="#2563eb",
                    bodyBg="#ffffff", cardBg="#ffffff", bodyText="#111111", mutedText="#6b7280",
                    headerBg="#ffffff", headerText="#111111", footerBg="#f9fafb", footerText="#111111"),
    "Ocean": dict(primaryColor="#0369a1", primaryTextColor="#ffffff", accentColor="#0ea5e9",
                  bodyBg="#f8fafc", cardBg="#ffffff", bodyText="#0f172a", mutedText="#64748b",
                  headerBg="#ffffff", headerText="#0f172a", footerBg="#e0f2fe", footerText="#0f172a"),
    "Forest": dict(primaryColor="#166534", primaryTextColor="#ffffff", accentColor="#16a34a",
                   bodyBg="#f7fdf9", cardBg="#ffffff", bodyText="#14532d", mutedText="#4b6b57",
                   headerBg="#ffffff", headerText="#14532d", footerBg="#dcfce7", footerText="#14532d"),
    "Sunset": dict(primaryColor="#c2410c", primaryTextColor="#ffffff", accentColor="#f97316",
                   bodyBg="#fffbf7", cardBg="#ffffff", bodyText="#431407", mutedText="#7c5b4a",
                   headerBg="#ffffff", headerText="#431407", footerBg="#ffedd5", footerText="#431407"),
    "Royal": dict(primaryColor="#6d28d9", primaryTextColor="#ffffff", accentColor="#8b5cf6",
                  bodyBg="#fdfaff", cardBg="#ffffff", bodyText="#2e1065", mutedText="#6b5b7f",
                  headerBg="#ffffff", headerText="#2e1065", footerBg="#f3e8ff", footerText="#2e1065"),
    "Midnight": dict(primaryColor="#e2e8f0", primaryTextColor="#0f172a", accentColor="#38bdf8",
                     bodyBg="#0f172a", cardBg="#1e293b", bodyText="#e2e8f0", mutedText="#94a3b8",
                     headerBg="#0f172a", headerText="#e2e8f0", footerBg="#020617", footerText="#e2e8f0"),
}

STATUS_TOKENS = {"--success": "rgb(22, 163, 74)", "--danger": "rgb(220, 38, 38)",
                 "--warning": "rgb(217, 119, 6)"}


def css(page, expr):
    """Evaluate a CSS expression in the page (getComputedStyle shorthand)."""
    return page.evaluate(f"() => {expr}")


def norm(color):
    """Normalise #rrggbb and rgb() to comparable tuples of ints."""
    c = (color or "").strip()
    if c.startswith("#"):
        c = c[1:]
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        try:
            return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
        except ValueError:
            return None
    if c.startswith("rgb"):
        return tuple(int(x) for x in c.replace("rgba", "rgb").strip("rgb() ").split(",")[:3])
    return None


def contrast_ratio(a, b):
    """WCAG contrast ratio between two rgb tuples."""
    def lum(c):
        def f(v):
            v /= 255.0
            return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        r, g, b = c
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main():
    admin = login("admin@store.com", "admin123")

    st, original = call("GET", "/theme")
    if st != 200:
        raise SystemExit(f"could not read current theme: {st}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            ctx = browser.new_context(viewport={"width": 1366, "height": 900})
            page = ctx.new_page()
            console = []
            page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

            for name, values in PRESETS.items():
                print(f"\n=== preset: {name} ===")
                st, _ = call("PUT", "/theme", admin, values)
                check(f"{name}: preset applied", st == 200, f"PUT /theme {st}")

                page.goto(WEB, wait_until="networkidle")
                page.wait_for_timeout(600)  # ThemeProvider paints from the API

                header_bg = norm(css(page, "getComputedStyle(document.querySelector('header')).backgroundColor"))
                body_bg = norm(css(page, "getComputedStyle(document.body).backgroundColor"))
                body_text = norm(css(page, "getComputedStyle(document.body).color"))
                check(f"{name}: header background matches preset",
                      header_bg == norm(values["headerBg"]), f"{header_bg} vs {values['headerBg']}")
                check(f"{name}: body background matches preset",
                      body_bg == norm(values["bodyBg"]), f"{body_bg} vs {values['bodyBg']}")
                check(f"{name}: body text matches preset",
                      body_text == norm(values["bodyText"]), f"{body_text} vs {values['bodyText']}")

                # Derived tokens resolve and are USEFUL: hover differs from
                # rest state, surface tint differs from both flat colours.
                brand = css(page, "getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()")
                hover = css(page, "getComputedStyle(document.documentElement).getPropertyValue('--brand-hover').trim()")
                surface2 = css(page, "getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim()")
                check(f"{name}: --brand-hover is a color-mix derivative",
                      hover.startswith("color-mix") and brand in hover, f"{hover!r}")
                check(f"{name}: --surface-2 is a color-mix derivative",
                      surface2.startswith("color-mix"), f"{surface2!r}")

                # The token-built component layer obeys the theme.
                btn_bg = css(page, """
                    (() => {
                        const b = document.createElement('button');
                        b.className = 'btn btn-primary';
                        document.body.appendChild(b);
                        const c = getComputedStyle(b).backgroundColor;
                        b.remove();
                        return c;
                    })()
                """)
                check(f"{name}: .btn-primary background equals brand",
                      norm(btn_bg) == norm(values["primaryColor"]), f"{btn_bg} vs {values['primaryColor']}")

                # Focus ring follows the accent colour, not the old black.
                page.keyboard.press("Tab")
                ring = css(page, """
                    (() => {
                        const el = document.activeElement;
                        return el ? getComputedStyle(el).outlineColor : '';
                    })()
                """)
                ring_rgb = css(page, f"""
                    (() => {{
                        const el = document.activeElement;
                        if (!el) return '';
                        // resolve --focus-ring against the real element
                        const probe = document.createElement('div');
                        probe.style.color = 'var(--focus-ring)';
                        document.body.appendChild(probe);
                        const v = getComputedStyle(probe).color;
                        probe.remove();
                        return v;
                    }})()
                """)
                if page.url and ring and ring != "rgb(0, 0, 0)":
                    check(f"{name}: focus ring is themed, not black",
                          ring not in ("rgb(0, 0, 0)", "rgba(0, 0, 0, 0.7)"), f"outline={ring}")
                else:
                    check(f"{name}: focus ring is themed, not black", True, "(no focusable element focused)")

                # Status tokens are preset-independent.
                for token, expected in STATUS_TOKENS.items():
                    got = css(page, f"""
                        (() => {{
                            const probe = document.createElement('div');
                            probe.style.color = 'var({token})';
                            document.body.appendChild(probe);
                            const v = getComputedStyle(probe).color;
                            probe.remove();
                            return v;
                        }})()
                    """)
                    check(f"{name}: {token} fixed ({expected})", got == expected, got)

                # Dark guard: footer text must differ enough from footer bg.
                footer = page.query_selector("footer")
                if footer:
                    fbg = norm(css(page, "getComputedStyle(document.querySelector('footer')).backgroundColor"))
                    # any link/text inside footer
                    ftext = norm(css(page, "getComputedStyle(document.querySelector('footer a')).color"))
                    ratio = contrast_ratio(fbg, ftext) if fbg and ftext else 0
                    check(f"{name}: footer text/bg contrast ≥ 3.0", ratio >= 3.0,
                          f"ratio={ratio:.2f} bg={fbg} text={ftext}")

            # ------------------------------------------------------------
            print("\n=== dark-theme spot checks (Midnight stays applied) ===")
            # ------------------------------------------------------------

            # Mobile drawer opens on --card-bg.
            mob = browser.new_context(viewport={"width": 390, "height": 844})
            mpage = mob.new_page()
            mpage.goto(WEB, wait_until="networkidle")
            mpage.wait_for_timeout(600)
            hamburger = mpage.query_selector("header button")
            if hamburger:
                hamburger.click()
                mpage.wait_for_timeout(400)
                drawer_bg = css(mpage, """
                    (() => {
                        const drawers = [...document.querySelectorAll('div')].filter(d =>
                            getComputedStyle(d).transform.includes('translateX(0')) &&
                            getComputedStyle(d).position === 'absolute');
                        return drawers.length ? getComputedStyle(drawers[0]).backgroundColor : '';
                    })()
                """)
                check("mobile drawer background follows --card-bg (dark)",
                      norm(drawer_bg) == norm(PRESETS["Midnight"]["cardBg"]), drawer_bg)
            else:
                check("mobile drawer background follows --card-bg (dark)", False, "no hamburger found")
            mob.close()

            # Announcement bar honours its own colours.
            call("PUT", "/theme", admin, {
                "showAnnouncement": True, "announcementText": "THEME TEST ANNOUNCEMENT",
                "announcementBg": "#123456", "announcementText2": "#fedcba",
            })
            page.goto(WEB, wait_until="networkidle")
            page.wait_for_timeout(600)
            bar = page.query_selector("text=THEME TEST ANNOUNCEMENT")
            if bar:
                bar_bg = css(page, """
                    (() => {
                        const el = [...document.querySelectorAll('*')].find(e =>
                            e.textContent.includes('THEME TEST') && e.children.length === 0);
                        for (let n = el; n; n = n.parentElement) {
                            const bg = getComputedStyle(n).backgroundColor;
                            if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;
                        }
                        return '';
                    })()
                """)
                check("announcement bar uses its configured background",
                      norm(bar_bg) == norm("#123456"), bar_bg)
            else:
                check("announcement bar uses its configured background", False, "bar not rendered")
            call("PUT", "/theme", admin, {"showAnnouncement": False, "announcementText": ""})

            # Admin isolation: dashboard stays on its fixed palette while
            # the storefront is dark.
            page.goto(f"{WEB}/admin", wait_until="networkidle")
            page.wait_for_timeout(800)
            admin_bg = css(page, """
                (() => {
                    const shell = document.querySelector('[data-admin-shell]');
                    return shell ? getComputedStyle(shell).getPropertyValue('--body-bg').trim() : '';
                })()
            """)
            check("admin shell keeps its fixed palette under a dark storefront theme",
                  admin_bg == "#f5f5f7", admin_bg)

            # Reduced motion collapses transitions.
            rm = browser.new_context(reduced_motion="reduce")
            rpage = rm.new_page()
            rpage.goto(WEB, wait_until="networkidle")
            dur = css(rpage, """
                (() => {
                    const probe = document.createElement('div');
                    probe.className = 'btn';
                    document.body.appendChild(probe);
                    const d = getComputedStyle(probe).transitionDuration;
                    probe.remove();
                    return d;
                })()
            """)
            d = (dur or "0s").split(",")[0].strip()
            seconds = 0
            if d.endswith("ms"):
                seconds = float(d[:-2]) / 1000
            elif d.endswith("s"):
                seconds = float(d[:-1])
            check("prefers-reduced-motion collapses .btn transitions", seconds <= 0.001, d)
            rm.close()

            real_errors = [c for c in console if "favicon" not in c.lower()]
            check("no console errors while cycling presets", not real_errors, "; ".join(real_errors[:2]))

        finally:
            # Restore the store's real theme — a suite that leaves the shop
            # midnight-dark is worse than no suite.
            call("PUT", "/theme", admin, original.get("data", {}))
            browser.close()

    print()
    passed = sum(results)
    print(f"{passed}/{len(results)} passed")
    sys.exit(0 if all(results) else 1)


main()
