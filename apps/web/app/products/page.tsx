'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Product, Category, getCategoryEmoji, getImageUrl, getProductImage } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { useIsMobile } from '@/lib/hooks';
import ProductCard from '@/components/ProductCard';

function ProductsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const { settings } = useStoreSettings();

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);
  
  // Legacy support: /category/clothing is no longer the canonical
  // category URL. Redirect to /category/clothing so old links, bookmarks and
  // anything already indexed keep working and consolidate on one URL.
  useEffect(() => {
    const category = searchParams.get('category');
    if (category && category !== 'all') {
      router.replace(`/category/${category}`);
      return;
    }
    const query = searchParams.get('q');
    if (query) setSearchQuery(query);
  }, [searchParams, router]);

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
  
  const fetchCategories = async () => {
    try {
      const response = await api.getCategories();
      if (response.data && Array.isArray(response.data)) {
        setCategories(response.data);
      }
    } catch (err) {
      console.log('Categories API not available');
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
    <>
      {/* SEO metadata comes from products/layout.tsx (server).
          next/head does nothing in App Router client components. */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ 
        marginBottom: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        fontSize: '14px', 
        color: 'var(--muted, #666)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Products</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>Products</h1>
        <p style={{ marginTop: '8px', color: 'var(--muted, #666)' }}>
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
            border: '1px solid var(--border, #e5e5e5)',
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
          <button
            onClick={() => setSelectedCategory('all')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              border: selectedCategory === 'all' ? '2px solid #000' : '1px solid #e5e5e5',
              backgroundColor: selectedCategory === 'all' ? '#000' : 'white',
              color: selectedCategory === 'all' ? '#fff' : '#000',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            All
          </button>
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              style={{
                display: 'inline-block',
                textDecoration: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                border: selectedCategory === cat.slug ? '2px solid #000' : '1px solid #e5e5e5',
                backgroundColor: selectedCategory === cat.slug ? '#000' : 'white',
                color: selectedCategory === cat.slug ? '#fff' : '#000',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {cat.name}
            </Link>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: 'var(--muted, #666)', whiteSpace: 'nowrap' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #e5e5e5)',
              backgroundColor: 'var(--card-bg, white)',
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
          <p style={{ fontSize: '18px', color: 'var(--muted, #666)' }}>Loading products...</p>
        </div>
      )}

      {/* No Results */}
      {!loading && filteredProducts.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '48px 20px',
          color: 'var(--muted, #666)'
        }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>😕</p>
          <p style={{ fontSize: '18px' }}>No products found</p>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              style={{
                marginTop: '16px',
                padding: '10px 20px',
                backgroundColor: 'var(--brand, #000)',
                color: 'var(--brand-text, #fff)',
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
          {/* Uses the shared ProductCard so the listing behaves like the
              home page and category pages: hover preview, discount and stock
              badges, correct currency, and quick add-to-cart. This page
              previously duplicated the card markup and had NO way to add a
              product to the cart without opening the detail page. */}
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              currencySymbol={settings.currencySymbol}
            />
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
          <p style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>
            Make sure the API server is running: <code>npm run dev:api</code>
          </p>
        </div>
      )}
    </div>
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '64px' }}><p style={{ color: 'var(--muted, #666)' }}>Loading products...</p></div>}>
      <ProductsContent />
    </Suspense>
  );
}
