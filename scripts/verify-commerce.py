"""Money and fulfilment rules: coupons, order lifecycle, stock.

These paths move real money and real inventory but had no coverage. Writing
this found a live bug: a fixed-amount coupon was not capped at the order
subtotal, so a 50 coupon on a 10 order returned a 50 discount - a negative
total, i.e. the shop paying the customer.

Everything here creates its own fixtures with a recognisable prefix and deletes
them in a finally block, so the suite is repeatable and leaves no residue.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "apps", "api")

PREFIX = "CMTEST"
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
    return d["data"]["accessToken"], d["data"]["user"]["id"]


def node(script, required=True):
    """Run a snippet against the API's Prisma client.

    `required=False` is used by cleanup. Raising from inside a finally block
    kills the interpreter with no traceback and no summary line - which is
    exactly what happened on CI: all 28 assertions passed, then the job exited
    1 with no output explaining why. Cleanup failures are now reported and
    swallowed.
    """
    try:
        proc = subprocess.run(["node", "-e", script], cwd=API_DIR,
                              capture_output=True, text=True, timeout=120)
    except Exception as e:  # noqa: BLE001
        if required:
            raise SystemExit(f"node helper could not run: {e}")
        print(f"  (cleanup helper could not run: {e})")
        return {}

    for line in reversed(proc.stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith("{") or line.startswith("["):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

    msg = (proc.stderr or proc.stdout or "no output")[:400]
    if required:
        raise SystemExit(f"node helper failed:\n{msg}")
    print(f"  (cleanup helper failed: {msg.splitlines()[0] if msg else 'unknown'})")
    return {}


def iso(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


admin, admin_id = login("admin@store.com", "admin123")
cust, cust_id = login("customer@example.com", "customer123")

created_coupons = []
created_orders = []


def make_coupon(suffix, **fields):
    body = {"code": f"{PREFIX}{suffix}", "isActive": True, **fields}
    st, d = call("POST", "/coupons", admin, body)
    if st in (200, 201):
        created_coupons.append(d["data"]["id"])
    return st, d


def validate(code, subtotal):
    st, d = call("POST", "/coupons/validate", body={"code": code, "subtotal": subtotal})
    return d.get("data", {})


try:
    # =====================================================================
    print("=== 1. coupon discount maths ===")
    # =====================================================================
    make_coupon("PCT10", type="percentage", value=10)
    v = validate(f"{PREFIX}PCT10", 200)
    check("10% of 200 is 20", v.get("valid") and abs(v.get("discount", 0) - 20) < 0.01,
          f"discount={v.get('discount')}")

    make_coupon("FIX25", type="fixed", value=25)
    v = validate(f"{PREFIX}FIX25", 200)
    check("fixed 25 off 200 is 25", abs(v.get("discount", 0) - 25) < 0.01,
          f"discount={v.get('discount')}")

    # The bug this suite found.
    v = validate(f"{PREFIX}FIX25", 10)
    check("fixed 25 is CAPPED at a 10 subtotal (no negative total)",
          abs(v.get("discount", 0) - 10) < 0.01,
          f"discount={v.get('discount')} — must not exceed the subtotal")

    make_coupon("CAP", type="percentage", value=50, maxDiscountAmount=30)
    v = validate(f"{PREFIX}CAP", 200)
    check("percentage respects maxDiscountAmount", abs(v.get("discount", 0) - 30) < 0.01,
          f"discount={v.get('discount')}")

    v = validate(f"{PREFIX}PCT10", 0)
    check("zero subtotal yields zero discount", (v.get("discount") or 0) == 0,
          f"discount={v.get('discount')}")

    # =====================================================================
    print()
    print("=== 2. coupon eligibility rules ===")
    # =====================================================================
    v = validate(f"{PREFIX}NOSUCHCODE", 100)
    check("unknown code is rejected", v.get("valid") is False, str(v.get("error")))

    make_coupon("INACTIVE", type="fixed", value=5, isActive=False)
    v = validate(f"{PREFIX}INACTIVE", 100)
    check("inactive coupon rejected", v.get("valid") is False, str(v.get("error")))

    make_coupon("EXPIRED", type="fixed", value=5, expiresAt=iso(-1))
    v = validate(f"{PREFIX}EXPIRED", 100)
    check("expired coupon rejected", v.get("valid") is False, str(v.get("error")))

    make_coupon("FUTURE", type="fixed", value=5, startsAt=iso(7))
    v = validate(f"{PREFIX}FUTURE", 100)
    check("not-yet-started coupon rejected", v.get("valid") is False, str(v.get("error")))

    make_coupon("MIN100", type="fixed", value=10, minOrderAmount=100)
    v = validate(f"{PREFIX}MIN100", 50)
    check("below minimum order amount rejected", v.get("valid") is False, str(v.get("error")))
    v = validate(f"{PREFIX}MIN100", 150)
    check("at or above the minimum accepted", v.get("valid") is True)

    # Case-insensitivity: shoppers type lowercase.
    v = validate(f"{PREFIX}PCT10".lower(), 100)
    check("codes are case-insensitive", v.get("valid") is True, str(v.get("error")))

    # =====================================================================
    print()
    print("=== 3. coupon authorisation ===")
    # =====================================================================
    st, _ = call("POST", "/coupons", None, {"code": f"{PREFIX}ANON", "type": "fixed", "value": 5})
    check("anonymous cannot create a coupon", st == 401, f"status={st}")
    st, _ = call("POST", "/coupons", cust, {"code": f"{PREFIX}CUST", "type": "fixed", "value": 5})
    check("customer cannot create a coupon", st in (401, 403), f"status={st}")
    st, _ = call("GET", "/coupons", cust)
    check("customer cannot list coupons", st in (401, 403), f"status={st}")
    st, _ = call("GET", "/coupons", admin)
    check("admin can list coupons", st == 200, f"status={st}")

    # =====================================================================
    print()
    print("=== 4. order lifecycle and stock ===")
    # =====================================================================
    # Pick a product that is actually in stock - relying on sort order is how
    # regression.sh became flaky.
    st, plist = call("GET", "/products?limit=50")
    stocked = [p for p in plist["data"]
               if (p.get("quantity") or 0) >= 3 and p.get("status") == "active"]
    check("a stocked product exists to order", bool(stocked))

    if stocked:
        prod = stocked[0]
        before_qty = prod["quantity"]

        st, d = call("POST", "/orders", cust, {
            "items": [{"productId": prod["id"], "quantity": 2}],
            "shippingAddress": {"firstName": "T", "lastName": "T", "address": "1 St",
                                "city": "C", "state": "S", "zipCode": "1",
                                "country": "US", "phone": "5"},
            "paymentMethod": "cod",
        })
        check("customer can place an order", st in (200, 201), f"status={st}")
        order = d.get("data", {})
        oid = order.get("id")
        if oid:
            created_orders.append(oid)

        if oid:
            st, after = call("GET", f"/products/{prod['id']}")
            new_qty = after.get("data", {}).get("quantity")
            check("stock is decremented by the quantity ordered",
                  new_qty == before_qty - 2, f"{before_qty} -> {new_qty}")

            # Over-ordering must be refused, not silently clamped.
            st, _ = call("POST", "/orders", cust, {
                "items": [{"productId": prod["id"], "quantity": 999999}],
                "shippingAddress": {"firstName": "T", "lastName": "T", "address": "1 St",
                                    "city": "C", "state": "S", "zipCode": "1",
                                    "country": "US", "phone": "5"},
                "paymentMethod": "cod",
            })
            check("ordering more than stock is refused", st >= 400, f"status={st}")

            st, chk = call("GET", f"/products/{prod['id']}")
            check("a refused order does not touch stock",
                  chk["data"]["quantity"] == new_qty,
                  f"qty={chk['data']['quantity']} expected={new_qty}")

            # Ownership.
            st, _ = call("GET", f"/orders/{oid}", None)
            check("anonymous cannot read an order", st == 401, f"status={st}")
            st, _ = call("GET", f"/orders/{oid}", cust)
            check("owner can read their own order", st == 200, f"status={st}")
            st, _ = call("GET", f"/orders/{oid}", admin)
            check("admin can read any order", st == 200, f"status={st}")

            # Status transitions are an admin capability.
            st, _ = call("PUT", f"/orders/{oid}/status", cust, {"status": "delivered"})
            check("customer cannot mark their order delivered", st in (401, 403),
                  f"status={st}")

            st, _ = call("PUT", f"/orders/{oid}/status", admin, {"status": "processing"})
            check("admin can advance order status", st == 200, f"status={st}")

            st, chk = call("GET", f"/orders/{oid}", admin)
            check("status change persisted",
                  chk["data"]["status"] == "processing", chk["data"]["status"])

            st, _ = call("PUT", f"/orders/{oid}/status", admin, {"status": "not-a-status"})
            check("invalid status rejected", st >= 400, f"status={st}")

finally:
    # Remove every fixture this suite created.
    #
    # Only touches rows this run is responsible for: coupons prefixed CMTEST,
    # and the single order id we captured. The previous version guessed by
    # timestamp ("orders created in the last 10 minutes"), which is both unsafe
    # on a shared database and unnecessary.
    for cid in created_coupons:
        call("DELETE", f"/coupons/{cid}", admin)

    cleanup = node("""
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const ids=%s;
(async()=>{
  let removed=0;
  for (const id of ids) {
    const o=await p.order.findUnique({where:{id},include:{items:true}});
    if (!o) continue;
    for (const it of o.items) {
      await p.product.update({where:{id:it.productId},
        data:{quantity:{increment:it.quantity}}}).catch(()=>{});
    }
    await p.orderItem.deleteMany({where:{orderId:id}});
    await p.payment.deleteMany({where:{orderId:id}});
    await p.order.delete({where:{id}}).catch(()=>{});
    removed++;
  }
  const c=await p.coupon.deleteMany({where:{code:{startsWith:'CMTEST'}}});
  console.log(JSON.stringify({removed,coupons:c.count}));
  await p.$disconnect();
})()""" % json.dumps(created_orders), required=False)

    print(f"\n(cleanup: removed {cleanup.get('removed', 0)} order(s), "
          f"{cleanup.get('coupons', 0)} coupon(s), restored stock)")

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
