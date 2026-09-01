// ---------------------------------------------------------------------------
// Product detail page (PDP) - the storefront's most important view.
//
// Fetches the product by slug (GET /api/products/slug/:slug), its
// typed option tree (GET /api/products/:id/options), and the
// "also bought" recommendations. Drives:
//   - variant selection via pickVariant() (lib/variant-selector)
//   - add-to-cart / buy-now (useCart)
//   - wishlist toggle (GET /wishlist/check, POST /wishlist)
//   - back-in-stock alerts (POST /stock-alerts, the in-memory ones)
//   - reviews (ReviewSection) and the digital-download box
// Structured data (Product JSON-LD with offers/reviews) is emitted by
// the server layout next to this component.
// ---------------------------------------------------------------------------

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useActiveLayout } from '@/lib/layouts/useActiveLayout';
import { LayoutRenderer } from '@/lib/layouts/render';
import Link from 'next/link';
import { useCart } from '@/lib/store';
import { readStoredUser } from '@/lib/storedUser';
import { useCompare } from '@/lib/compare';
import { trackRecentlyViewed } from '@/lib/recentlyViewed';
import { trackEvent } from '@/lib/tracking';
import { api, Product, getCategoryEmoji, getImageUrl, getProductImage } from '@/lib/api';
import ReviewSection from '@/components/ReviewSection';
import StoreImage from '@/components/StoreImage';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { useIsMobile } from '@/lib/hooks';
import { API_BASE } from '@/lib/http';
import { pickVariant, defaultSelection, swatchLabel } from '@/lib/variant-selector';
import type { Option } from '@/lib/variant-types';
import {
  buildProductJsonLd,
  buildBreadcrumbJsonLd,
  buildDigitalDocumentJsonLd,
  asGraph,
} from '@/lib/structured-data';
import { SITE } from '@/lib/seo';

