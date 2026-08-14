"""Proves the home gallery is editable and persists to the database."""
import re, sys
from playwright.sync_api import sync_playwright
WEB="http://127.0.0.1:3000"
res=[]
def check(n,ok,d=""):
    res.append(ok); print(("PASS  " if ok else "FAIL  ")+n+(f"  -- {d}" if d else ""))

with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1500,"height":1100}); pg=ctx.new_page()
    con=[]; pg.on("console",lambda m: con.append(m.text) if m.type=="error" else None)

    pg.goto(WEB,wait_until="networkidle"); pg.wait_for_timeout(1800)
    check("gallery renders on home page", pg.locator("h2").filter(has_text=re.compile("From our shop|Erbil")).count()>0)
    check("placeholder tiles have captions", any(c in pg.inner_text("body") for c in ["New season arrivals","Hand-picked stock"]))

    pg.goto(f"{WEB}/login",wait_until="networkidle")
    pg.fill('input[type="email"]',"admin@store.com"); pg.fill('input[type="password"]',"admin123")
    pg.get_by_role("button",name="Sign In",exact=True).click(); pg.wait_for_timeout(3500)

    pg.goto(f"{WEB}/admin/appearance",wait_until="networkidle")
    pg.get_by_role("button",name=re.compile("Home page")).click(); pg.wait_for_timeout(2500)
    check("gallery block in builder", pg.locator('[data-home-row="gallery"]').count()==1)

    row=pg.locator('[data-home-row="gallery"]')
    # state-independent: previous runs may have left it hidden or renamed
    cb0=row.locator('input[type="checkbox"]').first
    if not cb0.is_checked():
        cb0.click(); pg.wait_for_timeout(2000)

    def open_editor():
        """Idempotent: the toggle label flips to Close once the panel is open."""
        if row.get_by_role("button", name="Edit").count():
            row.get_by_role("button", name="Edit").click()
            pg.wait_for_timeout(1200)

    open_editor()

    NEW="Inside our Erbil store"
    row.locator('input[placeholder="Leave empty to hide the heading"]').fill(NEW)
    row.get_by_label("Gallery caption 1").fill("Hand-picked stock")
    row.get_by_role("button",name="Save this block").click(); pg.wait_for_timeout(2800)

    # fresh context: no shared localStorage, so this can only come from the DB
    sf=b.new_context(viewport={"width":1400,"height":1000}).new_page()
    sf.goto(WEB,wait_until="networkidle"); sf.wait_for_timeout(2000)
    body=sf.inner_text("body")
    check("edited heading persisted to a FRESH browser", NEW in body)
    check("edited caption persisted", "Hand-picked stock" in body)

    # add a tile
    n_before=row.get_by_role("button",name="Remove image").count()
    row.get_by_role("button",name="+ Add image").click(); pg.wait_for_timeout(400)
    row.get_by_label(f"Gallery caption {n_before+1}").fill("Gift wrapping")
    row.get_by_role("button",name="Save this block").click(); pg.wait_for_timeout(2800)
    sf.reload(wait_until="networkidle"); sf.wait_for_timeout(1500)
    check("newly added tile persisted","Gift wrapping" in sf.inner_text("body"))

    # switch layout to grid
    open_editor()
    row.locator("select").first.select_option("grid")
    row.get_by_role("button",name="Save this block").click(); pg.wait_for_timeout(2800)
    sf.reload(wait_until="networkidle"); sf.wait_for_timeout(1500)
    grid=sf.evaluate("""()=>{
      const h=[...document.querySelectorAll('h2')].find(e=>e.textContent.includes('Erbil'));
      if(!h) return null;
      const c=h.parentElement.nextElementSibling;
      return getComputedStyle(c).display;}""")
    check("layout switch persisted (grid)", grid=="grid", str(grid))

    # hide it
    cb=row.locator('input[type="checkbox"]').first
    cb.click(); pg.wait_for_timeout(2500)
    sf.reload(wait_until="networkidle"); sf.wait_for_timeout(1500)
    check("hiding removes it from storefront", NEW not in sf.inner_text("body"))
    cb.click(); pg.wait_for_timeout(2000)

    check("no console errors", len(con)==0, "; ".join(con[:2]))
    b.close()
print(f"\n{sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
