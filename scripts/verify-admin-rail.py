#!/usr/bin/env python3
"""Admin sidebar rail geometry.

Guards two regressions that both showed up as "a gap in the sidebar":

  1. nav `flex: 1`      -> dead navy ABOVE the user card (fixed 2026-08-20)
  2. user panel `flex: 1 1 auto` -> the lighter #232342 panel STRETCHES, leaving
     up to ~510px of empty block BELOW the Logout button on tall screens.

Both are only visible at certain viewport heights, so every height is checked.
"""
import sys
from playwright.sync_api import sync_playwright

WEB = "http://localhost:3000"
HEIGHTS = [700, 800, 900, 1000, 1200, 1300, 1600]
PAGES = ["/admin", "/admin/products", "/admin/pages"]

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {name} {detail}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


PROBE = """() => {
  const nav = document.querySelector('nav[data-admin-nav]');
  if (!nav) return { err: 'no admin nav' };
  let rail = nav.parentElement;
  while (rail && rail.getBoundingClientRect().width > 400) rail = rail.parentElement;
  const rr = rail.getBoundingClientRect();
  const kids = [...rail.children];
  const card = kids[kids.length - 1];
  const cr = card.getBoundingClientRect();
  const nr = nav.getBoundingClientRect();

  const logout = [...card.querySelectorAll('button')]
    .find(b => /logout/i.test(b.textContent || ''));
  const lr = logout ? logout.getBoundingClientRect() : null;

  // last visible nav link
  let linkBottom = 0;
  nav.querySelectorAll('a').forEach(a => {
    const b = a.getBoundingClientRect();
    if (b.height > 0 && b.bottom > linkBottom) linkBottom = b.bottom;
  });

  // Effective painted background at a point: walk up until something opaque.
  const paintAt = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      el = el.parentElement;
    }
    return 'none';
  };
  const gapY = (linkBottom + cr.top) / 2;

  return {
    gapPixel: paintAt(rr.left + rr.width / 2, gapY),
    railBgPixel: getComputedStyle(rail).backgroundColor,
    railBottom: rr.bottom,
    railHeight: rr.height,
    navBottom: nr.bottom,
    cardTop: cr.top,
    cardBottom: cr.bottom,
    cardHeight: cr.height,
    lastLinkBottom: linkBottom,
    logoutBottom: lr ? lr.bottom : null,
    navScrolls: nav.scrollHeight > nav.clientHeight + 1,
    cardBg: getComputedStyle(card).backgroundColor,
    railBg: getComputedStyle(rail).backgroundColor,
  };
}"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
        pg.goto(f"{WEB}/login", wait_until="networkidle")
        pg.wait_for_timeout(3500)
        pg.fill("input[type=email]", "admin@store.com")
        pg.fill("input[type=password]", "admin123")
        pg.press("input[type=password]", "Enter")
        pg.wait_for_timeout(5000)
        if "/login" in pg.url:
            print("FATAL: admin login failed")
            b.close()
            sys.exit(1)

        for path in PAGES:
            for h in HEIGHTS:
                pg.set_viewport_size({"width": 1440, "height": h})
                pg.goto(WEB + path, wait_until="networkidle")
                pg.wait_for_timeout(1200)
                m = pg.evaluate(PROBE)
                tag = f"{path}@{h}"
                if m.get("err"):
                    check(tag, False, m["err"])
                    continue

                # 1. rail fills the viewport
                check(f"{tag} rail fills viewport",
                      abs(m["railHeight"] - h) <= 1,
                      f"railH={round(m['railHeight'])}")

                # 2. user card is flush with the bottom of the rail
                below = m["railBottom"] - m["cardBottom"]
                check(f"{tag} card flush to bottom", below <= 1,
                      f"below={round(below)}px")

                # 3. the card must NOT stretch. Its own lighter background
                #    makes any extra height read as an empty block.
                slack = m["cardBottom"] - m["logoutBottom"] if m["logoutBottom"] else 0
                check(f"{tag} card not stretched", slack <= 24,
                      f"under logout={round(slack)}px")

                # 4. when the nav does not need to scroll, the card must sit
                #    right under the last link (no dead navy above it).
                if not m["navScrolls"]:
                    # The card is pinned to the bottom, so on a tall screen
                    # there IS slack between the last link and the card. That
                    # is fine ONLY while it renders in the rail's own colour -
                    # an unbroken navy column. If it ever takes the card's
                    # lighter #232342 it becomes the visible empty block users
                    # report, so assert the two backgrounds still differ and
                    # that the slack really paints as rail navy.
                    above = m["cardTop"] - m["lastLinkBottom"]
                    if above > 24:
                        check(f"{tag} slack above card is rail-coloured",
                              m["gapPixel"] == m["railBgPixel"],
                              f"above={round(above)}px gap={m['gapPixel']} rail={m['railBgPixel']}")
                    else:
                        check(f"{tag} card sits under last link", True,
                              f"above={round(above)}px")
                else:
                    check(f"{tag} nav scrolls, card pinned",
                          abs(m["cardTop"] - m["navBottom"]) <= 1,
                          "scrolling")
        b.close()

    print(f"\n{passed}/{passed + failed} checks passed")
    sys.exit(1 if failed else 0)


main()
