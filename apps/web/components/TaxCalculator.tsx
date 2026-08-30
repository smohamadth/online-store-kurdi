// TaxCalculator - the checkout's tax box. Asks POST /api/tax/
// calculate with the shipping location + line items and shows the
// per-item breakdown; the parent uses the total for the order's
// taxAmount. Falls back to a flat 10% estimate when the API is
// unreachable (mirroring the server's own fallback).

'use client';

import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/http';

interface TaxInfo {
  taxRate: number;
  taxName: string;
  taxAmount: number;
  subtotal: number;
  totalWithTax: number;
}

interface TaxCalculatorProps {
  country: string;
  state?: string;
  city?: string;
  zipCode?: string;
  subtotal: number;
  items?: Array<{
    productId: string;
    price: number;
    quantity: number;
    taxClass?: string;
  }>;
  onTaxCalculated: (tax: TaxInfo) => void;
}

export default function TaxCalculator({
  country,
  state,
  city,
  zipCode,
  subtotal,
  items,
  onTaxCalculated,
}: TaxCalculatorProps) {
  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (country && subtotal > 0) {
      calculateTax();
    }
  }, [country, state, city, zipCode, subtotal]);

  const calculateTax = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/tax/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          state,
          city,
          zipCode,
          subtotal,
          items,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const tax = data.data;
        setTaxInfo(tax);
        onTaxCalculated(tax);
      } else {
        // Fallback calculation
        const defaultTaxRate = 0.10; // 10%
        const taxAmount = subtotal * defaultTaxRate;
        const tax: TaxInfo = {
          taxRate: defaultTaxRate,
          taxName: 'Tax',
          taxAmount: Math.round(taxAmount * 100) / 100,
          subtotal,
          totalWithTax: Math.round((subtotal + taxAmount) * 100) / 100,
        };
        setTaxInfo(tax);
        onTaxCalculated(tax);
      }
    } catch (err) {
      console.log('Tax API not available, using default rate');
      // Fallback calculation
      const defaultTaxRate = 0.10;
      const taxAmount = subtotal * defaultTaxRate;
      const tax: TaxInfo = {
        taxRate: defaultTaxRate,
        taxName: 'Tax',
        taxAmount: Math.round(taxAmount * 100) / 100,
        subtotal,
        totalWithTax: Math.round((subtotal + taxAmount) * 100) / 100,
      };
      setTaxInfo(tax);
      onTaxCalculated(tax);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '8px', fontSize: '14px', color: '#666' }}>
        Calculating tax...
      </div>
    );
  }

  if (!taxInfo) {
    return null;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
      <span style={{ color: '#666' }}>
        {taxInfo.taxName} ({(taxInfo.taxRate * 100).toFixed(1)}%)
      </span>
      <span style={{ fontWeight: 500 }}>
        ${taxInfo.taxAmount.toFixed(2)}
      </span>
    </div>
  );
}
