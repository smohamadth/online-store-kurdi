'use client';

import { useEffect, useState } from 'react';
import { getBundles, type Bundle } from '@/lib/marketing';
import { useCart } from '@/lib/store';

export interface BundleOfferProps {
  /** Show only bundles containing this product (the PDP case). */
  productId?: string;
  /** Currency symbol for display. */
  currencySymbol?: string;
  /** Cap how many bundles render. */
  max?: number;
}

/** Local price formatter: two decimals, symbol first. */
function money(value: number, symbol: string): string {
  return `${symbol}${(Number(value) || 0).toFixed(2)}`;
}

/**
 * "Frequently bought together" bundle offer.
 *
 * The bought-together recommendation data already existed but was not
 * monetisable - there was no bundle entity and no bundle price. This renders
 * the set with its saving and adds every component to the cart in one action.
 *
 * All pricing comes from the API, which computes it server-side from CURRENT
 * product prices. The component never derives a price of its own: doing so
 * would let a stale client show a discount the server will not honour at
 * checkout.
 */
export default function BundleOffer({
  productId,
  currencySymbol = '$',
  max = 3,
}: BundleOfferProps) {
  const { addItem } = useCart();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await getBundles();
      if (!alive) return;

      const relevant = productId
        ? all.filter((b) => b.items.some((i) => i.productId === productId))
        : all;

      // An unavailable bundle is worse than no bundle: it advertises a deal
      // the shopper cannot complete. The API already computes `available`
      // from component stock.
      setBundles(relevant.filter((b) => b.available).slice(0, max));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [productId, max]);

  function addBundle(bundle: Bundle) {
    // Add each component as its own cart line so stock, shipping weight and
    // fulfilment all behave normally. Lines carry the LIST price: the bundle
    // discount is applied server-side at order placement (see
    // computeBundleDiscount in the orders module), so discounting here would
    // double-count it. The server re-derives the saving from its own bundle
    // rows, meaning a stale client cannot talk checkout into a bigger one.
    for (const item of bundle.items) {
      addItem({
        productId: item.productId,
        name: item.name || 'Item',
        slug: '',
        price: item.price,
        quantity: item.quantity,
        category: 'Bundle',
      });
    }
    setAdded(bundle.id);
  }

  // Render nothing at all while loading or when there is nothing to show -
  // an empty "Frequently bought together" heading is worse than silence.
  if (loading || bundles.length === 0) return null;

  return (
    <section data-testid="bundle-offer" style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Frequently bought together</h2>

      {bundles.map((bundle) => (
        <div
          key={bundle.id}
          data-testid={`bundle-${bundle.slug}`}
          style={{
            border: '1px solid var(--color-border, #e5e5e5)',
            borderRadius: 'var(--radius-card, 8px)',
            padding: 16,
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{bundle.name}</h3>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {bundle.items.map((item) => (
              <li
                key={item.productId}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}
              >
                <span>
                  {item.name}
                  {item.quantity > 1 ? ` \u00d7 ${item.quantity}` : ''}
                </span>
                <span>{money(item.price * item.quantity, currencySymbol)}</span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              data-testid={`bundle-was-${bundle.slug}`}
              style={{ textDecoration: 'line-through', opacity: 0.6 }}
            >
              {money(bundle.itemsTotal, currencySymbol)}
            </span>
            <strong data-testid={`bundle-now-${bundle.slug}`} style={{ fontSize: 18 }}>
              {money(bundle.bundlePrice, currencySymbol)}
            </strong>
            {bundle.savings > 0 && (
              <span
                data-testid={`bundle-save-${bundle.slug}`}
                style={{ color: 'var(--color-success, #0a7)', fontSize: 14 }}
              >
                Save {money(bundle.savings, currencySymbol)}
              </span>
            )}
          </div>

          <button
            type="button"
            data-testid={`bundle-add-${bundle.slug}`}
            onClick={() => addBundle(bundle)}
            style={{
              marginTop: 12,
              padding: '10px 16px',
              borderRadius: 'var(--radius-button, 6px)',
              border: 'none',
              background: 'var(--color-primary, #111)',
              color: 'var(--color-on-primary, #fff)',
              cursor: 'pointer',
            }}
          >
            {added === bundle.id ? 'Added to cart' : 'Add all to cart'}
          </button>
        </div>
      ))}
    </section>
  );
}
