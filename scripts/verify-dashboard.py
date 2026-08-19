"""Admin dashboard: correct numbers, and honest empty states.

Two classes of bug are covered.

1. THE REPORTED BUG. The "Products" card read "No products yet" on a store with
   a full catalogue. topProducts is derived from OrderItem (best sellers), so a
   store that has not sold anything got an empty list and the UI announced the
   catalogue was empty. To a shop owner who has just added ten products that
   reads as data loss. The API now falls back to newest products and reports
   `topProductsBasis` so the UI can label the card truthfully.

2. NUMERIC CORRECTNESS. These figures were once invented in the browser with
   Math.random(), and totalUsers was hardcoded to 2. Every number is therefore
   checked against an independently computed expectation, not just "is present".
   Cancelled and refunded orders must NOT count toward revenue.

The suite mutates orders, so it snapshots the database first and restores it at
the end - a test that leaves the fixture changed fails on its own leftovers the
second time it runs.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "apps", "api")

results = []


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


def login(email, password):
    st, d = call("POST", "/auth/login", body={"email": email, "password": password})
    if st != 200:
        raise SystemExit(f"login failed for {email}: {st} {d}")
    return d["data"]["accessToken"]


def node(script: str, required: bool = True):
    """Run a snippet against the API's Prisma client and return parsed JSON.

    `required=False` for cleanup: raising from inside a finally block kills the
    interpreter with no traceback and no summary, which is how a run where all
    assertions passed still exited 1 on CI with nothing explaining why.
    """
    try:
        proc = subprocess.run(
            ["node", "-e", script],
            cwd=API_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception as e:  # noqa: BLE001
        if required:
            raise SystemExit(f"node helper could not run: {e}")
        print(f"  (cleanup helper could not run: {e})")
        return {}

    # Take the last JSON-looking line: Prisma may print log lines to stdout.
    for line in reversed(proc.stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith("{") or line.startswith("["):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

    msg = (proc.stderr or proc.stdout or "no output")[:400]
    if required:
        raise SystemExit(f"node helper produced no JSON:\n{msg}")
    print(f"  (cleanup helper failed: {msg.splitlines()[0] if msg else 'unknown'})")
    return {}


admin = login("admin@store.com", "admin123")

# --- snapshot orders so this suite is repeatable ------------------------------
SNAPSHOT = node("""
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const orders=await p.order.findMany({include:{items:true,payments:true}});
  console.log(JSON.stringify(orders));
  await p.$disconnect();
})()""")
print(f"(snapshotted {len(SNAPSHOT)} order(s) for restore)\n")


def restore_orders(required: bool = True):
    node(
        """
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const snap=%s;
(async()=>{
  await p.orderItem.deleteMany({}); await p.payment.deleteMany({}); await p.order.deleteMany({});
  for (const o of snap) {
    const {items, payments, ...order} = o;
    await p.order.create({data:{...order,
      items:{create:items.map(({orderId,...i})=>i)},
      payments:{create:payments.map(({orderId,...x})=>x)}}});
  }
  console.log(JSON.stringify({restored:snap.length}));
  await p.$disconnect();
})()"""
        % json.dumps(SNAPSHOT),
        required=required,
    )


try:
    # =========================================================================
    print("=== 1. store WITH sales: real best sellers ===")
    # =========================================================================
    st, payload = call("GET", "/dashboard/stats", admin)
    check("GET /dashboard/stats returns 200", st == 200, f"status={st}")
    d = payload.get("data", {})

    truth = node("""
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const REV=['pending','processing','shipped','delivered'];
  const [products,customers,orders,rev] = await Promise.all([
    p.product.count(),
    p.user.count({where:{role:'customer'}}),
    p.order.count(),
    p.order.aggregate({where:{status:{in:REV}},_sum:{totalAmount:true}}),
  ]);
  console.log(JSON.stringify({products,customers,orders,revenue:rev._sum.totalAmount||0}));
  await p.$disconnect();
})()""")

    check("totalProducts matches the database",
          d.get("totalProducts") == truth["products"],
          f"api={d.get('totalProducts')} db={truth['products']}")
    check("totalCustomers matches the database",
          d.get("totalCustomers") == truth["customers"],
          f"api={d.get('totalCustomers')} db={truth['customers']}")
    check("totalOrders matches the database",
          d.get("totalOrders") == truth["orders"],
          f"api={d.get('totalOrders')} db={truth['orders']}")
    check("totalRevenue matches the database",
          abs((d.get("totalRevenue") or 0) - truth["revenue"]) < 0.01,
          f"api={d.get('totalRevenue')} db={truth['revenue']}")

    if truth["orders"] > 0:
        check("basis is 'sales' when orders exist",
              d.get("topProductsBasis") == "sales", str(d.get("topProductsBasis")))
        check("best sellers report real units sold",
              all((p.get("sold") or 0) > 0 for p in d.get("topProducts", [])),
              str([(p["name"], p["sold"]) for p in d.get("topProducts", [])]))

    # =========================================================================
    print()
    print("=== 2. cancelled orders must not count as revenue ===")
    # =========================================================================
    before = call("GET", "/dashboard/stats", admin)[1]["data"]["totalRevenue"]
    node("""
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const u=await p.user.findFirst({where:{role:'customer'}});
  await p.order.create({data:{orderNumber:'DASH-CANCELLED-1',userId:u.id,status:'cancelled',
    subtotal:500,taxAmount:0,shippingAmount:0,discountAmount:0,totalAmount:500,
    paymentStatus:'pending',paymentMethod:'cod'}});
  console.log(JSON.stringify({ok:true}));
  await p.$disconnect();
})()""")
    after = call("GET", "/dashboard/stats", admin)[1]["data"]["totalRevenue"]
    check("a cancelled 500 order does not change revenue",
          abs(after - before) < 0.01, f"before={before} after={after}")

    counted = call("GET", "/dashboard/stats", admin)[1]["data"]["totalOrders"]
    check("but it IS counted in totalOrders", counted == truth["orders"] + 1,
          f"orders={counted}")

    # =========================================================================
    print()
    print("=== 3. THE REPORTED BUG: catalogue full, zero sales ===")
    # =========================================================================
    node("""
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  await p.orderItem.deleteMany({}); await p.payment.deleteMany({}); await p.order.deleteMany({});
  console.log(JSON.stringify({orders:await p.order.count(),products:await p.product.count()}));
  await p.$disconnect();
})()""")

    st, payload = call("GET", "/dashboard/stats", admin)
    d = payload["data"]
    check("store still reports its products", (d.get("totalProducts") or 0) > 0,
          f"totalProducts={d.get('totalProducts')}")
    check("basis switches to 'newest' with no sales",
          d.get("topProductsBasis") == "newest", str(d.get("topProductsBasis")))
    check("product list is NOT empty when the catalogue has products",
          len(d.get("topProducts", [])) > 0,
          f"returned {len(d.get('topProducts', []))} — this was the bug")
    check("fallback entries report zero sold, not fake sales",
          all((p.get("sold") or 0) == 0 for p in d.get("topProducts", [])))
    check("fallback entries carry a real price",
          all((p.get("price") or 0) > 0 for p in d.get("topProducts", [])))
    check("recentOrders is empty with no orders", d.get("recentOrders") == [])

    # ---- UI in that exact state --------------------------------------------
    print()
    print("=== 4. dashboard UI, catalogue full + zero sales ===")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        console = []
        page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

        page.goto(f"{WEB}/login", wait_until="networkidle")
        page.fill('input[type="email"]', "admin@store.com")
        page.fill('input[type="password"]', "admin123")
        page.get_by_role("button", name="Sign In", exact=True).click()
        page.wait_for_timeout(3500)

        page.goto(f"{WEB}/admin", wait_until="networkidle")
        page.wait_for_timeout(2500)
        body = page.inner_text("body")

        check("does NOT claim 'No products yet' with a full catalogue",
              "No products yet" not in body)
        check("labels the card 'Latest products'", "Latest products" in body)
        check("explains why it is not best sellers", "No sales yet" in body)
        check("lists a real product name", "iPhone 15 Pro" in body or "MacBook" in body)
        check("orders card still says 'No orders yet'", "No orders yet" in body)
        check("orders empty state is actionable",
              "as soon as a customer checks out" in body)
        check("no console errors", len(console) == 0, "; ".join(console[:2]))

        # ---- and with sales, the heading flips back ------------------------
        print()
        print("=== 5. UI switches back to best sellers once a sale exists ===")
        restore_orders()
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2500)
        body2 = page.inner_text("body")
        has_orders = len(SNAPSHOT) > 0
        if has_orders:
            check("heading becomes 'Best sellers'", "Best sellers" in body2)
            check("subtitle becomes 'Ranked by revenue'", "Ranked by revenue" in body2)
            check("shows 'sold' counts", "sold" in body2)
        else:
            print("  SKIP - no orders in the snapshot to restore")

        b.close()

    # =========================================================================
    print()
    print("=== 6. authorisation ===")
    # =========================================================================
    st, _ = call("GET", "/dashboard/stats")
    check("anonymous request blocked (401)", st == 401, f"status={st}")
    cust = login("customer@example.com", "customer123")
    st, _ = call("GET", "/dashboard/stats", cust)
    check("customer cannot read store KPIs (403)", st == 403, f"status={st}")

finally:
    # Always leave the database as we found it.
    node("""
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  await p.order.deleteMany({where:{orderNumber:{startsWith:'DASH-'}}});
  console.log(JSON.stringify({ok:true}));
  await p.$disconnect();
})()""", required=False)
    restore_orders(required=False)

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
