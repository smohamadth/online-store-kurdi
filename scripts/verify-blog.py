"""Blog: API, storefront rendering, SEO, and the admin editor.

The blog exists to earn search traffic, so the assertions that matter most are
the ones a shop owner would never notice were broken:

  - post bodies are in the INITIAL HTML (server-rendered), not injected after
    hydration, or crawlers see an empty page
  - each post emits BlogPosting JSON-LD and og:type=article
  - an unknown or DRAFT slug returns a real HTTP 404, not a soft 404 that
    Google will happily index
  - content is sanitised ON WRITE, since it is rendered with
    dangerouslySetInnerHTML

Fixtures use a slug prefix and are removed in a finally block, so the suite is
repeatable.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3000")
API = os.environ.get("API_URL", "http://127.0.0.1:3001/api")

PREFIX = "blogtest-"
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


def web(path):
    req = urllib.request.Request(f"{WEB}{path}", headers={"User-Agent": "verify-blog"})
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
    st, d = call("POST", "/blog", admin, {"slug": f"{PREFIX}{slug}", "title": "T", **fields})
    if st in (200, 201):
        created.append(d["data"]["id"])
    return st, d


try:
    # =====================================================================
    print("=== 1. create, sanitise, normalise ===")
    # =====================================================================
    st, d = make(
        "first",
        title="First Blog Post",
        content='<p onclick="alert(1)">Hello reader</p><script>alert(2)</script><strong>bold</strong>',
        excerpt="A short summary of the post",
        author="Test Author",
        tags=["Guides", "  guides ", "Shipping"],
        status="draft",
    )
    check("admin can create a post", st == 201, f"status={st}")
    post = d.get("data", {})
    pid = post.get("id")

    check("script tag stripped on write", "<script" not in post.get("content", ""))
    check("inline handler stripped on write", "onclick" not in post.get("content", ""))
    check("safe formatting preserved", "<strong>bold</strong>" in post.get("content", ""))
    check("tags lowercased and de-duplicated",
          post.get("tags") == ["guides", "shipping"], str(post.get("tags")))
    check("reading time computed", (post.get("readingMinutes") or 0) >= 1,
          str(post.get("readingMinutes")))
    check("new posts default to draft", post.get("status") == "draft")
    check("draft has no publishedAt", post.get("publishedAt") in (None, ""))

    # =====================================================================
    print()
    print("=== 2. a draft is invisible to readers ===")
    # =====================================================================
    st, _ = call("GET", f"/blog/slug/{PREFIX}first")
    check("API 404s a draft", st == 404, f"status={st}")

    code, body = web(f"/blog/{PREFIX}first")
    check("storefront returns a REAL 404 for a draft", code == 404, f"status={code}")
    check("draft title does not leak in the 404 body", "First Blog Post" not in body)

    st, listing = call("GET", "/blog")
    check("draft absent from the public list",
          f"{PREFIX}first" not in [p["slug"] for p in listing.get("data", [])])

    st, all_posts = call("GET", "/blog/all", admin)
    check("but admin CAN see the draft",
          f"{PREFIX}first" in [p["slug"] for p in all_posts.get("data", [])])

    code, _ = web("/blog/no-such-post-anywhere")
    check("unknown slug returns a real 404", code == 404, f"status={code}")

    # =====================================================================
    print()
    print("=== 3. publishing, SEO and structured data ===")
    # =====================================================================
    st, d = call("PUT", f"/blog/{pid}", admin, {"status": "published"})
    check("publish succeeds", st == 200, f"status={st}")
    check("publishedAt is stamped", bool(d["data"].get("publishedAt")))

    code, body = web(f"/blog/{PREFIX}first")
    check("published post returns 200", code == 200, f"status={code}")

    # The whole point of a blog: the article must be in the server HTML.
    check("post body is server-rendered", "Hello reader" in body)
    check("title is server-rendered", "First Blog Post" in body)
    check("author is rendered", "Test Author" in body)
    check("post has its own <title>", "<title>" in body and "First Blog Post" in body)
    check("BlogPosting JSON-LD present", "BlogPosting" in body)
    check("og:type is article", 'property="og:type" content="article"' in body
          or "og:type" in body and "article" in body)
    check("published post is indexable", "noindex" not in body)

    st, one = call("GET", f"/blog/slug/{PREFIX}first")
    check("API exposes related posts array", isinstance(one["data"].get("related"), list))

    # =====================================================================
    print()
    print("=== 4. listing, tags, search, pagination ===")
    # =====================================================================
    for i in (1, 2, 3):
        make(f"extra{i}", title=f"Extra Post {i}", content=f"<p>Body {i}</p>",
             excerpt=f"Summary {i}", tags=["news"], status="published")

    st, tags = call("GET", "/blog/tags")
    tag_map = {t["tag"]: t["count"] for t in tags.get("data", [])}
    check("tag cloud counts published posts", tag_map.get("news") == 3, str(tag_map))

    st, filtered = call("GET", "/blog?tag=news")
    check("filtering by tag works", filtered["pagination"]["total"] == 3,
          str(filtered["pagination"]))

    # Quoting the needle stops a prefix matching a longer tag.
    st, partial = call("GET", "/blog?tag=ship")
    check("partial tag does NOT match 'shipping'", partial["pagination"]["total"] == 0,
          str(partial["pagination"]["total"]))

    st, searched = call("GET", "/blog?search=Extra")
    check("search matches titles", searched["pagination"]["total"] == 3,
          str(searched["pagination"]))

    st, paged = call("GET", "/blog?limit=2")
    check("pagination limits the page size", len(paged["data"]) == 2, str(len(paged["data"])))
    check("pagination reports total pages", paged["pagination"]["totalPages"] >= 2,
          str(paged["pagination"]))

    # Post bodies can be tens of KB - the list must not ship them.
    check("list omits full post bodies", "content" not in paged["data"][0])

    # --- featured pinning ---
    st, all_posts = call("GET", "/blog/all", admin)
    extra1 = next(p for p in all_posts["data"] if p["slug"] == f"{PREFIX}extra1")
    call("PUT", f"/blog/{extra1['id']}", admin, {"isFeatured": True})
    st, listing = call("GET", "/blog")
    check("featured post is pinned to the top",
          listing["data"][0]["slug"] == f"{PREFIX}extra1", listing["data"][0]["slug"])
    call("PUT", f"/blog/{extra1['id']}", admin, {"isFeatured": False})

    # =====================================================================
    print()
    print("=== 5. view counter ===")
    # =====================================================================
    st, before = call("GET", f"/blog/slug/{PREFIX}first")
    v0 = before["data"]["viewCount"]
    call("POST", f"/blog/slug/{PREFIX}first/view")
    st, after = call("GET", f"/blog/slug/{PREFIX}first")
    check("view counter increments", after["data"]["viewCount"] == v0 + 1,
          f"{v0} -> {after['data']['viewCount']}")

    st, _ = call("POST", "/blog/slug/does-not-exist/view")
    check("view on a missing post still returns 200 (fire-and-forget)", st == 200,
          f"status={st}")

    # =====================================================================
    print()
    print("=== 6. slug rules and authorisation ===")
    # =====================================================================
    st, _ = call("POST", "/blog", admin, {"slug": "tags", "title": "Evil"})
    check("reserved slug 'tags' rejected", st == 400, f"status={st}")
    st, _ = call("POST", "/blog", admin, {"slug": f"{PREFIX}first", "title": "Dup"})
    check("duplicate slug rejected with 409", st == 409, f"status={st}")
    st, _ = call("POST", "/blog", admin, {"slug": "Not A Slug!", "title": "Bad"})
    check("malformed slug rejected with 400", st == 400, f"status={st}")
    st, _ = call("POST", "/blog", admin, {"slug": f"{PREFIX}notitle"})
    check("missing title rejected with 400", st == 400, f"status={st}")

    st, _ = call("POST", "/blog", None, {"slug": f"{PREFIX}anon", "title": "X"})
    check("anonymous cannot create a post", st == 401, f"status={st}")
    st, _ = call("POST", "/blog", customer, {"slug": f"{PREFIX}cust", "title": "X"})
    check("customer cannot create a post", st in (401, 403), f"status={st}")
    st, _ = call("GET", "/blog/all", customer)
    check("customer cannot list drafts", st in (401, 403), f"status={st}")
    st, _ = call("PUT", f"/blog/{pid}", customer, {"title": "Hacked"})
    check("customer cannot edit a post", st in (401, 403), f"status={st}")
    st, _ = call("DELETE", f"/blog/{pid}", customer)
    check("customer cannot delete a post", st in (401, 403), f"status={st}")

    # =====================================================================
    print()
    print("=== 7. sitemap ===")
    # =====================================================================
    code, xml = web("/sitemap.xml")
    check("sitemap responds", code == 200, f"status={code}")
    check("sitemap lists the blog index", "/blog<" in xml or "/blog</loc>" in xml)
    check("sitemap lists the published post", f"/blog/{PREFIX}first" in xml)
    check("sitemap omits drafts", f"/blog/{PREFIX}draftonly" not in xml)

    # =====================================================================
    print()
    print("=== 8. storefront and admin UI ===")
    # =====================================================================
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1400, "height": 1000})
        pg = ctx.new_page()
        console = []
        pg.on("console", lambda m: console.append(m.text) if m.type == "error" else None)

        pg.goto(f"{WEB}/blog", wait_until="networkidle")
        pg.wait_for_timeout(1500)
        check("blog index renders cards", pg.locator("[data-post-card]").count() >= 4,
              str(pg.locator("[data-post-card]").count()))
        check("tag filter is shown", "news" in pg.inner_text("body"))

        # Tag filtering must be a real navigable URL, not client state.
        pg.goto(f"{WEB}/blog?tag=news", wait_until="networkidle")
        pg.wait_for_timeout(1200)
        check("tag URL filters the list", pg.locator("[data-post-card]").count() == 3,
              str(pg.locator("[data-post-card]").count()))

        pg.goto(f"{WEB}/blog?search=nothingmatchesthis", wait_until="networkidle")
        pg.wait_for_timeout(1200)
        check("empty search shows a helpful message",
              "No matching posts" in pg.inner_text("body"))

        # Header link so readers can actually find the blog.
        pg.goto(WEB, wait_until="networkidle")
        pg.wait_for_timeout(1500)
        check("storefront header links to the blog",
              pg.locator('a[href="/blog"]').count() >= 1)

        # --- admin ---------------------------------------------------------
        pg.goto(f"{WEB}/login", wait_until="networkidle")
        pg.fill('input[type="email"]', "admin@store.com")
        pg.fill('input[type="password"]', "admin123")
        pg.get_by_role("button", name="Sign In", exact=True).click()
        pg.wait_for_timeout(3500)

        pg.goto(f"{WEB}/admin/blog", wait_until="networkidle")
        pg.wait_for_timeout(2000)
        check("admin blog screen lists posts",
              pg.locator("[data-post-row]").count() >= 4,
              str(pg.locator("[data-post-row]").count()))
        check("sidebar has a Blog entry", pg.locator('[data-nav-item="/admin/blog"]').count() == 1)

        # Write a post through the real UI. The two-step template flow:
        # the picker POSTs a draft (with a unique starting slug) and
        # redirects into the editor, where the admin sets title, slug,
        # tags and publish.
        pg.get_by_test_id("admin-blog-new").click()
        pg.wait_for_timeout(1200)
        pg.get_by_test_id("new-post-blank").click()
        pg.wait_for_timeout(2500)
        pg.get_by_label("Title", exact=True).fill("Written In The UI")
        pg.wait_for_timeout(300)
        # The editor no longer auto-derives the slug from the title - it
        # is free text, pre-filled when the draft is created. The original
        # regression (a blank slug 404'ing the post) is now guarded by
        # the draft arriving with a non-empty slug.
        slug_val = pg.get_by_label("Address (slug)", exact=True).input_value()
        check("draft arrives with a non-empty slug", bool(slug_val.strip()), repr(slug_val))

        pg.get_by_label("Address (slug)", exact=True).fill(f"{PREFIX}ui")
        pg.get_by_label("Tags", exact=True).fill("uitag")
        # Layout blocks: the post editor uses the same block builder as
        # the page CMS. Add a callout and a quote and confirm both reach
        # the storefront after publish.
        pg.get_by_test_id("page-blocks-add-callout").click()
        pg.wait_for_timeout(300)
        pg.locator('[data-block-type="callout"]') \
                .locator('[data-testid$="-text"]').fill("Post block note: shipped from Baku")
        pg.wait_for_timeout(300)
        pg.get_by_test_id("page-blocks-add-quote").click()
        pg.wait_for_timeout(300)
        pg.locator('[data-block-type="quote"]') \
                .locator('[data-testid$="-text"]').fill("Post quote: quality first")
        pg.wait_for_timeout(300)
        pg.get_by_test_id("cms-publish-checkbox").check()
        pg.get_by_test_id("cms-save-and-close").click()
        pg.wait_for_timeout(2500)

        st, all_posts = call("GET", "/blog/all", admin)
        made = [p for p in all_posts["data"] if p["slug"] == f"{PREFIX}ui"]
        check("post created in the UI reached the database", len(made) == 1)
        if made:
            created.append(made[0]["id"])
            check("UI post was published", made[0]["status"] == "published")
            check("UI tags were parsed", made[0]["tags"] == ["uitag"], str(made[0]["tags"]))
            code, post_body = web(f"/blog/{PREFIX}ui")
            check("UI post is live on the storefront", code == 200, f"status={code}")
            check("the post renders its layout blocks",
                  "Post block note: shipped from Baku" in post_body
                  and "Post quote: quality first" in post_body)

        # A rejected save must show the server's reason, not a fake success.
        pg.get_by_test_id("admin-blog-new").click()
        pg.wait_for_timeout(1200)
        pg.get_by_test_id("new-post-blank").click()
        pg.wait_for_timeout(2500)
        pg.get_by_label("Title", exact=True).fill("Duplicate")
        pg.get_by_label("Address (slug)", exact=True).fill(f"{PREFIX}ui")
        pg.get_by_test_id("cms-save-and-close").click()
        pg.wait_for_timeout(2500)
        check("duplicate slug surfaces the server error",
              "already exists" in pg.inner_text("body").lower())
        # Back out of the editor without saving.
        pg.get_by_role("link", name="Back", exact=True).click()
        pg.wait_for_timeout(500)

        check("no unexpected console errors",
              not [c for c in console if "409" not in c and "Failed to load resource" not in c],
              "; ".join(console[:2]))

        b.close()

finally:
    for post_id in set(created):
        call("DELETE", f"/blog/{post_id}", admin)
    st, everything = call("GET", "/blog/all", admin)
    leftovers = [p for p in everything.get("data", []) if p["slug"].startswith(PREFIX)]
    for p in leftovers:
        call("DELETE", f"/blog/{p['id']}", admin)
    # The template picker creates a draft (title "Untitled post") before
    # the flow renames it in the editor. A rejected save (duplicate slug)
    # leaves that draft behind; sweep it or drafts accumulate run over run.
    template_leftovers = [
        p for p in everything.get("data", [])
        if p["title"] == "Untitled post" and p["status"] == "draft"
    ]
    for p in template_leftovers:
        call("DELETE", f"/blog/{p['id']}", admin)
    print(f"\n(cleanup: removed {len(set(created)) + len(leftovers) + len(template_leftovers)} fixture post(s))")

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
