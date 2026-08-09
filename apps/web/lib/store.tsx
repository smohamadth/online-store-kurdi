'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { api } from './api';

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
}

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  syncWithDatabase: () => Promise<void>;
}

// Cart Context
const CartContext = createContext<CartStore | null>(null);

// Cart Provider
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  // Load cart from localStorage on mount
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
        // Add new item
        return [...prev, { ...item, id: Date.now().toString() }];
      }
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

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getTotal,
      getItemCount,
      syncWithDatabase,
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
