'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, Product, getCategoryEmoji } from '@/lib/api';

export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load recent searches
    const stored = localStorage.getItem('recentSearches');
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch (e) {}
    }

    // Close dropdown on outside click
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Debounced search
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        searchProducts(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const searchProducts = async (searchQuery: string) => {
    setLoading(true);
    
    // Try search API first
    try {
      const response = await api.searchProducts(searchQuery);
      if (response.data && response.data.length > 0) {
        setResults(response.data);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.log('Search API not available');
    }

    // Fallback: Get all products and filter
    try {
      const allProducts = await api.getProducts({ limit: 100 });
      if (allProducts.data && allProducts.data.length > 0) {
        const queryLower = searchQuery.toLowerCase();
        const filtered = allProducts.data.filter(p =>
          p.name.toLowerCase().includes(queryLower) ||
          p.description?.toLowerCase().includes(queryLower) ||
          p.category?.name.toLowerCase().includes(queryLower)
        );
        setResults(filtered);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.log('Products API not available');
    }

    // No results
    setResults([]);
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      addToRecentSearches(query.trim());
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setShowDropdown(false);
      setQuery('');
    }
  };

  const addToRecentSearches = (search: string) => {
    const updated = [search, ...recentSearches.filter(s => s !== search)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  const handleProductClick = (slug: string) => {
    addToRecentSearches(query);
    setShowDropdown(false);
    setQuery('');
    router.push(`/products/${slug}`);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
      <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search products..."
          style={{
            width: '100%',
            padding: '10px 16px 10px 40px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            backgroundColor: '#f9f9f9',
          }}
        />
        <button
          type="submit"
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#666',
            padding: 0,
          }}
        >
          🔍
        </button>
      </form>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'var(--card-bg, white)',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          marginTop: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 1000,
          maxHeight: '400px',
          overflow: 'auto',
        }}>
          {/* Loading */}
          {loading && (
            <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
              Searching...
            </div>
          )}

          {/* Search Results */}
          {!loading && query.length >= 2 && results.length > 0 && (
            <div>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>
                  Products
                </span>
              </div>
              {results.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleProductClick(product.slug)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f5f5f5',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <div style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    flexShrink: 0,
                  }}>
                    {getCategoryEmoji(product.category?.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 500, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {product.name}
                    </p>
                    <p style={{ fontSize: '12px', color: '#666' }}>{product.category?.name}</p>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '14px', flexShrink: 0 }}>
                    ${product.price}
                  </span>
                </div>
              ))}
              {results.length > 5 && (
                <div
                  onClick={() => {
                    router.push(`/search?q=${encodeURIComponent(query)}`);
                    setShowDropdown(false);
                  }}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    color: '#000',
                    fontWeight: 500,
                    fontSize: '14px',
                    cursor: 'pointer',
                    borderTop: '1px solid #e5e5e5',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  View all {results.length} results →
                </div>
              )}
            </div>
          )}

          {/* No Results */}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#666' }}>
              <p style={{ marginBottom: '8px' }}>No products found for "{query}"</p>
              <p style={{ fontSize: '14px' }}>Try a different search term</p>
            </div>
          )}

          {/* Recent Searches */}
          {!loading && query.length < 2 && recentSearches.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e5e5e5' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>
                  Recent Searches
                </span>
                <button
                  onClick={clearRecentSearches}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((search, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setQuery(search);
                    router.push(`/search?q=${encodeURIComponent(search)}`);
                    setShowDropdown(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <span style={{ color: '#666' }}>🕐</span>
                  {search}
                </div>
              ))}
            </div>
          )}

          {/* Popular Searches (when no input) */}
          {!loading && query.length < 2 && recentSearches.length === 0 && (
            <div style={{ padding: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>
                Popular Searches
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['iPhone', 'MacBook', 'T-Shirt', 'JavaScript', 'Course'].map((term) => (
                  <button
                    key={term}
                    onClick={() => {
                      setQuery(term);
                      router.push(`/search?q=${encodeURIComponent(term)}`);
                      setShowDropdown(false);
                    }}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f5f5f5',
                      border: 'none',
                      borderRadius: '50px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}