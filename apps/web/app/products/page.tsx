'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Product, getCategoryEmoji } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const { settings } = useStoreSettings();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.getProducts({ limit: 100 });
      setProducts(response.data || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort products
  const filteredProducts = products
    .filter(p => {
      const matchesCategory = selectedCategory === 'all' || 
        p.category?.slug === selectedCategory || 
        p.category?.name?.toLowerCase().replace(/\s+/g, '-') === selectedCategory;
      const matchesSearch = !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'price-low': return a.price - b.price;
        case 'price-high': return b.price - a.price;
        case 'rating': return (b.averageRating || 0) - (a.averageRating || 0);
        case 'name': return a.name.localeCompare(b.name);
        default: return 0;
      }
    });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ 
        marginBottom: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        fontSize: '14px', 
        color: '#666',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Products</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>Products</h1>
        <p style={{ marginTop: '8px', color: '#666' }}>
          {loading ? 'Loading...' : `Showing ${filteredProducts.length} products`}
        </p>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '6px',
            border: '1px solid #e5e5e5',
            fontSize: '16px',
            outline: 'none',
          }}
        />
      </div>

      {/* Filters Row */}
      <div style={{ 
        marginBottom: '24px', 
        display: 'flex', 
        flexDirection: 'column',
        gap: '16px',
      }}>
        {/* Category Filters - Scrollable on mobile */}
        <div style={{ 
          display: 'flex', 
          overflowX: 'auto', 
          gap: '8px',
          paddingBottom: '8px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {['all', 'electronics', 'clothing', 'books', 'digital-products'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                border: selectedCategory === cat ? '2px solid #000' : '1px solid #e5e5e5',
                backgroundColor: selectedCategory === cat ? '#000' : 'white',
                color: selectedCategory === cat ? '#fff' : '#000',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: '#666', whiteSpace: 'nowrap' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #e5e5e5',
              backgroundColor: 'white',
              fontSize: '14px',
              cursor: 'pointer',
              flex: 1,
            }}
          >
            <option value="newest">Newest</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Highest Rated</option>
            <option value="name">Name: A-Z</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '64px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <p style={{ fontSize: '18px', color: '#666' }}>Loading products...</p>
        </div>
      )}

      {/* No Results */}
      {!loading && filteredProducts.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '48px 20px',
          color: '#666'
        }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>😕</p>
          <p style={{ fontSize: '18px' }}>No products found</p>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              style={{
                marginTop: '16px',
                padding: '10px 20px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Clear Search
            </button>
          )}
        </div>
      )}

      {/* Product Grid */}
      {!loading && filteredProducts.length > 0 && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
          gap: '16px' 
        }}>
          {filteredProducts.map((product) => (
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
                transition: 'box-shadow 0.2s',
                position: 'relative',
              }}
            >
              {/* Discount Badge */}
              {product.compareAtPrice && (
                <div style={{
                  position: 'absolute',
                  left: '8px',
                  top: '8px',
                  zIndex: 10,
                  borderRadius: '4px',
                  backgroundColor: '#ef4444',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'white',
                }}>
                  -{Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}%
                </div>
              )}

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
                  <img 
                    src={product.images[0].url} 
                    alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '48px' }}>{getCategoryEmoji(product.category?.name)}</span>
                )}
              </div>

              {/* Product Info */}
              <div style={{ padding: '12px' }}>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                  {product.category?.name}
                </p>
                <h3 style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', lineHeight: 1.3 }}>
                  {product.name}
                </h3>
                
                {/* Rating */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ color: '#f59e0b', fontSize: '12px' }}>★</span>
                  <span style={{ fontSize: '12px' }}>{product.averageRating || 0}</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>({product.reviewCount || 0})</span>
                </div>

                {/* Price */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{formatPrice(product.price, settings.currencySymbol)}</span>
                  {product.compareAtPrice && (
                    <span style={{ fontSize: '14px', color: '#666', textDecoration: 'line-through' }}>
                      {formatPrice(product.compareAtPrice, settings.currencySymbol)}
                    </span>
                  )}
                </div>

                {/* Stock */}
                <p style={{ marginTop: '8px', fontSize: '12px', color: product.quantity > 0 ? '#22c55e' : '#ef4444' }}>
                  {product.quantity > 0 ? '✓ In Stock' : '✗ Out of Stock'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* API Not Running Notice */}
      {!loading && products.length === 0 && (
        <div style={{
          marginTop: '32px',
          padding: '24px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>
            ℹ️ No products loaded from API
          </p>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Make sure the API server is running: <code>npm run dev:api</code>
          </p>
        </div>
      )}
    </div>
  );
}
