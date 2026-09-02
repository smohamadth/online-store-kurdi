"""Bulk import/export (products & categories) end-to-end against a live API.

Covers the /api/import-export surface the admin UI drives:

1. Access control - export/preview/commit are admin+manager only.
2. Export - CSV with the full product header, JSON with nested
   variants/images, and the one-row sample template.
3. Preview - create/update/error classification, and that it writes
   nothing (the export row count is identical before and after).
4. Commit - a product with variants + images lands in the default
   "General" category; an all-or-nothing file with a missing category
   creates nothing; categories commit by slug-then-name matching.
5. Cleanup - every row the script creates is deleted again.

Run from the repo root with the API on :3001 (the CI api-checks job):

    python3 scripts/verify-import-export.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))


def call(method, path, token=None, body=None, raw=False):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        if raw:
            data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        else:
            data = json.dumps(body).encode()
    req = urllib.request.Request(f"{API}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            return r.status, (payload if raw else json.loads(payload or b"{}")), dict(r.headers)
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload or b"{}"), dict(e.headers)
        except Exception:  # noqa: BLE001
            return e.code, payload, dict(e.headers)


def login(email, password):
    status, data, _ = call("POST", "/auth/login", body={"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"login failed for {email}: {status} {data}")
    return data["data"]["accessToken"]


def csv_lines(text):
    # Minimal split for our own exports: the verify script never writes a
    # quoted newline itself, and product descriptions in the seed do not.
    return [line for line in text.splitlines() if line != ""]


def export_csv(token, entity, extra=""):
    status, payload, headers = call("GET", f"/import-export/export/{entity}{extra}", token, raw=True)
    return status, payload.decode() if isinstance(payload, (bytes, bytearray)) else payload, headers


def product_count(token):
    status, text, _ = export_csv(token, "products")
    if status != 200:
        return None
    return len(csv_lines(text)) - 1


PRODUCT_HEADERS = (
    "name,sku,slug,description,shortDescription,type,status,price,compareAtPrice,"
    "costPrice,trackInventory,quantity,lowStockThreshold,allowBackorder,backorderLimit,"
    "expectedRestockAt,downloadUrl,downloadLimit,downloadExpiry,weight,weightUnit,"
    "dimensions,category,metaTitle,metaDescription,metaKeywords,images,variants"
)

admin_token = login("admin@store.com", "admin123")
customer_token = login("customer@example.com", "customer123")

created_product_ids = []
created_category_ids = []

try:
    # -- 1. access control ------------------------------------------------
    status, _, _ = call("GET", "/import-export/export/products")
    check("export without a token is 401", status == 401, f"got {status}")
    status, _, _ = call("GET", "/import-export/export/products", customer_token)
    check("export for a customer is 403", status == 403, f"got {status}")
    status, _, _ = call(
        "POST", "/import-export/preview", customer_token,
        body={"entity": "products", "format": "csv", "text": "name,sku,price\nA,a,1"},
    )
    check("preview for a customer is 403", status == 403, f"got {status}")
    status, _, _ = export_csv(admin_token, "products")
    check("export for an admin is 200", status == 200, f"got {status}")

    # -- 2. export ---------------------------------------------------------
    status, csv_text, headers = export_csv(admin_token, "products")
    lines = csv_lines(csv_text)
    check("product CSV export is 200 with the full header",
          status == 200 and lines and lines[0] == PRODUCT_HEADERS,
          f"status {status}; header: {(lines or ['<empty>'])[0][:60]}")
    check("product CSV export is an attachment",
          "attachment" in (headers.get("Content-Disposition") or ""),
          str(headers.get("Content-Disposition")))
    check("product CSV export has at least one data row", len(lines) > 1, f"{len(lines)} lines")

    status, body, _ = call("GET", "/import-export/export/products?format=json", admin_token)
    check("product JSON export has entity/count/products",
          status == 200 and body.get("entity") == "products"
          and isinstance(body.get("products"), list)
          and body.get("count") == len(body["products"]),
          f"status {status}")
    with_nested = [p for p in body.get("products", []) if "variants" in p and "images" in p]
    check("product JSON export nests variants and images", len(with_nested) > 0,
          f"{len(with_nested)}/{len(body.get('products', []))} rows carry both keys")

    # A seeded SKU, taken from the JSON export (structured - no CSV
    # column-offset fragility) for the preview's update row.
    seeded_sku = (body.get("products") or [{}])[0].get("sku", "")
    check("a seeded product carries a SKU", bool(seeded_sku), seeded_sku)

    status, tpl, tpl_headers = export_csv(admin_token, "products", "?sample=1")
    tpl_lines = csv_lines(tpl)
    check("product template is header + one example row",
          status == 200 and len(tpl_lines) == 2 and "SKU-0001" in tpl_lines[1],
          f"{len(tpl_lines)} lines")
    check("template filename says template",
          "template" in (tpl_headers.get("Content-Disposition") or ""),
          str(tpl_headers.get("Content-Disposition")))

    status, cat_text, _ = export_csv(admin_token, "categories")
    cat_lines = csv_lines(cat_text)
    check("category CSV export has the header + seeded rows",
          status == 200 and cat_lines and cat_lines[0] == "name,slug,description,image,parent,isActive,sortOrder"
          and len(cat_lines) > 1,
          f"{len(cat_lines)} lines")

    status, _, _ = call("GET", "/import-export/export/orders", admin_token)
    check("unknown export entity is 400", status == 400, f"got {status}")

    # -- 3. preview ----------------------------------------------------------
    before = product_count(admin_token)
    preview_file = (
        "name,sku,price,category\n"
        f"IE Verify New,IE-VERIFY-NEW,10,General\n"
        f"Seeded Product,{seeded_sku},99,General\n"
        "IE Verify Bad,IE-VERIFY-BAD,not-a-number,General\n"
    )
    status, body, _ = call("POST", "/import-export/preview", admin_token,
                        body={"entity": "products", "format": "csv", "text": preview_file})
    data = body.get("data", {})
    check("preview classifies create/update/error",
          status == 200 and data.get("summary") == {"create": 1, "update": 1, "error": 1},
          json.dumps(data.get("summary")))
    rows = data.get("rows", [])
    bad = [r for r in rows if r.get("status") == "error"]
    check("the bad-price row carries the price error",
          bool(bad) and "price" in " ".join(bad[0].get("errors", [])),
          json.dumps(bad[:1]))
    after = product_count(admin_token)
    check("preview wrote nothing", before is not None and before == after,
          f"before {before}, after {after}")

    # -- 4. commit -----------------------------------------------------------
    # CSV quoting: a double quote inside a quoted cell is DOUBLED (""),
    # not backslash-escaped - building the cells by hand with JSON-style
    # \" escapes splits the row at the first comma.
    def csv_cell(value):
        s = str(value)
        return f'"{s.replace(chr(34), chr(34) * 2)}"' if any(c in s for c in ',"\n') else s

    variants_json = json.dumps(
        [{"name": "Small", "sku": "IE-VERIFY-W-S", "price": 4, "attributes": {"size": "S"}}]
    )
    images_json = json.dumps(
        [{"url": "/images/ie-verify-1.jpg", "alt": "One"}, {"url": "/images/ie-verify-2.jpg"}]
    )
    commit_file = (
        "name,sku,price,category,variants,images\n"
        + ",".join([
            csv_cell("IE Verify Widget"), csv_cell("IE-VERIFY-W"), "5", "General",
            csv_cell(variants_json), csv_cell(images_json),
        ])
        + "\n"
    )
    status, body, _ = call("POST", "/import-export/commit", admin_token,
                        body={"entity": "products", "format": "csv", "text": commit_file})
    data = body.get("data", {})
    check("commit creates the product with variants + images",
          status == 200 and data.get("created") == 1 and data.get("failed") == 0,
          json.dumps(data))

    status, body, _ = call("GET", "/products/slug/ie-verify-widget")
    prod = body.get("data", {}) if status == 200 else {}
    check("created product is public with its slug",
          status == 200 and prod.get("sku") == "IE-VERIFY-W",
          f"status {status}")
    check("created product carries both variants and images",
          len(prod.get("variants", [])) == 1 and len(prod.get("images", [])) == 2,
          f"variants {len(prod.get('variants', []))}, images {len(prod.get('images', []))}")
    check("first image is the primary",
          bool(prod.get("images")) and prod["images"][0].get("isPrimary") is True,
          json.dumps(prod.get("images", [])[:1]))

    # All-or-nothing: a file where one row's category does not exist.
    count_before = product_count(admin_token)
    oon_file = (
        "name,sku,price,category\n"
        "IE Verify Fine,IE-VERIFY-FINE,1,General\n"
        "IE Verify Missing Cat,IE-VERIFY-MC,2,No Such Category\n"
    )
    status, body, _ = call("POST", "/import-export/commit", admin_token,
                        body={"entity": "products", "format": "csv", "text": oon_file})
    data = body.get("data", {})
    check("all-or-nothing: nothing is applied when a row fails",
          status == 200 and data.get("created") == 0 and data.get("updated") == 0
          and data.get("failed", 0) >= 1
          and "category" in " ".join(data["errors"][0]["errors"]).lower(),
          json.dumps(data)[:160])
    count_after = product_count(admin_token)
    check("all-or-nothing: the export count is unchanged",
          count_before is not None and count_before == count_after,
          f"before {count_before}, after {count_after}")

    # Categories: create, then update by name case-insensitively.
    cat_file = (
        "name,slug,parent,sortOrder\n"
        "IE Verify Parent,ie-verify-parent,,1\n"
        "IE Verify Child,ie-verify-child,IE Verify Parent,2\n"
    )
    status, body, _ = call("POST", "/import-export/commit", admin_token,
                        body={"entity": "categories", "format": "csv", "text": cat_file})
    data = body.get("data", {})
    check("category commit creates parent + linked child",
          status == 200 and data.get("created") == 2 and data.get("failed") == 0,
          json.dumps(data))

    status, cat_text, _ = export_csv(admin_token, "categories")
    child_row = next((l for l in csv_lines(cat_text) if l.startswith("IE Verify Child,")), "")
    check("child category lists its parent in the export",
          ",IE Verify Parent," in child_row, child_row[:80])

    status, body, _ = call("POST", "/import-export/commit", admin_token, body={
        "entity": "categories", "format": "csv",
        "text": "name,slug,sortOrder\nIE VERIFY PARENT,ie-verify-parent,42\n",
    })
    data = body.get("data", {})
    check("category update matches case-insensitively",
          status == 200 and data.get("updated") == 1 and data.get("created") == 0,
          json.dumps(data))
    status, cat_text, _ = export_csv(admin_token, "categories")
    parent_row = next((l for l in csv_lines(cat_text) if l.startswith("IE VERIFY PARENT,")), "")
    check("updated category has the new sort order", parent_row.endswith(",42"), parent_row[:80])

    # -- 5. cleanup -----------------------------------------------------------
    status, body, _ = call("GET", "/products?limit=500", admin_token)
    for p in body.get("data", []):
        if str(p.get("sku", "")).startswith("IE-VERIFY-"):
            created_product_ids.append(p["id"])
    for pid in created_product_ids:
        status, _, _ = call("DELETE", f"/products/{pid}", admin_token)
        check(f"cleanup: deleted product {pid[:8]}", status in (200, 204), f"got {status}")

    status, body, _ = call("GET", "/categories", admin_token)
    for c in body.get("data", []):
        if str(c.get("slug", "")).startswith("ie-verify-"):
            created_category_ids.append(c["id"])
    for cid in created_category_ids:
        status, _, _ = call("DELETE", f"/categories/{cid}", admin_token)
        check(f"cleanup: deleted category {cid[:8]}", status in (200, 204), f"got {status}")
finally:
    # Never leave fixtures behind, even when a check above failed.
    for pid in created_product_ids:
        call("DELETE", f"/products/{pid}", admin_token)
    for cid in created_category_ids:
        call("DELETE", f"/categories/{cid}", admin_token)

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