export default function ProductView() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { addItem, items } = useCart();
  const { isCompared, toggle: toggleCompare } = useCompare();
  const { settings } = useStoreSettings();
  
  const slug = params?.slug as string;
  // Resolved at the top so this hook runs on every render (the loading/error
  // early returns below must not change the Rules-of-Hooks order).
  const layout = useActiveLayout('product');

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  // Typed option tree (Color, Size, ...). When a product has typed
  // options, the swatch picker is shown and the chosen values drive
  // which variant is highlighted. When a product has no typed
  // options, the legacy variant chip list is used.
  const [typedOptions, setTypedOptions] = useState<Option[]>([]);
  // The customer's swatch selection. Empty means "no swatch chosen
  // yet" - the first variant is highlighted by default.
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [stockAlertSet, setStockAlertSet] = useState(false);
  const [stockAlertEmail, setStockAlertEmail] = useState('');
  const [showStockAlertForm, setShowStockAlertForm] = useState(false);

  useEffect(() => {
    if (slug) fetchProduct();
  }, [slug]);

  useEffect(() => {
    if (product?.id) checkWishlistStatus(product.id);
  }, [product?.id]);

  // Analytics: one view event per product page load (feeds trending,
  // conversion rates and "based on your browsing history"). No-op
  // when the store has not enabled analytics.
  useEffect(() => {
    if (product?.id) {
      trackEvent({ eventType: 'view', productId: product.id, metadata: { slug } });
    }
  }, [product?.id, slug]);

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getProductBySlug(slug);
      setProduct(response.data);
      // Remember it for the home page's "Recently viewed" row.
      // Client-side only (localStorage); a no-op if storage is blocked.
      trackRecentlyViewed(response.data);
      if (response.data?.variants?.length > 0) {
        setSelectedVariant(response.data.variants[0].id);
      }
      // Fetch the typed options tree in parallel. Best-effort: a
      // product without typed options returns 200 with [].
      try {
        const token = localStorage.getItem('token');
        const optsRes = await fetch(`${API_BASE}/products/${response.data.id}/options`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (optsRes.ok) {
          const d = await optsRes.json();
          const opts = (d.data || []) as Option[];
          setTypedOptions(opts);
          // Pre-select the first value of each option so the swatch
          // picker is in a valid state on first render.
          if (opts.length > 0) setChosen(defaultSelection(opts));
        }
      } catch {/* typed options are optional */}
    } catch (err) {
      setError('Product not found or API unavailable');
    } finally {
      setLoading(false);
    }
  };

  const checkWishlistStatus = async (productId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await fetch(`${API_BASE}/wishlist/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId }),
      });
      if (response.ok) {
        const data = await response.json();
        setInWishlist(data.data?.inWishlist || false);
      }
    } catch (err) {}
  };

  // The API returns images in insertion order, but the admin orders the
  // gallery in the product modal (drag-to-reorder = sortOrder, plus a
  // designated primary). Sort before rendering so the main image is the
  // primary (first image when none is designated) and the thumbnails
  // follow the admin's drag order - matching what the product card
  // already shows (isPrimary), so card and PDP agree on the hero image.
  // (Must run before the early returns below - hook order.)
  const allImages = useMemo(() => {
    const imgs = product?.images && product.images.length > 0
      ? product.images
      : [{ id: 'placeholder', url: '', alt: product?.name || '', isPrimary: true, sortOrder: 0 } as any];
    return [...imgs].sort(
      (a: any, b: any) =>
        (Number(b.isPrimary ? 1 : 0) - Number(a.isPrimary ? 1 : 0)) ||
        (Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)),
    );
  }, [product]);

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
        <p style={{ fontSize: '18px', color: 'var(--muted, #666)' }}>Loading product...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
        <p style={{ fontSize: '18px', color: 'var(--muted, #666)', marginBottom: '32px' }}>{error || 'Product not found'}</p>
        <Link href="/products" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: 'var(--brand, #000)',
          color: 'var(--brand-text, #fff)',
          borderRadius: '6px',
          textDecoration: 'none',
        }}>
          Back to Products
        </Link>
      </div>
    );
  }

  const currentVariant = product.variants?.find((v) => v.id === selectedVariant);
  const currentPrice = currentVariant ? Number(currentVariant.price) : Number(product.price);
  const currentVariantName = currentVariant?.name || null;
  // Digital-product branch. The PDP doesn't ship physical stock
  // for a digital SKU: there's nothing to ship, the customer
  // gets a per-order download link at checkout, and the buy-now
  // flow should still work even when the legacy "in stock"
  // count is zero (digital products are always available).
  const isDigital = product.type === 'digital';
  // Expiry: show "Links expire in N days" on the PDP when the
  // product has a non-null, positive downloadExpiry.
  const downloadExpiryDays =
    isDigital && (product as any).downloadExpiry && Number((product as any).downloadExpiry) > 0
      ? Number((product as any).downloadExpiry)
      : null;
  const downloadLimit = isDigital && (product as any).downloadLimit
    ? Number((product as any).downloadLimit)
    : null;

  const getVariantDisplay = (variant: any) => {
    try {
      const attrs = typeof variant.attributes === 'string' ? JSON.parse(variant.attributes) : variant.attributes;
      return Object.values(attrs).join(' - ');
    } catch {
      return variant.name;
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: currentPrice,
      quantity: quantity,
      variant: currentVariantName || undefined,
      variantId: selectedVariant || undefined,
      category: product.category?.name || 'Other',
      // Stamp the type on the cart line so CartView can branch on
      // "all digital" without re-fetching the product.
      type: isDigital ? 'digital' : 'physical',
      // Carry the unit weight so checkout can compute weight-based
      // shipping (see ShippingSelector).
      weight: (product as any).weight ?? null,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    router.push('/cart');
  };

  const handleWishlist = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }
      if (!product?.id) return;

      if (inWishlist) {
        await fetch(`${API_BASE}/wishlist/${product.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        setInWishlist(false);
      } else {
        await fetch(`${API_BASE}/wishlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ productId: product.id }),
        });
        setInWishlist(true);
        trackEvent({ eventType: 'wishlist', productId: product.id });
      }
    } catch (err) {
      console.error('Wishlist error:', err);
    }
  };

  const handleStockAlert = async () => {
    try {
      const token = localStorage.getItem('token');
      const email = stockAlertEmail || readStoredUser()?.email || '';
      
      if (!email && !stockAlertEmail) {
        setShowStockAlertForm(true);
        return;
      }

      const response = await fetch(`${API_BASE}/stock-alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          productId: product?.id,
          variantId: selectedVariant || undefined,
          email: stockAlertEmail || email,
        }),
      });

      if (response.ok) {
        setStockAlertSet(true);
        setShowStockAlertForm(false);
      }
    } catch (err) {
      console.error('Stock alert error:', err);
    }
  };

  // Theme Studio override: when the active theme ships a `layouts.product`,
  // render its grid (with the live product data) instead of the built-in PDP.
  if (layout && product) {
    return (
      <LayoutRenderer
        layout={layout}
        data={{ product: { name: product.name, price: product.price, description: product.description }, title: product.name }}
      />
    );
  }

  return (
    <>
      {/* Meta tags live in layout.tsx (generateMetadata). next/head is a
          no-op in App Router client components, so the tags that used to be
          here never reached the HTML - and once layout.tsx was added they
          would have produced a second, conflicting <title>.
          JSON-LD: Product + BreadcrumbList. Built by the same pure helpers
          used by the admin/server pages, so the test fixture and the live
          output can't drift. */}
      {(() => {
        const productUrl = `${SITE}/products/${slug}`;
        const description = (product.description || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const productLd = buildProductJsonLd({
          url: productUrl,
          name: product.name,
          description,
          images: product.images?.map((img: any) => getImageUrl(img.url)) || [],
          sku: product.sku,
          // variant-level sku when one is selected and has its own SKU
          variantSku: (currentVariant as any)?.sku || undefined,
          brand: product.category?.name,
          // Price + availability follow the currently-selected variant
          // when one is chosen; otherwise the product. This matches the
          // sale-price UI above.
          price: currentVariant ? Number(currentVariant.price) : Number(product.price),
          currency: settings.currency || 'USD',
          inStock: (currentVariant ? Number(currentVariant.quantity) > 0 : Number(product.quantity) > 0),
          allowBackorder: Boolean((product as any).allowBackorder),
          averageRating: product.averageRating,
          reviewCount: product.reviewCount,
        });
        const breadcrumb = buildBreadcrumbJsonLd([
          { name: 'Home', url: `${SITE}/` },
          { name: 'Products', url: `${SITE}/products` },
          { name: product.name, url: productUrl },
        ]);
        // DigitalDocument sibling entity: published when the
        // product is digital so Google can pick up fileFormat
        // and contentSize. The graph holds all three together;
        // the validator treats each entry independently.
        const entities: any[] = [productLd, breadcrumb];
        if (isDigital) {
          // The API derives the file format server-side (the raw
          // downloadUrl is withheld from public responses). The
          // extension fallback covers fixtures/stubs that still carry
          // the URL; anything unrecognised falls back to "Download".
          const fileFormat =
            (product as any).fileFormat ||
            (() => {
              const url = (product as any).downloadUrl || '';
              const ext = (url.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
              return (
                ext === 'pdf' ? 'application/pdf' :
                ext === 'epub' ? 'application/epub+zip' :
                ext === 'mobi' ? 'application/x-mobipocket-ebook' :
                ext === 'zip' ? 'application/zip' :
                ext === 'mp3' ? 'audio/mpeg' :
                ext === 'wav' ? 'audio/wav' :
                ext === 'mp4' ? 'video/mp4' :
                ext === 'mov' ? 'video/quicktime' :
                ext === 'exe' ? 'application/x-msdownload' :
                ext === 'dmg' ? 'application/x-apple-diskimage' :
                'Download'
              );
            })();
          entities.push(
            buildDigitalDocumentJsonLd({
              url: productUrl,
              name: product.name,
              description,
              images: product.images?.map((img: any) => getImageUrl(img.url)) || [],
              fileFormat,
            }),
          );
        }
        return (
          <script
            type="application/ld+json"
            data-testid="json-ld-product"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(asGraph(entities)) }}
          />
        );
      })()}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ 
        marginBottom: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        fontSize: '14px', 
        color: 'var(--muted, #666)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>Home</Link>
        <span>/</span>
        <Link href="/products" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>Products</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>{product.name}</span>
      </nav>

      {/* Product Details - Responsive Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: isMobile ? '24px' : '32px',
        marginBottom: '48px',
      }}>
        {/* Product Images */}
        <div>
          {/* Main Image - the LCP element, so it loads with
              fetchpriority=high (next/image `priority`). */}
          <div style={{
            position: 'relative',
            aspectRatio: '1',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: '12px',
          }}>
            {allImages[selectedImageIndex]?.url ? (
              <StoreImage
                src={getProductImage(allImages[selectedImageIndex], 'detail')}
                alt={product.name}
                fill
                priority
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '80px' }}>{getCategoryEmoji(product.category?.name)}</span>
            )}
          </div>
          
          {/* Thumbnails */}
          {allImages.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
              {allImages.map((img, i) => (
                <div 
                  key={img.id || i}
                  onClick={() => setSelectedImageIndex(i)}
                  style={{
                    position: 'relative',
                    width: '60px',
                    height: '60px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: i === selectedImageIndex ? '2px solid #000' : '2px solid transparent',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {img.url ? (
                    <StoreImage src={getProductImage(img, 'thumbnail')} alt="" fill style={{ objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '24px' }}>{getCategoryEmoji(product.category?.name)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div>
          <p style={{ fontSize: '14px', color: 'var(--muted, #666)', marginBottom: '8px' }}>{product.category?.name}</p>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>{product.name}</h1>
          
          {/* Rating */}
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '2px' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} style={{ color: i <= Math.floor(product.averageRating || 0) ? '#f59e0b' : '#d1d5db', fontSize: '18px' }}>★</span>
              ))}
            </div>
            <span style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>
              {product.averageRating || 0} ({product.reviewCount || 0} reviews)
            </span>
          </div>

          {/* Price */}
          <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            {/* "Instant download" badge for digital products. Sits
                above the price so a customer can tell at a glance
                that this is a digital SKU. */}
            {isDigital && (
              <div
                data-testid="digital-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  marginBottom: '10px',
                  borderRadius: '50px',
                  backgroundColor: 'var(--success-bg, #ecfdf5)',
                  color: 'var(--success-text, #047857)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <span>⚡</span>
                <span>Instant download</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '32px', fontWeight: 'bold' }} data-testid="current-price">
                {formatPrice(currentPrice, settings.currencySymbol)}
              </span>
              {/* Sale price: variant-level takes priority; falls back
                  to product.compareAtPrice when the product itself is
                  on sale but no variant is selected. */}
              {(() => {
                const compareAt = currentVariant?.compareAtPrice ?? product.compareAtPrice;
                if (!compareAt || Number(compareAt) <= currentPrice) return null;
                return (
                  <>
                    <span
                      style={{ fontSize: '18px', color: 'var(--muted, #666)', textDecoration: 'line-through' }}
                      data-testid="compare-at-price"
                    >
                      {formatPrice(Number(compareAt), settings.currencySymbol)}
                    </span>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '50px',
                      backgroundColor: 'var(--danger-bg, #fef2f2)',
                      color: 'var(--danger-text, #ef4444)',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}>
                      Save {formatPrice(Number(compareAt) - currentPrice, settings.currencySymbol)}
                    </span>
                  </>
                );
              })()}
            </div>
            <p style={{ marginTop: '8px', fontSize: '14px', color: isDigital ? '#22c55e' : (product.quantity > 0 ? '#22c55e' : ((product as any).allowBackorder ? '#f59e0b' : '#ef4444')) }}>
              {isDigital
                ? '✓ Available — download link delivered instantly after purchase'
                : product.quantity > 0
                ? `✓ In stock (${product.quantity} available)`
                : (product as any).allowBackorder
                  ? '⏳ Preorder available (ships when restocked)'
                  : '✗ Out of stock'}
            </p>
            {isDigital && (downloadLimit !== null || downloadExpiryDays !== null) && (
              <p
                data-testid="digital-meta"
                style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280' }}
              >
                {downloadLimit !== null && (
                  <span>
                    ⬇ {downloadLimit === 1 ? '1 download' : `${downloadLimit} downloads`} per purchase
                    {downloadExpiryDays !== null ? ' · ' : ''}
                  </span>
                )}
                {downloadExpiryDays !== null && (
                  <span>
                    ⏰ Links expire {downloadExpiryDays === 1 ? 'after 1 day' : `after ${downloadExpiryDays} days`}
                  </span>
                )}
              </p>
            )}
            {(product as any).expectedRestockAt && (product as any).allowBackorder && (
              <p style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
                Expected restock: {new Date((product as any).expectedRestockAt).toLocaleDateString()}
              </p>
            )}
            
            {/* Stock Alert for out of stock */}
            {product.quantity <= 0 && (
              <div style={{ marginTop: '12px' }}>
                {stockAlertSet ? (
                  <p style={{ fontSize: '14px', color: '#22c55e' }}>
                    ✓ You will be notified when this product is back in stock!
                  </p>
                ) : showStockAlertForm ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="email"
                      value={stockAlertEmail}
                      onChange={(e) => setStockAlertEmail(e.target.value)}
                      placeholder="Enter your email"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid var(--border, #e5e5e5)',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                    <button
                      onClick={handleStockAlert}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--brand, #000)',
                        color: 'var(--brand-text, #fff)',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Notify Me
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleStockAlert}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f5f5f5',
                      border: '1px solid var(--border, #e5e5e5)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    🔔 Notify me when back in stock
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Short Description */}
          {product.shortDescription && (
            <p style={{ marginTop: '20px', fontSize: '15px', color: '#555', lineHeight: 1.6 }}>
              {product.shortDescription}
            </p>
          )}

          {/* Typed options swatch picker (case 7 of the variant
              first-class treatment). Reads the product's Option
              tree from GET /api/products/:id/options and renders
              one row per option, with one chip per value. Clicking
              a chip updates the chosen-values state; the matching
              variant is then highlighted in the chip list below. */}
          {typedOptions.length > 0 && product.variants && product.variants.length > 0 && (
            <div style={{ marginTop: '20px' }} data-testid="typed-options-picker">
              {typedOptions.map((opt) => (
                <div key={opt.id} style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--body-text, #111)' }}>
                    {opt.name}
                    {chosen[opt.name] && (
                      <span style={{ fontWeight: 400, color: 'var(--muted, #666)', marginInlineStart: '6px' }}>
                        {chosen[opt.name]}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }} data-testid={`swatches-${opt.name}`}>
                    {opt.values.map((v) => {
                      const selected = chosen[opt.name] === v.value;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          data-testid={`swatch-${opt.name}-${v.value}`}
                          onClick={() => {
                            const next = { ...chosen, [opt.name]: v.value };
                            setChosen(next);
                            // Try to match a variant to the new
                            // selection; if no match, the previously
                            // selected variant stays highlighted.
                            const match = pickVariant(
                              (product.variants as any) || [],
                              typedOptions,
                              next,
                            );
                            if (match) setSelectedVariant(match.id);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            borderRadius: '999px',
                            border: selected ? '2px solid var(--brand, #111)' : '1px solid var(--border, #d4d4d4)',
                            background: selected ? 'var(--surface-2, #f5f5f5)' : 'var(--card-bg, #fff)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: selected ? 600 : 400,
                          }}
                        >
                          {v.swatch && (
                            <span
                              aria-hidden="true"
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                background: v.swatch,
                                border: '1px solid rgba(0,0,0,0.15)',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span>{swatchLabel(v.value)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
                Options: {currentVariantName && <span style={{ fontWeight: 400, color: 'var(--muted, #666)' }}>{getVariantDisplay(currentVariant)}</span>}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {product.variants.map((variant) => {
                  const outOfStock = Number(variant.quantity) <= 0;
                  const onSale = typeof variant.compareAtPrice === 'number'
                    && variant.compareAtPrice > Number(variant.price);
                  return (
                    <button
                      key={variant.id}
                      data-testid={`variant-chip-${variant.id}`}
                      onClick={() => setSelectedVariant(variant.id)}
                      disabled={outOfStock}
                      title={outOfStock ? 'Out of stock' : undefined}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: selectedVariant === variant.id ? '2px solid #000' : '1px solid #e5e5e5',
                        backgroundColor: selectedVariant === variant.id ? '#f5f5f5' : 'white',
                        fontSize: '14px',
                        cursor: outOfStock ? 'not-allowed' : 'pointer',
                        fontWeight: selectedVariant === variant.id ? 600 : 400,
                        opacity: outOfStock ? 0.5 : 1,
                        textDecoration: outOfStock ? 'line-through' : 'none',
                      }}
                    >
                      {getVariantDisplay(variant)}
                      {onSale && (
                        <span
                          style={{
                            marginInlineStart: '6px',
                            color: 'var(--muted, #666)',
                            textDecoration: 'line-through',
                            fontSize: '12px',
                          }}
                          data-testid={`variant-compare-${variant.id}`}
                        >
                          {formatPrice(Number(variant.compareAtPrice), settings.currencySymbol)}
                        </span>
                      )}
                      <span style={{ marginInlineStart: '6px', color: onSale ? 'var(--sale, #dc2626)' : 'var(--muted, #666)', fontWeight: onSale ? 700 : 400 }}>
                        {formatPrice(Number(variant.price), settings.currencySymbol)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Quantity:</h3>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '6px',
              border: '1px solid var(--border, #e5e5e5)',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{ padding: '10px 16px', fontSize: '16px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer' }}
              >
                -
              </button>
              <span style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 600 }}>{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(product.quantity, quantity + 1))}
                style={{ padding: '10px 16px', fontSize: '16px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer' }}
              >
                +
              </button>
            </div>
          </div>

          {/* Add to Cart Buttons */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleAddToCart}
                disabled={!isDigital && product.quantity <= 0 && !(product as any).allowBackorder}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  backgroundColor: (!isDigital && product.quantity <= 0 && !(product as any).allowBackorder) ? '#ccc' : (addedToCart ? '#22c55e' : '#000'),
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: (!isDigital && product.quantity <= 0 && !(product as any).allowBackorder) ? 'not-allowed' : 'pointer',
                }}
              >
                {isDigital
                  ? (addedToCart ? '✓ Added!' : 'Add to Cart')
                  : (product.quantity <= 0
                    ? ((product as any).allowBackorder ? '⏳ Preorder' : 'Out of Stock')
                    : (addedToCart ? '✓ Added!' : 'Add to Cart'))}
              </button>
              <button
                onClick={handleWishlist}
                style={{
                  padding: '14px',
                  backgroundColor: inWishlist ? '#fef2f2' : 'white',
                  color: inWishlist ? '#ef4444' : '#000',
                  border: `2px solid ${inWishlist ? '#ef4444' : '#e5e5e5'}`,
                  borderRadius: '6px',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                {inWishlist ? '❤️' : '🤍'}
              </button>
            </div>
            <button
              onClick={handleBuyNow}
              disabled={!isDigital && product.quantity <= 0}
              data-testid="buy-now-button"
              style={{
                width: '100%',
                padding: '14px 24px',
                backgroundColor: 'var(--card-bg, white)',
                color: (!isDigital && product.quantity <= 0) ? '#ccc' : '#000',
                border: `2px solid ${(!isDigital && product.quantity <= 0) ? '#ccc' : '#000'}`,
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: (!isDigital && product.quantity <= 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {isDigital ? '⬇ Download now' : 'Buy Now'}
            </button>
            <button
              onClick={() =>
                toggleCompare({
                  id: product.id,
                  name: product.name,
                  slug: product.slug,
                  price: currentPrice,
                  image: getProductImage(product),
                })
              }
              aria-pressed={isCompared(product.id)}
              style={{
                width: '100%',
                padding: '10px 24px',
                backgroundColor: isCompared(product.id) ? '#eef2ff' : 'transparent',
                color: isCompared(product.id) ? '#4338ca' : 'var(--muted, #666)',
                border: `1px solid ${isCompared(product.id) ? '#c7d2fe' : 'var(--border, #e5e5e5)'}`,
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isCompared(product.id) ? '✓ Added to compare' : '⚖️ Compare'}
            </button>
          </div>

          {/* SKU */}
          <p style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
            SKU: {product.sku}
          </p>
        </div>
      </div>

      {/* Product Description */}
      <div style={{ padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '48px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px' }}>Description</h2>
        {/* Descriptions are authored in the admin rich-text editor, so render
            the HTML. The editor sanitises on input and the API sanitises on
            save; this only ever displays tags from that allow-list. */}
        <div
          style={{ lineHeight: 1.8, color: 'var(--body-text, #333)', fontSize: '16px' }}
          dangerouslySetInnerHTML={{ __html: product.description || '' }}
        />
      </div>

      {/* Reviews Section */}
      <ReviewSection productId={product.id} productName={product.name} />
    </div>
    </>
  );
}
