'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface SearchResult {
  id: string;
  name: string;
  slug: string;
  price: number;
  image?: string;
  category?: string;
}

export default function SearchAutocomplete() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    // Load recent searches
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {}
    }

    // Close dropdown when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true);
        try {
          const response = await fetch(`${API_URL}/products/search?q=${encodeURIComponent(query)}&limit=5`);
          if (response.ok) {
            const data = await response.json();
            setResults(data.data || []);
          }
        } catch (err) {
          console.log('Search failed');
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    // Save to recent searches
    const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));

    setIsOpen(false);
    window.location.href = `/products?q=${encodeURIComponent(searchQuery)}`;
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'white',
      }}>
        <span style={{ padding: '0 12px', color: '#999' }}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch(query);
            }
          }}
          placeholder="Search products..."
          style={{
            flex: 1,
            padding: '10px 0',
            border: 'none',
            outline: 'none',
            fontSize: '14px',
          }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              inputRef.current?.focus();
            }}
            style={{
              padding: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#999',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (query.length >= 2 || recentSearches.length > 0) && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          marginTop: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 100,
          maxHeight: '400px',
          overflow: 'auto',
        }}>
          {/* Loading */}
          {loading && (
            <div style={{ padding: '16px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
              Searching...
            </div>
          )}

          {/* Search Results */}
          {!loading && results.length > 0 && (
            <div>
              <p style={{ padding: '8px 16px', fontSize: '12px', color: '#999', borderBottom: '1px solid #f0f0f0' }}>
                Products
              </p>
              {results.map((result) => (
                <Link
                  key={result.id}
                  href={`/products/${result.slug}`}
                  onClick={() => setIsOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 16px',
                    textDecoration: 'none',
                    color: '#000',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    flexShrink: 0,
                  }}>
                    📦
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 500, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.name}
                    </p>
                    {result.category && (
                      <p style={{ fontSize: '12px', color: '#666' }}>{result.category}</p>
                    )}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>${result.price}</span>
                </Link>
              ))}
              <Link
                href={`/products?q=${encodeURIComponent(query)}`}
                onClick={() => setIsOpen(false)}
                style={{
                  display: 'block',
                  padding: '12px 16px',
                  textAlign: 'center',
                  color: '#000',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                View all results for "{query}" →
              </Link>
            </div>
          )}

          {/* No results */}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#666' }}>
              <p style={{ fontSize: '14px' }}>No products found for "{query}"</p>
            </div>
          )}

          {/* Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <p style={{ fontSize: '12px', color: '#999' }}>Recent Searches</p>
                <button
                  onClick={clearRecentSearches}
                  style={{ background: 'none', border: 'none', fontSize: '12px', color: '#666', cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((search, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(search);
                    handleSearch(search);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 16px',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#333',
                  }}
                >
                  <span style={{ color: '#999' }}>🕐</span>
                  {search}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
