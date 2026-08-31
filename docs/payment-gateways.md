# Payment gateways

The store ships with **no payment gateway enabled**. Checkout always offers
**Cash on Delivery** and **Bank Transfer** (settled by staff via the admin →
Accounting flow). The owner activates one or more hosted gateways from
**Admin → Finance → Payment Gateways**, fills in their own credentials, and the
storefront automatically offers them at checkout.

| Gateway   | Region      | Currency      | Notes                                                            |
|-----------|-------------|---------------|------------------------------------------------------------------|
| Zarinpal  | 🇮🇷 Iran     | IRR (Rial)    | Set the store base currency to IRR. Merchant UUID required.       |
| IDPay     | 🇮🇷 Iran     | IRR (Rial)    | API key + optional sandbox.                                       |
| ZainCash  | 🇮🇶 Iraq     | IQD           | Mobile-wallet network, popular in Kurdistan. Client id/secret.    |
| FIB       | 🇮🇶 Iraq     | IQD (or USD)  | First Iraqi Bank. Client id/secret.                               |
| PayPal    | 🌍 Global    | store currency| REST app client id/secret.                                        |
| Stripe    | 🌍 Global    | store currency| Secret key + webhook signing secret.                              |

## How it works

1. The merchant opens **Payment Gateways**, toggles a gateway **Enabled**, and
   fills the credential fields shown (their own API key / merchant id / client
   secret).
2. Credentials are stored server-side in `StoreSettings.paymentGateways` and are
   **never** exposed through the public settings endpoint. The checkout only
   learns which gateways are *enabled* (`GET /api/settings` →
   `paymentGateways[]`).
3. At checkout the customer picks a gateway; `POST /api/orders` creates the
   order and a hosted payment session at that gateway, returning a
   `checkoutUrl` the storefront redirects to.
4. The customer pays on the gateway's page and is redirected back to
   `/checkout?gateway=..&order=..`. The storefront calls
   `POST /api/payments/gateways/:gatewayId/verify`, which confirms the payment
   **server-to-server** with the gateway and settles the order idempotently
   (creates the `Payment` row, sets `paymentStatus=completed`, moves the order
   to `processing`, and posts the accounting entry if enabled).

**Retry after an abandoned/cancelled gateway page.** If a customer leaves the
gateway page without paying, the order stays `paymentStatus=pending` and the
account order page shows a **Pay now** button. `POST /api/orders/:id/pay`
(owner or admin only) re-runs the hosted checkout-session creation and returns
a fresh `checkoutUrl` the storefront redirects to — the customer pays without
re-entering their details. It rejects orders that are already paid/refunded,
aren't a gateway method, or whose gateway isn't configured.

## Payment confirmation email

When an order actually becomes **paid**, the customer receives a **Payment
Received** email (`payment_confirmation` template, admin-editable under Store
Settings → email templates, seeded by `prisma/seed-email-templates.ts`). It is
sent for every settlement path:

- staff records a **COD / bank-transfer** payment via **Mark as paid** on the
  admin order detail page,
- a hosted gateway verifies a return (`/api/payments/gateways/:id/verify`),
- the **Stripe** webhook settles an order.

For Cash on Delivery the order-confirmation email is sent at placement, and the
payment-confirmation email is the later acknowledgement when staff records that
the cash/transfer was collected.

## Admin API

- `GET  /api/settings/payment-gateways` (admin) — full config + field metadata.
- `PUT  /api/settings/payment-gateways` (admin) — save configs
  (`{ gateways: { "<id>": { enabled, ...fields } } }`). Unknown keys are dropped.
- `DELETE /api/settings/payment-gateways/:id` (admin) — clear a gateway.
- `GET /api/settings` (public) — scrubbed `paymentGateways[]` metadata, no secrets.

## Notes for Iranian gateways

Zarinpal and IDPay charge in **Rial (IRR)**. The order amount is sent as-is, so
the store's base currency must be set to IRR for these to work correctly
(Store Settings → currency). PayPal and Stripe charge in the store's base
currency. ZainCash and FIB charge in IQD.

## Testing

Gateway adapters are unit-tested with a stubbed HTTP layer
(`tests/unit/payments/gateways.test.ts`) so no real gateway is ever contacted
and the request/response mapping is pinned. Admin config endpoints are covered
by `tests/integration/paymentGateways.test.ts`.
