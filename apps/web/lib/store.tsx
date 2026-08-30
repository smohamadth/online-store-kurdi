// ---------------------------------------------------------------------------
// Cart context provider (the cart-icon badge, CartView, checkout all read
// this).
//
// Guest flow: the cart lives in localStorage ('cart' + 'savedItems'),
// so adding items works before login. Logged-in flow: on mount the
// provider fetches the server cart (GET /api/cart) and REPLACES the
// local items with it; from then on every mutation is mirrored to the
// API best-effort (a failed API call never blocks the local cart - see
// the "Try to ..." comments). syncWithDatabase() is the explicit import
// used after login (POST /api/cart/sync).
//
// The server cart is authoritative for stock holds (see the cart module
// on the API) - the localStorage copy is the guest UI state.
// ---------------------------------------------------------------------------
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { api } from './api';
import { trackEvent } from './tracking';

// Types
export interface CartItem {
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  variant?: string;
  variantId?: string;
  category: string;
  /** Digital vs physical; stamped at add-to-cart so views can
      * branch (e.g. "all digital" carts) without re-fetching. */
  type?: 'digital' | 'physical';
}

interface CartStore {
  items: CartItem[];
  savedItems: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  syncWithDatabase: () => Promise<void>;
  saveForLater: (id: string) => void;
  moveToCart: (id: string) => void;
  removeSavedItem: (id: string) => void;
}

// Cart Context
const CartContext = createContext<CartStore | null>(null);

// Cart Provider
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [savedItems, setSavedItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  // Load cart and saved items from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to parse cart:', e);
      }
    }
    
    const saved = localStorage.getItem('savedItems');
    if (saved) {
      try {
        setSavedItems(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved items:', e);
      }
    }

    // Try to sync with database if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
      fetchCartFromDatabase(token);
    }
  }, []);

  // Save cart to localStorage when it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('cart', JSON.stringify(items));
    }
  }, [items, mounted]);

  // Save savedItems to localStorage when it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('savedItems', JSON.stringify(savedItems));
    }
  }, [savedItems, mounted]);

  // Fetch cart from database
  const fetchCartFromDatabase = async (token: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data?.items && data.data.items.length > 0) {
          // Convert database items to local format
          const dbItems = data.data.items.map((item: any) => ({
            id: item.id,
            productId: item.productId,
            name: item.product.name,
            slug: item.product.slug,
            price: item.variant ? Number(item.variant.price) : Number(item.product.price),
            quantity: item.quantity,
            variant: item.variant?.name,
            variantId: item.variantId,
            category: item.product.category?.name || 'Other',
          }));
          setItems(dbItems);
        }
      }
    } catch (err) {
      console.log('Cart API not available, using local storage');
    }
  };

  // Sync local cart to database
  const syncWithDatabase = async () => {
    const token = localStorage.getItem('token');
    if (!token || items.length === 0) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/cart/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        }),
      });
    } catch (err) {
      console.log('Failed to sync cart with database');
    }
  };

  const addItem = (item: Omit<CartItem, 'id'>) => {
    setItems(prev => {
      // Check if item already exists (same product and variant)
      const existingIndex = prev.findIndex(
        i => i.productId === item.productId && i.variant === item.variant
      );

      if (existingIndex >= 0) {
        // Update quantity
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + item.quantity,
        };
        return updated;
      } else {
        // Add new item with unique ID (combining timestamp and random)
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return [...prev, { ...item, id: uniqueId }];
      }
    });

    // Analytics: add-to-cart event (feeds view-to-cart conversion).
    trackEvent({
      eventType: 'add_to_cart',
      productId: item.productId,
      metadata: { quantity: item.quantity },
    });

    // Try to save to database
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        }),
      }).catch(err => console.log('Failed to save to database'));
    }
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));

    // Try to remove from database
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/cart/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => console.log('Failed to remove from database'));
    }
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    );

    // Try to update in database
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/cart/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity }),
      }).catch(err => console.log('Failed to update in database'));
    }
  };

  const clearCart = () => {
    setItems([]);

    // Try to clear in database
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/cart`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => console.log('Failed to clear cart in database'));
    }
  };

  const getTotal = () => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const getItemCount = () => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  };

  // Save for later - move item from cart to saved items
  const saveForLater = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      setSavedItems(prev => {
        // Check if already saved
        if (prev.find(i => i.productId === item.productId && i.variant === item.variant)) {
          return prev;
        }
        return [...prev, item];
      });
      setItems(prev => prev.filter(i => i.id !== id));
    }
  };

  // Move to cart - move item from saved items to cart
  const moveToCart = (id: string) => {
    const item = savedItems.find(i => i.id === id);
    if (item) {
      addItem(item);
      setSavedItems(prev => prev.filter(i => i.id !== id));
    }
  };

  // Remove saved item
  const removeSavedItem = (id: string) => {
    setSavedItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <CartContext.Provider value={{
      items,
      savedItems,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getTotal,
      getItemCount,
      syncWithDatabase,
      saveForLater,
      moveToCart,
      removeSavedItem,
    }}>
      {children}
    </CartContext.Provider>
  );
}

// Hook to use cart
export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
