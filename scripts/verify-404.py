"""HTTP status codes for known and unknown URLs.

Guards the soft-404 fix (KNOWN_GAPS.md section 7): unknown category and product
slugs must return a real HTTP 404, not 200, while every real page keeps its 200.

Also asserts the not-found page still renders the site chrome, because the fix
lives in middleware and an earlier attempt served bare HTML that lost the
header, footer and theme entirely.
"""
import os
import sys
import urllib.request
import urllib.error

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))


def get(path):
    """Return (status, body). urllib raises on 4xx/5xx, so catch and unwrap."""
    req = urllib.request.Request(f"{WEB}{path}", headers={"User-Agent": "verify-404"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


# --- real pages must stay 200 -------------------------------------------------
# The fix touched the root layout and added middleware, so this list is
# deliberately broad: a regression here means the refactor broke the site.
OK_PAGES = [
    "/",
    "/products",
    "/products/category/clothing",
    "/category/clothing",
    "/category/electronics",
    "/products/classic-t-shirt",
    "/cart",
    "/checkout",
    "/login",
    "/register",
    "/deals",
    "/search",
    "/contact",
    "/faq",
    "/returns",
    "/privacy",
    "/terms",
    "/track-order",
    "/forgot-password",
]

print("=== pages that must return 200 ===")
broken = []
for path in OK_PAGES:
    status, _ = get(path)
    if status != 200:
        broken.append(f"{path}={status}")
    print(f"  {'OK  ' if status == 200 else 'FAIL'} {path:<34} {status}")
check(f"{len(OK_PAGES)} real pages return 200", not broken, ", ".join(broken))

# --- unknown URLs must return a real 404 -------------------------------------
print()
print("=== URLs that must return 404 ===")
NOT_FOUND = [
    "/category/no-such-category",
    "/category/another-fake-one",
    "/products/no-such-product",
    "/products/definitely-not-real",
    "/totally-unknown-route",
]
soft = []
for path in NOT_FOUND:
    status, _ = get(path)
    if status != 404:
        soft.append(f"{path}={status}")
    print(f"  {'OK  ' if status == 404 else 'FAIL'} {path:<34} {status}")
check("unknown URLs return HTTP 404 (not a soft 404)", not soft, ", ".join(soft))

# --- the 404 page must still look like the site ------------------------------
print()
print("=== 404 page still renders the site chrome ===")
status, body = get("/category/no-such-category")
check("404 body renders the not-found message", "Page not found" in body)
check("404 body keeps the site header/footer", body.count("My Store") >= 2,
      f"occurrences={body.count('My Store')}")
check("404 body links back into the store", "Browse all products" in body)

# Next injects noindex on 404 responses; belt-and-braces since crawlers use it.
check("404 is marked noindex", "noindex" in body)

# --- a valid page must NOT be marked noindex ---------------------------------
status, body_ok = get("/category/clothing")
check("valid category is indexable", "noindex" not in body_ok)

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
