'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Product, getCategoryEmoji } from '@/lib/api';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch products from API
  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, sortBy, searchQuery]);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const params: any = {
        limit: 50,
      };

      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }

      if (searchQuery) {
        params.search = searchQuery;
      }

      if (sortBy === 'price-low') params.sort = 'price_asc';
      else if (sortBy === 'price-high') params.sort = 'price_desc';
      else if (sortBy === 'rating') params.sort = 'popular';
      else if (sortBy === 'name') params.sort = 'name_asc';
      else params.sort = 'newest';

      const response = await api.getProducts(params);
      setProducts(response.data || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setError('Failed to load products. Make sure the API server is running.');
      // Use fallback data if API fails
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  // Get unique categories from products
  const categories = ['all', ...new Set(products.map(p => p.category?.slug || p.category?.name?.toLowerCase() || ''))].filter(Boolean);

  // Filter products by category (client-side backup)
  const filteredProducts = selectedCategory === 'all'
    ? products
    : products.filter(p => 
        (p.category?.slug || p.category?.name?.toLowerCase()) === selectedCategory
      );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Products</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>Products</h1>
        <p style={{ marginTop: '8px', color: '#666' }}>
          {loading ? 'Loading...' : `Showing ${filteredProducts.length} products`}
        </p>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '24px' }}>
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
        marginBottom: '32px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Category Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {['all', 'electronics', 'clothing', 'books', 'digital-products'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                border: selectedCategory === cat ? '2px solid #000' : '1px solid #e5e5e5',
                backgroundColor: selectedCategory === cat ? '#000' : 'white',
                color: selectedCategory === cat ? '#fff' : '#000',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '10px 16px',
              borderRadius: '6px',
              border: '1px solid #e5e5e5',
              backgroundColor: 'white',
              fontSize: '14px',
              cursor: 'pointer',
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
          <p style={{ fontSize: '18px', color: '#666' }}>Loading products...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{ 
          textAlign: 'center', 
          padding: '32px',
          backgroundColor: '#fef2f2',
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>
          <button 
            onClick={fetchProducts}
            style={{
              padding: '10px 20px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Product Grid */}
      {!loading && filteredProducts.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '64px 20px',
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

      {!loading && filteredProducts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
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
                  left: '12px',
                  top: '12px',
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
                fontSize: '64px',
              }}>
                {getCategoryEmoji(product.category?.name)}
              </div>

              {/* Product Info */}
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                  {product.category?.name}
                </p>
                <h3 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>{product.name}</h3>
                
                {/* Rating */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ color: '#f59e0b' }}>★</span>
                  <span style={{ fontSize: '14px' }}>{product.averageRating || 0}</span>
                  <span style={{ fontSize: '14px', color: '#666' }}>({product.reviewCount || 0})</span>
                </div>

                {/* Price */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 'bold' }}>${product.price}</span>
                  {product.compareAtPrice && (
                    <span style={{ fontSize: '14px', color: '#666', textDecoration: 'line-through' }}>
                      ${product.compareAtPrice}
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
      {!loading && products.length === 0 && !error && (
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