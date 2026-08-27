# 🐛 Bug Report & Incomplete Features

## 🔴 CRITICAL BUGS

### **1. ~~Password Reset Not Implemented~~**
**Location:** `apps/api/src/modules/auth/auth.routes.ts`
**Issue:** Password reset returns success but doesn't actually send email or update password
**Status:** ✅ FIXED — `POST /auth/forgot-password` creates a hashed, expiring
`PasswordReset` token and `sendPasswordResetEmail` delivers it;
`POST /auth/reset-password` validates the token (expiry + single-use) and
updates the password. Storefront has `/forgot-password` + `/reset-password`.

### **2. ~~Test Email Not Implemented~~**
**Location:** `apps/api/src/modules/settings/settings.routes.ts`
**Issue:** Test email endpoint exists but doesn't send actual email
**Status:** ✅ FIXED — the endpoint now validates the address, goes through
`sendEmail` (real SMTP when configured), returns 502 when the mail server
rejects, and reports `delivered: false` with a plain-English hint when no
SMTP is configured (no more fake "sent successfully"). 3 tests.

### **3. ~~Order Status Update Missing Email~~**
**Location:** `apps/api/src/modules/orders/order.routes.ts`
**Issue:** When order status changes to "shipped", no shipping notification email sent
**Status:** ✅ FIXED — `sendShippingNotification` fires when an order moves to
"shipped" (admin status update).

### **4. ~~Inventory Alert System Not Triggered~~**
**Location:** `apps/api/src/modules/inventory/inventory.service.ts`
**Issue:** Stock alerts are stored but never checked/triggered
**Status:** ✅ FIXED — `decrementStock` now raises a `StockAlert` row when a
sale crosses the low-stock threshold (or hits zero), and re-notifies the
admin's opt-in `notifyEmail` on fresh crossings (edge-triggered, so a
slow-moving item can't spam). Fire-and-forget mail: a delivery failure
never fails a sale. 5 tests.

### **5. ~~Coupon Usage Not Tracked~~**
**Location:** `apps/api/src/modules/orders/order.routes.ts`
**Issue:** When coupon is applied to order, `usedCount` not incremented
**Status:** ✅ FIXED — order placement increments `usedCount`
(`coupon.update({ data: { usedCount: { increment: 1 } } })`).

---

## 🟡 MEDIUM BUGS

### **6. ~~Product Search Fallback~~**
**Location:** `apps/web/components/SearchBar.tsx`
**Issue:** Search falls back to hardcoded mock products when API fails
**Status:** ✅ FIXED — search hits `api.searchProducts` first and, on failure,
fetches all products and filters locally (name/description/category). No
hardcoded mock results.

### **7. Review Section Mock Data**
**Location:** `apps/web/components/ReviewSection.tsx`
**Issue:** Shows mock reviews when API unavailable instead of showing "no reviews"
**Status:** ⚠️ Should show actual state

### **8. Admin Orders Missing User Info**
**Location:** `apps/web/app/admin/orders/page.tsx`
**Issue:** Orders don't show customer name/email properly
**Status:** ⚠️ Needs API connection

### **9. Checkout Missing Shipping Selection**
**Location:** `apps/web/app/checkout/page.tsx`
**Issue:** No shipping method selection, uses hardcoded $9.99
**Status:** ✅ FIXED — checkout now renders the `ShippingSelector`
(real shipping zones/methods from the API; the $9.99 hardcode is gone,
with a free-shipping-aware fallback).

### **10. Checkout Missing Tax Calculation**
**Location:** `apps/web/app/checkout/page.tsx`
**Issue:** Tax is hardcoded at 10%, not calculated based on location
**Status:** ✅ FIXED — checkout renders the `TaxCalculator`, which
computes tax from the customer's location via the API's tax rates;
the 10% figure remains only as a last-resort fallback when the API
is unreachable.

---

## 🟢 LOW PRIORITY

### **11. ~~Product Image Upload~~**
**Location:** `apps/web/components/ImageGalleryUpload.tsx` (wired into
`apps/web/app/admin/products/page.tsx`)
**Issue:** No image upload UI, uses placeholder emojis
**Status:** ✅ FIXED — the product edit modal carries an image gallery
(`ImageGalleryUpload`): multi-file select, upload via `POST
/api/upload/image`, primary-image + sort-order control, remove. Existing
images are loaded back into the gallery on edit.

### **12. User Avatar Upload**
**Location:** `apps/web/app/account/profile/page.tsx`
**Issue:** No avatar upload functionality
**Status:** ❌ Not implemented

