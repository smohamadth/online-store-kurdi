# Getting these 22 commits onto GitHub

The sandbox I run in has **no GitHub credentials** (no token, no SSH key, no `gh` CLI),
so it can *read* your repo but cannot *write* to it. The commits exist and are
verified — they just need an authenticated push, which only you can perform.

Both options below are **fast-forward**: remote HEAD `247dbc5` is an ancestor of
the new HEAD `8284c52`, so nothing already on GitHub is overwritten or lost.

---

## Option 1 — Push from the sandbox with a token (fastest)

Create a token at <https://github.com/settings/tokens>:
- **Fine-grained** → select `online-store-kurdi` → *Contents: Read and write*
- or **classic** with the `repo` scope

Then, from `/home/user/online-store`:

```bash
./push-to-github.sh ghp_yourTokenHere
```

The token is used for that single command only — never written to disk or git config.
**Revoke it afterwards** if you pasted it anywhere shared.

---

## Option 2 — Apply the bundle from your own machine (no token needed here)

Download `online-store-22-commits.bundle` from the workspace, then:

```bash
git clone https://github.com/smohamadth/online-store-kurdi.git
cd online-store-kurdi
git pull /path/to/online-store-22-commits.bundle main
git push origin main          # authenticates as you, locally
```

This was tested against a fresh clone of the real repo: 22 commits applied
cleanly and every new file was present.

---

## What's in the 22 commits

| Area | Change |
|---|---|
| Homepage gallery | Hero slider + promo grid, admin-managed via `/admin/banners` |
| Homepage | ProductCard, carousels, trust bar, countdown, testimonials, stats |
| **Security** | Customers could self-approve their own reviews — fixed |
| **Security** | Review approval silently discarded by the API — fixed |
| **Production bug** | helmet CORP blocked *all* cross-origin images |
| **Data integrity** | Admin analytics fabricated revenue with `Math.random()` |
| **Data integrity** | Dashboard hardcoded user count, counted cancelled orders as revenue |
| Platform-wide | Zod validation errors returned 500 instead of 400 (all 22 modules) |
| Migration | `scripts/normalize-image-urls.js` strips absolute localhost image URLs |

Verified before bundling: `next build` compiles (41 pages), API typechecks clean,
zero browser console errors, no `.env` or `.db` tracked.
