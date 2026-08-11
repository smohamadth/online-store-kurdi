'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Product, getCategoryEmoji } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';

export default function DealsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { settings } = useStoreSettings();

  useEffect(() => {
    fetchDeals();
  }, []);

  const fetchDeals = async () => {
    try {
      const response = await api.getProducts({ limit: 100 });
      if (response.data) {
        // Filter products with compareAtPrice (on sale)
        const deals = response.data.filter(p => p.compareAtPrice && p.compareAtPrice > p.price);
        setProducts(deals);
      }
    } catch (err) {
      console.log('Failed to fetch deals');
    } finally {
      setLoading(false);
    }
  };

  const getDiscount = (price: number, comparePrice: number) => {
    return Math.round(((comparePrice - price) / comparePrice) * 100);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #ef4444, #f97316)',
        borderRadius: '16px',
        padding: '48px 32px',
        color: 'white',
        marginBottom: '40px',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '8px' }}>Special Deals</h1>
        <p style={{ fontSize: '18px', opacity: 0.9 }}>Save big on our best products</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px' }}>
          <p style={{ color: '#666' }}>Loading deals...</p>
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏷️</div>
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>No deals right now</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>Check back soon for new deals!</p>
          <Link href="/products" style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#000',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
          }}>
            Browse Products
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '24px',
        }}>
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{
                display: 'block',
                overflow: 'hidden',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                backgroundColor: 'white',
                textDecoration: 'none',
                color: '#000',
                position: 'relative',
              }}
            >
              {/* Discount Badge */}
              <div style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                padding: '6px 12px',
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '50px',
                fontSize: '14px',
                fontWeight: 700,
              }}>
                -{getDiscount(product.price, product.compareAtPrice!)}% OFF
              </div>

              {/* Product Image */}
              <div style={{
                aspectRatio: '1',
                backgroundColor: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {product.images && product.images.length > 0 && product.images[0]?.url ? (
                  <img src={product.images[0].url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '64px' }}>{getCategoryEmoji(product.category?.name)}</span>
                )}
              </div>

              {/* Product Info */}
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{product.category?.name}</p>
                <h3 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '15px' }}>{product.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                    {formatPrice(product.price, settings.currencySymbol)}
                  </span>
                  <span style={{ fontSize: '14px', color: '#999', textDecoration: 'line-through' }}>
                    {formatPrice(product.compareAtPrice!, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