### **13. ~~Order Tracking Page~~**
**Location:** `apps/web/app/account/orders/[id]/page.tsx` + `GET /api/orders/:id/tracking`
**Issue:** No visual order tracking with timeline
**Status:** ✅ FIXED — a new `GET /api/orders/:id/tracking` endpoint returns a
derived timeline (placed → paid → shipped → delivered, with real timestamps,
the tracking number, and an honest terminal state for cancelled/refunded
orders). The order detail page renders it as a status timeline; cancelled
orders no longer hide their status. Owner/admin auth, 6 integration tests.

### **14. ~~Product Comparison~~**
**Location:** `apps/web/app/compare/page.tsx` + `CompareProvider`/`CompareBar`
**Issue:** No product comparison feature
**Status:** ✅ FIXED — a localStorage-backed compare list (max 4, survives
refresh) with a Compare toggle on every product card and the product page,
a floating compare bar, and a /compare table that renders live price,
availability, rating, category and description per column. A broken
product degrades to a "no longer available" column instead of blanking the
table. 11 tests (bar/provider behaviour + table rendering).

### **15. Recently Viewed Products**
**Location:** No component exists
**Issue:** No tracking of recently viewed products
**Status:** ❌ Not implemented

---

## 📋 INCOMPLETE FEATURES

### **1. Authentication**
- [x] Login
- [x] Register
- [ ] Email verification
- [ ] Password reset (partially implemented)
- [ ] Social login (Google, GitHub)
- [ ] Two-factor authentication

### **2. Products**
- [x] CRUD operations
- [x] Search
- [x] Image upload
- [ ] Bulk import/export
- [x] Product comparison
- [ ] Recently viewed

### **3. Orders**
- [x] Create order
- [x] View orders
- [x] Update status
- [x] Order tracking page
- [ ] Shipping label generation
- [ ] Return/refund process

### **4. Cart**
- [x] Add/remove items
- [x] Update quantity
- [x] Database sync
- [ ] Save for later
- [ ] Share cart
- [ ] Cart abandonment recovery

### **5. Payments**
- [x] Mock payment
- [ ] Stripe integration (backend ready)
- [ ] Payment form UI
- [ ] Subscription payments
- [ ] Partial payments

### **6. Email**
- [x] Email service
- [x] Templates
- [ ] Welcome email (connected)
- [ ] Order confirmation (connected)
- [ ] Shipping notification
- [ ] Password reset
- [ ] Abandoned cart
- [ ] Review request

### **7. Inventory**
- [x] Stock tracking
- [x] Low stock alerts
- [ ] Automatic alerts
- [ ] Inventory reports
- [ ] Supplier management

### **8. Shipping**
- [x] Zones
- [x] Methods
- [x] Rate calculation
- [ ] Shipping label generation
- [ ] Carrier integration
- [ ] Tracking updates

### **9. Tax**
- [x] Tax rates
- [x] Tax classes
- [x] Calculation
- [ ] Tax reports
- [ ] VAT validation
- [ ] Tax exemption

---

## 🎯 PRIORITY FIX LIST

### **High Priority (Complete This Week)**
1. ✅ Fix password reset flow
2. ✅ Add shipping notification email
3. ✅ Track coupon usage
4. ✅ Connect checkout to shipping API
5. ✅ Connect checkout to tax API

### **Medium Priority (Next 2 Weeks)**
1. [x] Add product image upload
2. [x] Add order tracking page
3. [ ] Fix admin orders to show customer info
4. [ ] Implement inventory alerts
5. [ ] Add email verification

### **Low Priority (Future)**
1. [x] Product comparison
2. [ ] Recently viewed
3. [ ] Social login
4. [ ] Mobile app

---

## 🔧 QUICK FIXES

### **Fix 1: Track Coupon Usage**
```typescript
// In order creation, after applying coupon:
if (couponId) {
  await prisma.coupon.update({
    where: { id: couponId },
    data: { usedCount: { increment: 1 } },
  });
}
```

### **Fix 2: Send Shipping Email**
```typescript
// In order status update:
if (status === 'shipped' && trackingNumber) {
  await sendShippingNotification(order, user, trackingNumber);
}
```

### **Fix 3: Password Reset**
```typescript
// Generate reset token
const resetToken = crypto.randomBytes(32).toString('hex');
const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

// Store in database
await prisma.user.update({
  where: { email },
  data: { resetToken, resetTokenExpiry },
});

// Send email
await sendPasswordResetEmail(user, resetToken);
```

---

## 📊 SUMMARY

| Category | Total | Complete | Incomplete | Buggy |
|----------|-------|----------|------------|-------|
| **Backend APIs** | 14 | 10 | 3 | 1 |
| **Frontend Pages** | 24 | 18 | 4 | 2 |
| **Features** | 30 | 20 | 8 | 2 |

**Overall Status:** 70% complete, needs refinement

**Biggest Gaps:**
1. [x] Password reset
2. [x] Shipping/tax integration in checkout
3. [x] Product image upload
4. [x] Order tracking
