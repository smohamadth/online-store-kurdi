# "Fix everything" tracker

Work in progress, 2026-08-25. Will be removed at the end of the pass.

## Batch 1 — layout & structural
- [ ] AppShell: 200px magic number → 1fr in flex
- [ ] Admin sidebar View Store/Logout: minHeight 44px
- [ ] Admin topbar: minHeight 44px on user pill
- [ ] AccountShell: minHeight 44px + RTL sidebar caret
- [ ] ProductView: sticky Add-to-cart safe-area-inset
- [ ] CheckoutView: sticky Place-order safe-area-inset

## Batch 2 — stacked form rows (1fr/1fr → 1fr on mobile)
- [ ] app/account/addresses/page.tsx
- [ ] app/account/page.tsx
- [ ] app/admin/analytics/page.tsx
- [ ] app/admin/appearance/page.tsx (also fixed-width previews → Batch 4)
- [ ] app/admin/categories/page.tsx
- [ ] app/admin/coupons/page.tsx
- [ ] app/admin/gift-cards/page.tsx
- [ ] app/admin/inventory/warehouses/page.tsx
- [ ] app/admin/menus/page.tsx
- [ ] app/admin/products/[id]/variants/page.tsx
- [ ] app/admin/shipping/page.tsx
- [ ] app/admin/tax/page.tsx
- [ ] app/login/page.tsx
- [ ] app/register/page.tsx
- [ ] app/returns/page.tsx
- [ ] app/contact/ContactView.tsx
- [ ] app/forgot-password/ForgotPasswordView.tsx

## Batch 3 — direction-aware arrows
- [ ] CmsEditor back arrow
- [ ] AccountShell sidebar caret (▲/▼)
- [ ] Account orders [id] back arrow
- [ ] CartView continue shopping + downloads link
- [ ] Blog [slug] back arrow
- [ ] Blog list prev/next
- [ ] Admin orders [id] back arrow
- [ ] Admin pages [id]/edit back arrow
- [ ] Admin products variants back link
- [ ] Admin blog [id]/edit back arrow
- [ ] HeroGallery CTA arrow
- [ ] PromoGrid CTA arrow
- [ ] ProductCarousel "View all" arrow
- [ ] Contact "View FAQ" arrow
- [ ] Downloads "View order" arrow
- [ ] Admin dashboard "Manage →" cards

## Batch 4 — admin appearance fixed-width previews

## Batch 5 — tests + commit

