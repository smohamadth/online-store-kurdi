'use client';

import { useState } from 'react';
import Link from 'next/link';

const allProducts = [
  { id: '1', name: 'iPhone 15 Pro', slug: 'iphone-15-pro', price: 999.99, compareAtPrice: 1099.99, category: 'Electronics', rating: 4.8, reviewCount: 124, inStock: true },
  { id: '2', name: 'MacBook Pro 14"', slug: 'macbook-pro-14', price: 1599.99, category: 'Electronics', rating: 4.9, reviewCount: 89, inStock: true },
  { id: '3', name: 'Classic T-Shirt', slug: 'classic-t-shirt', price: 29.99, category: 'Clothing', rating: 4.5, reviewCount: 256, inStock: true },
  { id: '4', name: 'Web Development Course', slug: 'web-development-course', price: 49.99, compareAtPrice: 99.99, category: 'Digital Products', rating: 4.7, reviewCount: 312, inStock: true },
  { id: '5', name: 'JavaScript: The Good Parts', slug: 'javascript-good-parts', price: 24.99, category: 'Books', rating: 4.6, reviewCount: 178, inStock: true },
];

const categories = [
  { name: 'All', slug: 'all' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Clothing', slug: 'clothing' },
  { name: 'Books', slug: 'books' },
  { name: 'Digital Products', slug: 'digital-products' },
];

function getCategoryEmoji(category: string): string {
  switch (category) {
    case 'Electronics': return '📱';
    case 'Clothing': return '👕';
    case 'Books': return '📚';
    case 'Digital Products': return '💻';
    default: return '📦';
  }
}

export default function ProductsPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // Filter products by category
  const filteredProducts = selectedCategory === 'all'
    ? allProducts
    : allProducts.filter(p => p.category.toLowerCase().replace(' ', '-') === selectedCategory);

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'price-low': return a.price - b.price;
      case 'price-high': return b.price - a.price;
      case 'rating': return b.rating - a.rating;
      case 'name': return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

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
          Showing {sortedProducts.length} of {allProducts.length} products
        </p>
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
          {categories.map((category) => (
            <button
              key={category.slug}
              onClick={() => setSelectedCategory(category.slug)}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                border: selectedCategory === category.slug ? '2px solid #000' : '1px solid #e5e5e5',
                backgroundColor: selectedCategory === category.slug ? '#000' : 'white',
                color: selectedCategory === category.slug ? '#fff' : '#000',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {category.name}
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

      {/* Product Grid */}
      {sortedProducts.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '64px 20px',
          color: '#666'
        }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>😕</p>
          <p style={{ fontSize: '18px' }}>No products found in this category</p>
          <button 
            onClick={() => setSelectedCategory('all')}
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
            View All Products
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
          {sortedProducts.map((product) => (
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
                transition: 'box-shadow 0.2s, transform 0.2s',
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
                {getCategoryEmoji(product.category)}
              </div>

              {/* Product Info */}
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{product.category}</p>
                <h3 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>{product.name}</h3>
                
                {/* Rating */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ color: '#f59e0b' }}>★</span>
                  <span style={{ fontSize: '14px' }}>{product.rating}</span>
                  <span style={{ fontSize: '14px', color: '#666' }}>({product.reviewCount})</span>
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
                <p style={{ marginTop: '8px', fontSize: '12px', color: product.inStock ? '#22c55e' : '#ef4444' }}>
                  {product.inStock ? '✓ In Stock' : '✗ Out of Stock'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Active Filter Display */}
      {selectedCategory !== 'all' && (
        <div style={{ 
          marginTop: '32px', 
          padding: '16px', 
          backgroundColor: '#f5f5f5', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '14px' }}>
            Filtering by: <strong>{categories.find(c => c.slug === selectedCategory)?.name}</strong>
          </span>
          <button 
            onClick={() => setSelectedCategory('all')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: 'white',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Clear Filter
          </button>
        </div>
      )}
    </div>
  );
}