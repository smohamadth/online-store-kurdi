'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { api, Product, getCategoryEmoji, getImageUrl } from '@/lib/api';
import { useStoreSettings } from '@/lib/settings';
import { ProductGridSkeleton } from '@/components/SkeletonLoader';
import HeroGallery, { Banner } from '@/components/HeroGallery';
import PromoGrid from '@/components/PromoGrid';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export default function HomePage() {
  const isMobile = useIsMobile();
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState([
    { name: 'Electronics', slug: 'electronics', emoji: '💻', count: 0 },
    { name: 'Clothing', slug: 'clothing', emoji: '👕', count: 0 },
    { name: 'Books', slug: 'books', emoji: '📚', count: 0 },
    { name: 'Digital Products', slug: 'digital-products', emoji: '📱', count: 0 },
  ]);
  const [loading, setLoading] = useState(true);
  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [promoBanners, setPromoBanners] = useState<Banner[]>([]);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [newsletterMessage, setNewsletterMessage] = useState('');
  const { settings } = useStoreSettings();

  useEffect(() => {
    fetchFeaturedProducts();
    fetchCategories();
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${API_URL}/banners`);
      if (res.ok) {
        const data = await res.json();
        const all: Banner[] = data.data || [];
        setHeroBanners(all.filter((b) => (b.position || 'hero') === 'hero'));
        setPromoBanners(all.filter((b) => b.position === 'promo'));
      }
    } catch (err) {
      console.log('Banners API not available, using defaults');
    }
  };

  const fetchFeaturedProducts = async () => {
    try {
      const response = await api.getFeaturedProducts(4);
      setFeaturedProducts(response.data || []);
    } catch (err) {
      console.error('Failed to fetch featured products:', err);
      // Use empty array if API fails
      setFeaturedProducts([]);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchCategories = async () => {
    try {
      const response = await api.getCategories();
      if (response.data && Array.isArray(response.data)) {
        // Map API categories to our display format
        const categoryEmojis: Record<string, string> = {
          'electronics': '💻',
          'clothing': '👕',
          'books': '📚',
          'digital': '📱',
          'digital products': '📱',
        };
        
        const fetchedCategories = response.data.map((cat: any) => ({
          name: cat.name,
          slug: cat.slug,
          emoji: categoryEmojis[cat.slug] || categoryEmojis[cat.name?.toLowerCase()] || '📦',
          count: cat._count?.products || 0,
        }));
        
        if (fetchedCategories.length > 0) {
          setCategories(fetchedCategories);
        }
      }
    } catch (err) {
      console.log('Categories API not available, using defaults');
    }
  };
  
  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    
    setNewsletterStatus('loading');
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setNewsletterStatus('success');
        setNewsletterMessage(data.message || 'Successfully subscribed!');
        setNewsletterEmail('');
      } else {
        setNewsletterStatus('error');
        setNewsletterMessage(data.message || 'Failed to subscribe');
      }
    } catch (err) {
      setNewsletterStatus('error');
      setNewsletterMessage('Network error. Please try again.');
    }
    
    setTimeout(() => {
      setNewsletterStatus('idle');
      setNewsletterMessage('');
    }, 5000);
  };

  return (
    <>
      <Head>
        <title>{settings.storeName} - Shop the Best Products</title>
        <meta name="description" content={settings.storeDescription} />
        <meta property="og:title" content={`${settings.storeName} - Shop the Best Products`} />
        <meta property="og:description" content={settings.storeDescription} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={process.env.NEXT_PUBLIC_SITE_URL || 'https://yourstore.com'} />
      </Head>
      <div>
      {/* Hero Gallery / Slider */}
      <HeroGallery banners={heroBanners} />

      {/* Promo Banners */}
      <PromoGrid banners={promoBanners} />


      {/* Categories Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 20px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: isMobile ? '22px' : '30px', fontWeight: 'bold' }}>Shop by Category</h2>
            <p style={{ marginTop: '8px', color: '#666' }}>
              Browse our wide selection of products
            </p>
          </div>
          <Link href="/products" style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#000',
            textDecoration: 'none',
          }}>
            View All →
          </Link>
        </div>
        <div style={{
          marginTop: '32px',
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: '16px',
        }}>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/products?category=${category.slug}`}
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
              <div style={{
                aspectRatio: '1',
                backgroundColor: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
              }}>
                {category.emoji}
              </div>
              <div style={{ padding: '16px' }}>
                <h3 style={{ fontWeight: 600 }}>{category.name}</h3>
                <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                  {category.count} products
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 20px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: isMobile ? '22px' : '30px', fontWeight: 'bold' }}>Featured Products</h2>
            <p style={{ marginTop: '8px', color: '#666' }}>
              Our most popular items
            </p>
          </div>
          <Link href="/products" style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#000',
            textDecoration: 'none',
          }}>
            View All Products →
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ marginTop: '32px' }}>
            <ProductGridSkeleton count={4} />
          </div>
        )}

        {/* Products Grid */}
        {!loading && featuredProducts.length > 0 && (
          <div style={{
            marginTop: '32px',
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: '24px',
          }}>
            {featuredProducts.map((product) => (
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
                }}
              >
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
                      src={getImageUrl(product.images[0].url)} 
                      alt={product.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '64px' }}>{getCategoryEmoji(product.category?.name)}</span>
                  )}
                </div>
                <div style={{ padding: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#666' }}>{product.category?.name}</p>
                  <h3 style={{ marginTop: '4px', fontWeight: 600 }}>{product.name}</h3>
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>${product.price}</span>
                    {product.compareAtPrice && (
                      <span style={{ fontSize: '14px', color: '#666', textDecoration: 'line-through' }}>
                        ${product.compareAtPrice}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#f59e0b' }}>★</span>
                    <span style={{ fontSize: '14px' }}>{product.averageRating || 0}</span>
                    <span style={{ fontSize: '14px', color: '#666' }}>
                      ({product.reviewCount || 0})
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* No Products */}
        {!loading && featuredProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px', color: '#666' }}>
            <p>No featured products available</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>
              Make sure the API server is running
            </p>
          </div>
        )}
      </section>

      {/* Features Section */}
      <section style={{ backgroundColor: '#f9f9f9' }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '64px 20px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: '32px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🚚
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Free Shipping</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>On orders over $100</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🔒
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Secure Payment</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>100% secure checkout</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🌍
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Worldwide Shipping</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>Deliver to your door</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🔄
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Easy Returns</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>30 day return policy</p>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 20px',
      }}>
        <div style={{
          borderRadius: '16px',
          backgroundColor: '#000',
          color: 'white',
          padding: '48px',
        }}>
          <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: isMobile ? '22px' : '30px', fontWeight: 'bold' }}>Subscribe to Our Newsletter</h2>
            <p style={{ marginTop: '16px', fontSize: '18px', opacity: 0.9 }}>
              Get the latest updates on new products, sales, and exclusive offers.
            </p>
            <form onSubmit={handleNewsletterSubmit} style={{
              marginTop: '32px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: '16px',
            }}>
              <input
                type="email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="Enter your email"
                required
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'transparent',
                  color: 'white',
                  fontSize: '16px',
                }}
              />
              <button 
                type="submit"
                disabled={newsletterStatus === 'loading'}
                style={{
                  padding: '12px 24px',
                  backgroundColor: newsletterStatus === 'loading' ? '#ccc' : 'white',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: newsletterStatus === 'loading' ? 'not-allowed' : 'pointer',
                }}
              >
                {newsletterStatus === 'loading' ? 'Subscribing...' : 'Subscribe'}
              </button>
            </form>
            {newsletterMessage && (
              <p style={{
                marginTop: '16px',
                fontSize: '14px',
                color: newsletterStatus === 'success' ? '#22c55e' : '#ef4444',
              }}>
                {newsletterStatus === 'success' ? '✓ ' : '✕ '}{newsletterMessage}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
    </>
  );
}