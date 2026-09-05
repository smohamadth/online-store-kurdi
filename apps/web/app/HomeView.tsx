'use client';

/**
 * The storefront home page — data loading only.
 * Painting lives in HomeSectionStack (also used by Theme Studio).
 */

import { useState, useEffect } from 'react';
import { api, Product } from '@/lib/api';
import { useStoreSettings } from '@/lib/settings';
import { useTheme } from '@/lib/theme';
import { useIsMobile } from '@/lib/hooks';
import { ProductGridSkeleton } from '@/components/SkeletonLoader';
import { Banner } from '@/components/HeroGallery';
import { fetchHomeSections, HomeSection } from '@/lib/homeSections';
import { readHomePreviewDraft } from '@/lib/homePreviewDraft';
import { API_BASE } from '@/lib/http';
import RecentlyViewed from '@/components/RecentlyViewed';
import { HomeSectionStack, HomeCategoryTile } from '@/components/HomeSectionStack';

const CONTAINER = 'var(--container, 1200px)';

const FALLBACK_SECTIONS: HomeSection[] = [
  { id: 'f-hero', key: 'hero', type: 'hero', title: null, subtitle: null, isVisible: true, sortOrder: 10, config: {} },
  { id: 'f-promo', key: 'promo', type: 'promo', title: null, subtitle: null, isVisible: true, sortOrder: 20, config: {} },
  { id: 'f-cat', key: 'categories', type: 'categories', title: 'Shop by Category', subtitle: 'Browse our wide selection of products', isVisible: true, sortOrder: 30, config: { linkText: 'View All →', linkHref: '/products' } },
  { id: 'f-feat', key: 'featured', type: 'featured', title: 'Featured Products', subtitle: 'Our most popular items', isVisible: true, sortOrder: 40, config: { linkText: 'View All Products →', linkHref: '/products' } },
];

export default function HomeView() {
  const isMobile = useIsMobile();
  const { settings } = useStoreSettings();
  const { theme } = useTheme();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<HomeCategoryTile[]>([]);
  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [promoBanners, setPromoBanners] = useState<Banner[]>([]);
  const [stripBanners, setStripBanners] = useState<Banner[]>([]);
  const [bannersLoaded, setBannersLoaded] = useState(false);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [trending, setTrending] = useState<Product[]>([]);
  const [homePreview, setHomePreview] = useState(false);
  const [newsletterStatus, setNewsletterStatus] =
    useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [newsletterMessage, setNewsletterMessage] = useState('');

  useEffect(() => {
    setHomePreview(new URLSearchParams(window.location.search).has('homePreview'));
  }, []);

  useEffect(() => {
    let alive = true;
    fetchHomeSections()
      .then((rows) => {
        if (!alive) return;
        const draft =
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).has('homePreview')
            ? readHomePreviewDraft()
            : null;
        setSections(draft ?? rows);
      })
      .catch(() => {
        if (!alive) return;
        console.warn('Home sections unavailable; rendering the default layout.');
        setSections(FALLBACK_SECTIONS);
      })
      .finally(() => alive && setSectionsLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    api
      .getFeaturedProducts(12)
      .then((r) => setFeaturedProducts(r.data || []))
      .catch(() => setFeaturedProducts([]))
      .finally(() => setLoading(false));

    api
      .getCategories()
      .then((r) => {
        const emojis: Record<string, string> = {
          electronics: '💻',
          clothing: '👕',
          books: '📚',
          digital: '📱',
          'digital-products': '📱',
        };
        const list = (r.data || []).map((c: any) => ({
          name: c.name,
          slug: c.slug,
          emoji: emojis[c.slug] || emojis[c.name?.toLowerCase()] || '📦',
          count: c._count?.products || 0,
          image: c.image || '',
        }));
        setCategories(list);
      })
      .catch(() => setCategories([]));

    api.getNewArrivals().then((r) => setNewArrivals(r.data || [])).catch(() => setNewArrivals([]));
    api.getTrendingProducts().then((r) => setTrending(r.data || [])).catch(() => setTrending([]));

    fetch(`${API_BASE}/banners`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((d) => {
        const all: Banner[] = d.data || [];
        setHeroBanners(all.filter((b) => (b.position || 'hero') === 'hero'));
        setPromoBanners(all.filter((b) => b.position === 'promo'));
        setStripBanners(all.filter((b) => b.position === 'strip'));
      })
      .catch(() => {})
      .finally(() => setBannersLoaded(true));
  }, []);

  const subscribe = async (email: string) => {
    setNewsletterStatus('loading');
    try {
      const res = await fetch(`${API_BASE}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewsletterStatus('success');
        setNewsletterMessage(data.message || 'Successfully subscribed!');
      } else {
        setNewsletterStatus('error');
        setNewsletterMessage(data.message || `Could not subscribe (${res.status}).`);
      }
    } catch {
      setNewsletterStatus('error');
      setNewsletterMessage('Network error. Please try again.');
    }
    setTimeout(() => {
      setNewsletterStatus('idle');
      setNewsletterMessage('');
    }, 6000);
  };

  const perRow = Math.max(2, Math.min(6, theme.productsPerRow || 4));

  return (
    <div style={{ backgroundColor: 'var(--body-bg, #fff)', color: 'var(--body-text, #111)' }}>
      {!sectionsLoaded ? (
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '40px 20px' }}>
          <ProductGridSkeleton count={perRow * 2} />
        </div>
      ) : (
        <HomeSectionStack
          sections={sections}
          isMobile={isMobile}
          perRow={perRow}
          currencySymbol={settings.currencySymbol}
          featuredProducts={featuredProducts}
          loading={loading}
          categories={categories}
          heroBanners={heroBanners}
          promoBanners={promoBanners}
          stripBanners={stripBanners}
          bannersLoaded={bannersLoaded}
          newArrivals={newArrivals}
          trending={trending}
          newsletterStatus={newsletterStatus}
          newsletterMessage={newsletterMessage}
          onSubscribe={subscribe}
        />
      )}
      {homePreview ? null : <RecentlyViewed />}
    </div>
  );
}
