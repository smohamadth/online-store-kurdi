'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, Product, getCategoryEmoji } from '@/lib/api';

// Mock products for when API is not available
const MOCK_PRODUCTS: Product[] = [
  { id: '1', name: 'iPhone 15 Pro', slug: 'iphone-15-pro', description: 'Latest iPhone with A17 Pro chip', shortDescription: 'Latest iPhone', sku: 'IP-15-PRO', type: 'physical', status: 'active', price: 999.99, compareAtPrice: 1099.99, quantity: 50, images: [], category: { id: '1', name: 'Electronics', slug: 'electronics', image: null }, variants: [], averageRating: 4.8, reviewCount: 124, createdAt: '', updatedAt: '' },
  { id: '2', name: 'MacBook Pro 14"', slug: 'macbook-pro-14', description: 'Professional laptop with M3 chip', shortDescription: 'Professional laptop', sku: 'MBP-14', type: 'physical', status: 'active', price: 1599.99, quantity: 30, images: [], category: { id: '1', name: 'Electronics', slug: 'electronics', image: null }, variants: [], averageRating: 4.9, reviewCount: 89, createdAt: '', updatedAt: '' },
  { id: '3', name: 'Classic T-Shirt', slug: 'classic-t-shirt', description: 'Comfortable cotton t-shirt', shortDescription: 'Comfortable t-shirt', sku: 'TSHIRT-001', type: 'physical', status: 'active', price: 29.99, quantity: 200, images: [], category: { id: '2', name: 'Clothing', slug: 'clothing', image: null }, variants: [], averageRating: 4.5, reviewCount: 256, createdAt: '', updatedAt: '' },
  { id: '4', name: 'Web Development Course', slug: 'web-development-course', description: 'Learn web development from scratch', shortDescription: 'Learn to code', sku: 'COURSE-WEB', type: 'digital', status: 'active', price: 49.99, compareAtPrice: 99.99, quantity: 999, images: [], category: { id: '3', name: 'Digital Products', slug: 'digital-products', image: null }, variants: [], averageRating: 4.7, reviewCount: 312, createdAt: '', updatedAt: '' },
  { id: '5', name: 'JavaScript: The Good Parts', slug: 'javascript-good-parts', description: 'Classic JavaScript programming book', shortDescription: 'JavaScript guide', sku: 'BOOK-JS', type: 'physical', status: 'active', price: 24.99, quantity: 150, images: [], category: { id: '4', name: 'Books', slug: 'books', image: null }, variants: [], averageRating: 4.6, reviewCount: 178, createdAt: '', updatedAt: '' },
];

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('relevance');

  useEffect(() => {
    if (query) {
      searchProducts();
    }
  }, [query, sortBy]);

  const searchProducts = async () => {
    setLoading(true);
    
    // Try API first
    try {
      const response = await api.searchProducts(query);
      if (response.data && response.data.length > 0) {
        let results = response.data;
        if (sortBy === 'price-low') results.sort((a, b) => a.price - b.price);
        else if (sortBy === 'price-high') results.sort((b, a) => a.price - b.price);
        else if (sortBy === 'rating') results.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
        setProducts(results);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.log('API not available, using local search');
    }

    // Fallback to local search
    const queryLower = query.toLowerCase();
    const filtered = MOCK_PRODUCTS.filter(p =>
      p.name.toLowerCase().includes(queryLower) ||
      p.description.toLowerCase().includes(queryLower) ||
      p.category?.name.toLowerCase().includes(queryLower)
    );

    if (sortBy === 'price-low') filtered.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price-high') filtered.sort((b, a) => a.price - b.price);
    else if (sortBy === 'rating') filtered.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));

    setProducts(filtered);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Search</span>
      </nav>

      {/* Search Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
          Search Results
        </h1>
        <p style={{ color: '#666' }}>
          {loading ? 'Searching...' : `${products.length} results for "${query}"`}
        </p>
      </div>

      {/* Sort Options */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { value: 'relevance', label: 'Relevance' },
            { value: 'price-low', label: 'Price: Low to High' },
            { value: 'price-high', label: 'Price: High to Low' },
            { value: 'rating', label: 'Highest Rated' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setSortBy(option.value)}
              style={{
                padding: '8px 16px',
                backgroundColor: sortBy === option.value ? '#000' : 'white',
                color: sortBy === option.value ? '#fff' : '#000',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '64px' }}>
          <p style={{ color: '#666' }}>Searching products...</p>
        </div>
      )}

      {/* No Results */}
      {!loading && products.length === 0 && query && (
        <div style={{
          textAlign: 'center',
          padding: '64px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No results found</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            We couldn't find any products matching "{query}"
          </p>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            Try different keywords or browse our categories
          </p>
          <Link href="/products" style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#000',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
          }}>
            Browse All Products
          </Link>
        </div>
      )}

      {/* Results Grid */}
      {!loading && products.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
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
                transition: 'box-shadow 0.2s',
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
                <h3 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>
                  {product.name}
                </h3>

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

      {/* Search Suggestions */}
      {!loading && products.length > 0 && (
        <div style={{ marginTop: '48px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Search Tips</h3>
          <ul style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', listStyle: 'none', padding: 0 }}>
            <li style={{ fontSize: '14px', color: '#666' }}>✓ Try different keywords</li>
            <li style={{ fontSize: '14px', color: '#666' }}>✓ Check your spelling</li>
            <li style={{ fontSize: '14px', color: '#666' }}>✓ Use more general terms</li>
            <li style={{ fontSize: '14px', color: '#666' }}>✓ Browse categories instead</li>
          </ul>
        </div>
      )}
    </div>
  );
}