"""Admin Users page: editing works and privilege guards hold.

Covers two things that were both broken:

1. PUT /api/users/:id accepted `role` and `isActive`, returned HTTP 200 with a
   success payload, and silently DISCARDED them - the route destructured only
   {firstName, lastName, phone, avatar}. KNOWN_GAPS.md claimed "the API works,
   only the UI is missing", which was wrong.

2. The admin Users page was read-only, so none of it was reachable anyway.

The API-level assertions matter more than the UI ones: they are what stops a
customer promoting themselves to admin.
"""
import json
import os
import sys
import urllib.error
import urllib.request

import re
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")

results = []


def check(name, ok, detail=""):
    results.append(ok)
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
    status, data = call("POST", "/auth/login", body={"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"login failed for {email}: {status} {data}")
    return data["data"]["accessToken"], data["data"]["user"]["id"]


admin_token, admin_id = login("admin@store.com", "admin123")
cust_token, cust_id = login("customer@example.com", "customer123")

_, listing = call("GET", "/users", admin_token)
users = listing["data"]
by_email = {u["email"]: u for u in users}

print("=== API: changes actually persist ===")

# role
call("PUT", f"/users/{cust_id}", admin_token, {"role": "manager"})
_, after = call("GET", "/users", admin_token)
role_now = next(u["role"] for u in after["data"] if u["id"] == cust_id)
check("admin can change a user's role", role_now == "manager", f"role={role_now}")

# isActive
call("PUT", f"/users/{cust_id}", admin_token, {"isActive": False})
_, after = call("GET", "/users", admin_token)
active_now = next(u["isActive"] for u in after["data"] if u["id"] == cust_id)
check("admin can deactivate a user", active_now is False, f"isActive={active_now}")

# names
call("PUT", f"/users/{cust_id}", admin_token, {"firstName": "Zara", "lastName": "Test"})
_, after = call("GET", "/users", admin_token)
u = next(x for x in after["data"] if x["id"] == cust_id)
check("admin can rename a user", u["firstName"] == "Zara" and u["lastName"] == "Test")

# restore
call("PUT", f"/users/{cust_id}", admin_token,
     {"role": "customer", "isActive": True, "firstName": "Jane", "lastName": "Doe"})

print()
print("=== API: privilege guards ===")

status, body = call("PUT", f"/users/{cust_id}", admin_token, {"role": "superadmin"})
check("invalid role rejected with 400", status == 400, f"status={status}")

status, _ = call("PUT", f"/users/{admin_id}", admin_token, {"role": "customer"})
check("admin cannot change their OWN role", status == 400, f"status={status}")

status, _ = call("PUT", f"/users/{admin_id}", admin_token, {"isActive": False})
check("admin cannot deactivate THEMSELVES", status == 400, f"status={status}")

# The important one: a customer must not be able to promote themselves.
call("PUT", f"/users/{cust_id}", cust_token, {"role": "admin"})
_, after = call("GET", "/users", admin_token)
role_now = next(x["role"] for x in after["data"] if x["id"] == cust_id)
check("customer CANNOT self-promote to admin", role_now == "customer", f"role={role_now}")

call("PUT", f"/users/{cust_id}", cust_token, {"isActive": False})
_, after = call("GET", "/users", admin_token)
active_now = next(x["isActive"] for x in after["data"] if x["id"] == cust_id)
check("customer CANNOT deactivate via self-update", active_now is True)

status, _ = call("PUT", f"/users/{admin_id}", cust_token, {"firstName": "Hacked"})
check("customer cannot edit another user (403)", status == 403, f"status={status}")

status, _ = call("PUT", f"/users/{cust_id}", cust_token, {"firstName": "Jane"})
check("customer CAN still edit their own name", status == 200, f"status={status}")

status, _ = call("PUT", f"/users/{cust_id}", None, {"firstName": "Anon"})
check("unauthenticated write blocked (401)", status == 401, f"status={status}")

print()
print("=== Admin UI ===")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1500, "height": 1000})
    page = ctx.new_page()
    console = []
    page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

    page.goto(f"{WEB}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "admin@store.com")
    page.fill('input[type="password"]', "admin123")
    page.get_by_role("button", name="Sign In", exact=True).click()
    page.wait_for_timeout(3500)

    page.goto(f"{WEB}/admin/users", wait_until="networkidle")
    page.wait_for_timeout(2500)

    check("user rows render", page.locator("[data-user-row]").count() >= 2)
    check("Edit buttons present", page.get_by_role("button", name="Edit").count() >= 2)

    row = page.locator('[data-user-row="customer@example.com"]')
    check("target customer row present", row.count() == 1)

    # Edit via the modal and confirm it reaches the database.
    row.get_by_role("button", name="Edit").click()
    page.wait_for_timeout(800)
    page.get_by_label("First name").fill("Janet")
    page.get_by_label("Role").select_option("manager")
    page.get_by_role("button", name="Save changes").click()
    page.wait_for_timeout(2500)

    _, after = call("GET", "/users", admin_token)
    u = next(x for x in after["data"] if x["id"] == cust_id)
    check("modal edit persisted to the database",
          u["firstName"] == "Janet" and u["role"] == "manager",
          f"name={u['firstName']} role={u['role']}")

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(2000)
    check("edit visible after reload", "Janet" in page.inner_text("body"))

    # Row-level deactivate.
    row = page.locator('[data-user-row="customer@example.com"]')
    row.get_by_role("button", name="Deactivate").click()
    page.wait_for_timeout(2500)
    _, after = call("GET", "/users", admin_token)
    u = next(x for x in after["data"] if x["id"] == cust_id)
    check("row Deactivate persisted", u["isActive"] is False, f"isActive={u['isActive']}")

    # And back on.
    row = page.locator('[data-user-row="customer@example.com"]')
    row.get_by_role("button", name="Activate").click()
    page.wait_for_timeout(2500)
    _, after = call("GET", "/users", admin_token)
    u = next(x for x in after["data"] if x["id"] == cust_id)
    check("row Activate persisted", u["isActive"] is True)

    # Everything up to here should be error-free. The next case deliberately
    # provokes a 400, which the browser logs as a failed resource regardless of
    # the app handling it correctly - so snapshot the count now.
    console_before_expected_400 = len(console)
    check("no console errors during normal use", console_before_expected_400 == 0,
          "; ".join(console[:2]))

    # A rejected save must keep the modal open and show the server's reason,
    # never report success.
    admin_row = page.locator('[data-user-row="admin@store.com"]')
    admin_row.get_by_role("button", name="Edit").click()
    page.wait_for_timeout(800)
    page.get_by_label("Role").select_option("customer")
    page.get_by_role("button", name="Save changes").click()
    page.wait_for_timeout(2500)
    body_text = page.inner_text("body")
    check("self-demotion shows the server error, not success",
          "cannot change your own role" in body_text.lower(),
          body_text[:120].replace("\n", " "))
    page.get_by_role("button", name="Cancel").click()
    page.wait_for_timeout(500)

    # Only the expected 400 may have been added.
    extra = [c for c in console[console_before_expected_400:]
             if "400" not in c and "Bad Request" not in c]
    check("no unexpected console errors after the rejected save", not extra,
          "; ".join(extra[:2]))

    b.close()

# Leave the fixture as we found it.
call("PUT", f"/users/{cust_id}", admin_token,
     {"role": "customer", "isActive": True, "firstName": "Jane", "lastName": "Doe"})

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
