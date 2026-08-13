# Known gaps

An honest list of what is **not** finished, so nobody discovers it in production.
Everything here is deliberate and documented — not silently broken.

---

## 1. No online card payments

**Status:** offline payment only.

There is no Stripe/PayPal integration. Checkout offers **Cash on Delivery** and
**Bank Transfer**, and orders are created with `paymentStatus: 'pending'`.

`POST /api/payments/process` does *not* contact a gateway — it simply marks an
order paid. It is therefore restricted to **admin/manager**, so staff can record
a bank transfer or a COD collection. It previously accepted any authenticated
customer, which let a buyer mark their own order as paid and receive the goods
for free.

`PAYMENTS_ALLOW_MOCK=true` re-opens it to customers for local demos. **Never
enable this on a public store.**

To go live with cards:
1. Add the Stripe SDK and keys to `apps/api/.env`.
2. Create a PaymentIntent in `payment.routes.ts` instead of the mock branch.
3. Verify the webhook signature before setting `paymentStatus: 'completed'`.
4. Re-add the Credit Card option in `apps/web/app/checkout/page.tsx`.

---

## 2. Email is logged, not delivered

`email.service.ts` connects to SMTP using `SMTP_HOST` / `SMTP_PORT`. With no
SMTP server it degrades gracefully and logs
`📧 Email would be sent to ...` instead of sending.

Order-confirmation and shipping-notification emails are wired into
`order.routes.ts` and will send as soon as real SMTP credentials are set.
For local testing, MailHog on `localhost:1025` works with the defaults.

---

## 3. Settings that are stored but unused

| Field | State |
|---|---|
| `storeAddress` | saved, not displayed anywhere |
| `googleAnalyticsId` | saved, no tracking script injected |

Both persist correctly; nothing consumes them yet.

---

## 4. Admin Users page is read-only

`/admin/users` lists users but cannot change a role, deactivate an account, or
delete a user. The `PUT /api/users/:id` endpoint exists and works — only the UI
is missing.

---

## 5. No automated tests

There is no test suite. Every change in this repo was verified by driving a real
browser with Playwright and querying the database directly, which catches
integration bugs but is not a substitute for regression tests.

Highest-value tests to add first:
- checkout: valid order persists; rejected order shows an error and keeps the cart
- auth: customer cannot reach admin endpoints (403) or self-approve reviews
- settings: currency and store name propagate to the storefront

---

## 6. Product images are placeholders

Seed products reference `/images/products/*.jpg`, which do not exist on disk and
return 404. `ProductCard` falls back to a generated gradient tile with the
product initials, so nothing looks broken. Upload real images via
**Admin → Products** to replace them.


---

## 7. Category 404 returns HTTP 200 (soft 404)

`/category/<unknown>` renders the correct "Category not found" page, but the
HTTP status is **200**, not 404.

`page.tsx` is a client component, so its `notFound()` call renders
`not-found.tsx` without being able to set the status. A server layout
(`category/[slug]/layout.tsx`) was added — it supplies correct per-category
metadata, but its `notFound()` still does not change the status code because
the client page has already committed the response.

Impact: search engines may index the empty page instead of dropping it.
Product pages are unaffected — they 404 correctly.

Proper fix: convert `category/[slug]/page.tsx` to a server component that
fetches the category itself and calls `notFound()` before rendering, moving the
interactive filtering into a child client component.

---

## 8. Only product and category pages have server-side SEO

`generateMetadata` is wired up for `/products/[slug]` and `/category/[slug]`.
The home page, `/products` and other static pages still use the old client-side
`next/head` pattern, which is a no-op in the App Router — they fall back to
whatever the root layout provides.
