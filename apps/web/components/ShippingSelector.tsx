'use client';

import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/http';

interface ShippingMethod {
  id: string;
  name: string;
  description?: string;
  type: string;
  rate: number;
  isFree: boolean;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  zone?: {
    id: string;
    name: string;
  };
}

interface ShippingSelectorProps {
  country: string;
  state?: string;
  zipCode?: string;
  subtotal: number;
  onSelect: (method: ShippingMethod | null) => void;
  selectedMethodId?: string;
}

export default function ShippingSelector({
  country,
  state,
  zipCode,
  subtotal,
  onSelect,
  selectedMethodId,
}: ShippingSelectorProps) {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (country) {
      calculateShipping();
    }
  }, [country, state, zipCode, subtotal]);

  const calculateShipping = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/shipping/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          state,
          zipCode,
          subtotal,
          weight: 1, // Default weight
          itemCount: 1,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const shippingMethods = data.data || [];

        // A 200 with an EMPTY list is the common case on a fresh store, and it
        // used to fall through with nothing selected - which left "Place Order"
        // permanently disabled and made checkout impossible. Treat "no methods
        // configured" the same as "shipping API unavailable" and offer the
        // built-in defaults so the customer can always complete the purchase.
        if (shippingMethods.length === 0) {
          const fallback = buildDefaultMethods(subtotal);
          setMethods(fallback);
          if (!selectedMethodId) onSelect(fallback[0]);
          return;
        }

        setMethods(shippingMethods);
        if (!selectedMethodId) {
          onSelect(shippingMethods[0]);
        }
      } else {
        // Fallback to default methods
        const defaultMethods: ShippingMethod[] = [
          {
            id: 'standard',
            name: 'Standard Shipping',
            type: 'flat',
            rate: subtotal >= 100 ? 0 : 5.99,
            isFree: subtotal >= 100,
            minDeliveryDays: 5,
            maxDeliveryDays: 7,
          },
          {
            id: 'express',
            name: 'Express Shipping',
            type: 'flat',
            rate: 12.99,
            isFree: false,
            minDeliveryDays: 2,
            maxDeliveryDays: 3,
          },
        ];
        setMethods(defaultMethods);
        if (!selectedMethodId) {
          onSelect(defaultMethods[0]);
        }
      }
    } catch (err) {
      console.log('Shipping API not available, using defaults');
      const defaultMethods: ShippingMethod[] = [
        {
          id: 'standard',
          name: 'Standard Shipping',
          type: 'flat',
          rate: subtotal >= 100 ? 0 : 5.99,
          isFree: subtotal >= 100,
          minDeliveryDays: 5,
          maxDeliveryDays: 7,
        },
      ];
      setMethods(defaultMethods);
      if (!selectedMethodId) {
        onSelect(defaultMethods[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
        Calculating shipping rates...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderRadius: '6px', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
        No shipping methods available for this address
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {methods.map((method) => (
        <label
          key={method.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            border: `1px solid ${selectedMethodId === method.id ? '#000' : '#e5e5e5'}`,
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: selectedMethodId === method.id ? '#f9f9f9' : 'white',
          }}
          onClick={() => onSelect(method)}
        >
          <input
            type="radio"
            name="shipping"
            checked={selectedMethodId === method.id}
            onChange={() => onSelect(method)}
            style={{ cursor: 'pointer' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>{method.name}</span>
              <span style={{ fontWeight: 600 }}>
                {method.isFree ? (
                  <span style={{ color: '#22c55e' }}>Free</span>
                ) : (
                  `$${method.rate.toFixed(2)}`
                )}
              </span>
            </div>
            <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
              {method.minDeliveryDays}-{method.maxDeliveryDays} business days
            </p>
            {method.isFree && subtotal < 100 && (
              <p style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>
                Free shipping on orders over $100
              </p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}

/** Built-in shipping options used when the store has none configured. */
function buildDefaultMethods(subtotal: number): ShippingMethod[] {
  return [
    {
      id: 'standard',
      name: 'Standard Shipping',
      type: 'flat',
      rate: subtotal >= 100 ? 0 : 5.99,
      isFree: subtotal >= 100,
      minDeliveryDays: 5,
      maxDeliveryDays: 7,
    },
    {
      id: 'express',
      name: 'Express Shipping',
      type: 'flat',
      rate: 12.99,
      isFree: false,
      minDeliveryDays: 2,
      maxDeliveryDays: 3,
    },
  ];
}
