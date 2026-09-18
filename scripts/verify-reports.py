"""Admin reporting: real figures, working exports, no fabricated numbers.

This suite exists because the analytics page used to SHOW numbers it had
invented:

  - the three KPI trend captions were the literal strings "↑ 12% from last
    month", "↑ 8% ..." and "↑ 5% ...", so a store whose revenue had halved
    still displayed growth on every card;
  - the "Revenue Overview" chart was a hardcoded twelve-element array drawn
    against fixed Jan-Dec labels, connected to nothing.

Both are asserted against here by their exact old text, so they cannot come
back unnoticed. The rest covers the new surface: the period selector, the
conversion funnel (whose endpoint previously had no UI at all), and the
PDF/CSV exports including their authorization.
"""
import json
import os
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

# Failures must be visible as GitHub annotations: the raw job log is not
# reliably fetchable through the API.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ci_annotate  # noqa: E402
ci_annotate.install("verify-reports")

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -- {detail}" if detail else ""))
    if not ok:
        ci_annotate.annotate_failure("verify-reports", str(name), str(detail))


def _api(method, path, token=None, body=None, raw=False):
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
            payload = r.read()
            return r.status, (payload if raw else json.loads(payload or "{}")), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, {}, dict(e.headers or {})


def _token(email, password):
    _, d, _ = _api("POST", "/auth/login", body={"email": email, "password": password})
    return (d.get("data") or {}).get("accessToken")


admin = _token("admin@store.com", "admin123")
check("admin can log in", bool(admin))

# ---- API: report payload ---------------------------------------------------
status, body, _ = _api("GET", "/reports/sales?days=30", admin)
check("GET /reports/sales returns 200", status == 200, str(status))
data = body.get("data") or {}
check("report has totals", isinstance(data.get("totals"), dict), str(data)[:200])
check("report has deltas", isinstance(data.get("deltas"), dict))
check("report has a dense series", isinstance(data.get("series"), list))
check("report echoes the range", (data.get("range") or {}).get("days") == 30,
      str(data.get("range")))

# A percentage against an empty previous period is meaningless; the API must
# send null rather than a number the UI would render as a trend.
rev = (data.get("deltas") or {}).get("revenue") or {}
check("revenue delta has a percent field", "percent" in rev, str(rev))
check("percent is null or numeric, never a string",
      rev.get("percent") is None or isinstance(rev.get("percent"), (int, float)),
      str(rev.get("percent")))

# ---- API: authorization ----------------------------------------------------
for path in ("/reports/sales", "/reports/sales.pdf", "/reports/sales.csv"):
    status, _, _ = _api("GET", path)
    check(f"{path} rejects anonymous", status == 401, str(status))

cust = _token("customer@example.com", "customer123") or _token("user@example.com", "user123")
if cust:
    for path in ("/reports/sales", "/reports/sales.pdf", "/reports/sales.csv"):
        status, _, _ = _api("GET", path, cust)
        check(f"{path} rejects a customer", status == 403, str(status))

# ---- API: PDF --------------------------------------------------------------
status, pdf, headers = _api("GET", "/reports/sales.pdf?days=30", admin, raw=True)
check("PDF endpoint returns 200", status == 200, str(status))
check("PDF has the right content type",
      "application/pdf" in (headers.get("Content-Type") or ""),
      str(headers.get("Content-Type")))
check("PDF body really is a PDF", isinstance(pdf, bytes) and pdf[:5] == b"%PDF-",
      str(pdf[:20]))
check("PDF is not a stub", isinstance(pdf, bytes) and len(pdf) > 1000,
      f"{len(pdf) if isinstance(pdf, bytes) else 0} bytes")
check("PDF is named for the range",
      "sales-report-" in (headers.get("Content-Disposition") or ""),
      str(headers.get("Content-Disposition")))

# ---- API: CSV --------------------------------------------------------------
status, csv, headers = _api("GET", "/reports/sales.csv?days=30", admin, raw=True)
check("CSV endpoint returns 200", status == 200, str(status))
check("CSV is an attachment",
      "attachment" in (headers.get("Content-Disposition") or ""),
      str(headers.get("Content-Disposition")))
text = csv.decode("utf-8", "replace") if isinstance(csv, bytes) else ""
for section in ("Summary", "Top products", "Payment methods"):
    check(f"CSV contains the {section!r} section", section in text, text[:200])

# ---- UI --------------------------------------------------------------------
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 1200})
    page = ctx.new_page()
    console = []
    page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

    page.goto(f"{WEB}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "admin@store.com")
    page.fill('input[type="password"]', "admin123")
    page.get_by_role("button", name="Sign In", exact=True).click()
    page.wait_for_timeout(3000)

    page.goto(f"{WEB}/admin/analytics", wait_until="networkidle")
    page.wait_for_timeout(2500)
    body_text = page.inner_text("body")

    check("analytics page renders", "Total Revenue" in body_text, body_text[:300])

    # The regression guard: the exact fabricated strings must never return.
    for fake in ("12% from last month", "8% from last month", "5% from last month"):
        check(f"no fabricated caption {fake!r}", fake not in body_text)

    check("period selector exists", page.locator("#report-period").count() == 1)
    check("export buttons exist",
          page.get_by_role("button", name="Download PDF report").count() == 1
          and page.get_by_role("button", name="Export CSV").count() == 1)
    check("conversion funnel is surfaced", "Conversion Funnel" in body_text)

    # Changing the period must actually re-query the API, not just re-label.
    requests = []
    page.on("request", lambda r: requests.append(r.url))
    page.select_option("#report-period", "90")
    page.wait_for_timeout(2500)
    check("changing the period refetches the report",
          any("/reports/sales" in u and "days=90" in u for u in requests),
          str(requests[-5:]))

    # The chart must be drawn from the API series. With no sales the honest
    # empty state is correct; with sales there must be bars.
    chart_ok = ("No revenue in this period" in page.inner_text("body")
                or page.locator('[title*=": "]').count() > 0)
    check("revenue chart reflects real data", chart_ok)

    # A download must not put the JWT in the URL: it would leak into access
    # logs, browser history and Referer headers.
    check("no token in any request URL",
          not any("token=" in u for u in requests), str([u for u in requests if "token=" in u][:3]))

    check("no console errors", len(console) == 0, "; ".join(console[:3]))
    b.close()

failed = [r for r in results if not r]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
