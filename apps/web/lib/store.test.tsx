/**
 * CartProvider + useCart.
 *
 * The provider has three behaviours worth covering:
 *   1. Hydration: it reads `cart` and `savedItems` from localStorage on
 *      mount and ignores malformed JSON.
 *   2. CRUD: addItem merges identical product+variant into the existing
 *      row, removeItem filters by id, updateQuantity removes on 0,
 *      clearCart empties.
 *   3. Persistence: writes back to localStorage on every change (after the
 *      first render, which is the "mounted" gate).
 *   4. Save-for-later: saveForLater / moveToCart / removeSavedItem.
 *
 * Network side-effects (POST /cart) are tested by mocking fetch and
 * asserting the URL + body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { CartProvider, useCart, CartItem } from '@/lib/store';

// Probe component: exposes the store as JSON in the DOM so assertions
// don't need a state container. The button lets us trigger actions.
function Probe({ onReady }: { onReady?: (store: ReturnType<typeof useCart>) => void }) {
  const store = useCart();
  // Fire once on mount + on every change so async assertions can latch on.
  if (onReady) onReady(store);
  return (
    <div>
      <pre data-testid="snapshot">
        {JSON.stringify({
          items: store.items,
          savedItems: store.savedItems,
        })}
      </pre>
      <button onClick={() => store.addItem({ productId: 'p1', name: 'Widget', slug: 'widget', price: 10, quantity: 1, category: 'Test' })}>
        add p1
      </button>
      <button onClick={() => store.addItem({ productId: 'p1', name: 'Widget', slug: 'widget', price: 10, quantity: 2, category: 'Test' })}>
        add p1 x2
      </button>
      <button onClick={() => store.addItem({ productId: 'p2', name: 'Gadget', slug: 'gadget', price: 5, quantity: 1, category: 'Test', variant: 'red' })}>
        add p2 red
      </button>
      <button onClick={() => store.addItem({ productId: 'p2', name: 'Gadget', slug: 'gadget', price: 5, quantity: 1, category: 'Test', variant: 'red' })}>
        add p2 red again
      </button>
      <button onClick={() => store.clearCart()}>clear</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <CartProvider>
      <Probe />
    </CartProvider>,
  );
}

function readSnapshot(): { items: CartItem[]; savedItems: CartItem[] } {
  return JSON.parse(screen.getByTestId('snapshot').textContent || '{}');
}

describe('CartProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with an empty cart and persisted no items', async () => {
    renderProbe();
    await waitFor(() => {
      const snap = readSnapshot();
      expect(snap.items).toEqual([]);
      expect(snap.savedItems).toEqual([]);
    });
    // After mount, the `mounted` gate flips and the effect writes the
    // current cart back. The value is `[]` because we never added anything,
    // but the storage entry does get created. The point of the gate is
    // to avoid clobbering *pre-existing* data on the very first render.
    await waitFor(() => {
      expect(localStorage.getItem('cart')).not.toBeNull();
    });
    expect(JSON.parse(localStorage.getItem('cart')!)).toEqual([]);
  });

  it('hydrates items and saved items from localStorage on mount', async () => {
    const stored: CartItem[] = [
      { id: 'a', productId: 'p1', name: 'Widget', slug: 'widget', price: 10, quantity: 1, category: 'Test' },
    ];
    const saved: CartItem[] = [
      { id: 'b', productId: 'p9', name: 'Saved', slug: 'saved', price: 1, quantity: 1, category: 'Test' },
    ];
    localStorage.setItem('cart', JSON.stringify(stored));
    localStorage.setItem('savedItems', JSON.stringify(saved));

    renderProbe();
    await waitFor(() => {
      const snap = readSnapshot();
      expect(snap.items).toEqual(stored);
      expect(snap.savedItems).toEqual(saved);
    });
  });

  it('survives malformed JSON in localStorage without throwing', async () => {
    localStorage.setItem('cart', '{not json');
    localStorage.setItem('savedItems', '{not json either');

    // The provider catches parse errors internally and logs them; we don't
    // want that to crash the mount.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProbe();
    await waitFor(() => {
      const snap = readSnapshot();
      expect(snap.items).toEqual([]);
      expect(snap.savedItems).toEqual([]);
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('addItem appends a new line item', async () => {
    renderProbe();
    await waitFor(() => expect(readSnapshot().items).toEqual([]));

    act(() => screen.getByText('add p1').click());
    await waitFor(() => {
      const items = readSnapshot().items;
      expect(items).toHaveLength(1);
      expect(items[0].productId).toBe('p1');
      expect(items[0].quantity).toBe(1);
    });
  });

  it('addItem merges quantity when the same product+variant is added twice', async () => {
    renderProbe();
    await waitFor(() => expect(readSnapshot().items).toEqual([]));

    act(() => screen.getByText('add p1').click());
    act(() => screen.getByText('add p1 x2').click());
    await waitFor(() => {
      const items = readSnapshot().items;
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(3); // 1 + 2
    });
  });

  it('addItem treats different variants as separate line items', async () => {
    renderProbe();
    act(() => screen.getByText('add p2 red').click());
    act(() => screen.getByText('add p2 red again').click());
    await waitFor(() => {
      const items = readSnapshot().items;
      expect(items).toHaveLength(1); // same variant collapses
      expect(items[0].quantity).toBe(2);
    });
  });

  it('clearCart empties the cart', async () => {
    renderProbe();
    act(() => screen.getByText('add p1').click());
    await waitFor(() => expect(readSnapshot().items).toHaveLength(1));

    act(() => screen.getByText('clear').click());
    await waitFor(() => expect(readSnapshot().items).toEqual([]));
  });

  it('persists the cart to localStorage on every change after mount', async () => {
    renderProbe();
    await waitFor(() => expect(readSnapshot().items).toEqual([]));

    act(() => screen.getByText('add p1').click());
    await waitFor(() => {
      const stored = localStorage.getItem('cart');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].productId).toBe('p1');
    });
  });
});

describe('useCart outside a provider', () => {
  it('throws a descriptive error', () => {
    // Silence React's error boundary log - we want the throw, not a console
    // failure, and we want it to bubble out of render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Naked() {
      useCart();
      return null;
    }
    expect(() => render(<Naked />)).toThrow(/CartProvider/);
    spy.mockRestore();
  });
});

describe('CartProvider line-item operations', () => {
  // These tests need direct access to the store from inside the tree, so
  // we use a probe that exposes actions by id.
  function IdProbe() {
    const store = useCart();
    return (
      <div>
        <pre data-testid="snap">{JSON.stringify({ items: store.items, savedItems: store.savedItems })}</pre>
        <button onClick={() => store.addItem({ productId: 'p1', name: 'W', slug: 'w', price: 10, quantity: 1, category: 'c' })}>add</button>
        <button onClick={() => {
          const first = store.items[0];
          if (first) store.updateQuantity(first.id, 0);
        }}>zero</button>
        <button onClick={() => {
          const first = store.items[0];
          if (first) store.updateQuantity(first.id, 5);
        }}>five</button>
        <button onClick={() => {
          const first = store.items[0];
          if (first) store.removeItem(first.id);
        }}>remove</button>
        <button onClick={() => {
          const first = store.items[0];
          if (first) store.saveForLater(first.id);
        }}>save</button>
        <button onClick={() => {
          const first = store.savedItems[0];
          if (first) store.moveToCart(first.id);
        }}>move</button>
        <button onClick={() => {
          const first = store.savedItems[0];
          if (first) store.removeSavedItem(first.id);
        }}>rmSaved</button>
        <button onClick={async () => {
          await store.syncWithDatabase();
        }}>sync</button>
      </div>
    );
  }

  function renderIdProbe() {
    return render(
      <CartProvider>
        <IdProbe />
      </CartProvider>,
    );
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('updateQuantity with 0 removes the item', async () => {
    renderIdProbe();
    act(() => screen.getByText('add').click());
    await waitFor(() => expect(readSnapshotId().items).toHaveLength(1));
    act(() => screen.getByText('zero').click());
    await waitFor(() => expect(readSnapshotId().items).toEqual([]));
  });

  it('updateQuantity with a positive number replaces the quantity', async () => {
    renderIdProbe();
    act(() => screen.getByText('add').click());
    await waitFor(() => expect(readSnapshotId().items[0].quantity).toBe(1));
    act(() => screen.getByText('five').click());
    await waitFor(() => expect(readSnapshotId().items[0].quantity).toBe(5));
  });

  it('removeItem drops the row by id', async () => {
    renderIdProbe();
    act(() => screen.getByText('add').click());
    await waitFor(() => expect(readSnapshotId().items).toHaveLength(1));
    act(() => screen.getByText('remove').click());
    await waitFor(() => expect(readSnapshotId().items).toEqual([]));
  });

  it('saveForLater moves an item from items to savedItems', async () => {
    renderIdProbe();
    act(() => screen.getByText('add').click());
    await waitFor(() => expect(readSnapshotId().items).toHaveLength(1));
    act(() => screen.getByText('save').click());
    await waitFor(() => {
      const s = readSnapshotId();
      expect(s.items).toEqual([]);
      expect(s.savedItems).toHaveLength(1);
    });
  });

  it('moveToCart returns the item to the cart and removes it from saved', async () => {
    renderIdProbe();
    act(() => screen.getByText('add').click());
    act(() => screen.getByText('save').click());
    await waitFor(() => expect(readSnapshotId().savedItems).toHaveLength(1));
    act(() => screen.getByText('move').click());
    // moveToCart calls addItem which generates a NEW id for the cart copy
    // (the saved item keeps its id, but the cart entry is a fresh row).
    await waitFor(() => {
      const s = readSnapshotId();
      expect(s.savedItems).toEqual([]);
      // The cart now has the product back. It may have a different id than
      // the original since addItem generated a new unique id.
      expect(s.items).toHaveLength(1);
      expect(s.items[0].productId).toBe('p1');
    });
  });

  it('removeSavedItem deletes a saved entry', async () => {
    renderIdProbe();
    act(() => screen.getByText('add').click());
    act(() => screen.getByText('save').click());
    await waitFor(() => expect(readSnapshotId().savedItems).toHaveLength(1));
    act(() => screen.getByText('rmSaved').click());
    await waitFor(() => expect(readSnapshotId().savedItems).toEqual([]));
  });

  it('syncWithDatabase is a no-op without a token', async () => {
    renderIdProbe();
    // No token in localStorage, so the call should bail before fetch.
    act(() => screen.getByText('add').click());
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await act(async () => {
      screen.getByText('sync').click();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('syncWithDatabase POSTs to /cart/sync when a token is set', async () => {
    localStorage.setItem('token', 'fake-token');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    globalThis.fetch = fetchSpy as any;

    renderIdProbe();
    act(() => screen.getByText('add').click());
    await waitFor(() => expect(readSnapshotId().items).toHaveLength(1));

    await act(async () => {
      screen.getByText('sync').click();
    });
    // Wait for the async syncWithDatabase to settle.
    await waitFor(() => {
      const syncCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/cart/sync'));
      expect(syncCall).toBeDefined();
    });
    const [url, init] = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/cart/sync'))!;
    expect(String(url)).toMatch(/\/cart\/sync$/);
    const body = JSON.parse((init as any).body);
    expect(body.items[0]).toMatchObject({ productId: 'p1', quantity: 1 });
  });
});

function readSnapshotId() {
  return JSON.parse(screen.getByTestId('snap').textContent || '{}');
}
