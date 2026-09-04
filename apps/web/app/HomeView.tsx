'use client';

/**
 * The storefront home page.
 *
 * Rewritten so the page is *data-driven*: the order, visibility and copy of
 * every block come from the `HomeSection` rows in the database (admin →
 * Appearance → Home page). Previously the layout was a fixed sequence of JSX
 * and the only thing an admin could change was a handful of on/off toggles.
 *
 * Failure behaviour: if /api/home-sections cannot be reached we render the
 * shipped default layout rather than a blank page — but we never pretend a
 * save succeeded, and the admin builder surfaces real errors.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Product, getImageUrl } from '@/lib/api';
import { useStoreSettings } from '@/lib/settings';
import { useTheme } from '@/lib/theme';
import { useIsMobile } from '@/lib/hooks';
import { ProductGridSkeleton } from '@/components/SkeletonLoader';
import StoreImage from '@/components/StoreImage';
import HeroGallery, { Banner } from '@/components/HeroGallery';
import HeroSplit from '@/components/HeroSplit';
import PromoGrid from '@/components/PromoGrid';
import BannerStrip from '@/components/BannerStrip';
import HomeGallery from '@/components/HomeGallery';
import ProductCard, { PlaceholderTile } from '@/components/ProductCard';
import ProductCarousel from '@/components/ProductCarousel';
import {
  TrustBar,
  FeatureIcons,
  DealCountdown,
  Testimonials,
  StatsStrip,
  Newsletter,
  RichTextBlock,
  SectionHeading,
  CustomSection,
} from '@/components/HomeSections';
import FaqAccordion from '@/components/rich/FaqAccordion';
import LogoCloud from '@/components/rich/LogoCloud';
import VideoSection from '@/components/rich/VideoSection';
import ComparisonTable from '@/components/rich/ComparisonTable';
import PullQuote from '@/components/rich/PullQuote';
import LookbookSection from '@/components/rich/LookbookSection';
import ShowcaseRow from '@/components/rich/ShowcaseRow';
import { fetchHomeSections, HomeSection } from '@/lib/homeSections';
import { pickStorefrontHomeSections } from '@/lib/layouts/homeMapping';
import { heroOptionsFromSectionConfig } from '@/lib/heroOptions';
import { featuredProductsToShow } from '@/lib/featuredGrid';
import { isHomeSectionVisible } from '@/lib/homeVisibility';
import { API_BASE } from '@/lib/http';
import { ThemeSectionRenderer } from '@/lib/themeSectionRenderer';
import RecentlyViewed from '@/components/RecentlyViewed';

const CONTAINER = 'var(--container, 1200px)';

/** Fallback layout used only when the API is unreachable. */
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
  const [categories, setCategories] = useState<
    { name: string; slug: string; emoji: string; count: number; image?: string }[]
  >([]);
  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [promoBanners, setPromoBanners] = useState<Banner[]>([]);
  const [stripBanners, setStripBanners] = useState<Banner[]>([]);
  const [bannersLoaded, setBannersLoaded] = useState(false);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [trending, setTrending] = useState<Product[]>([]);

  const [newsletterStatus, setNewsletterStatus] =
    useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [newsletterMessage, setNewsletterMessage] = useState('');

  /* --------------------------------------------------------------- load */

  useEffect(() => {
    let alive = true;

    fetchHomeSections()
      .then((rows) => {
        if (!alive) return;
        setSections(rows);
      })
      .catch(() => {
        if (!alive) return;
        // The API is down. Show the shipped layout so the store is still
        // usable — this is a read-only fallback, nothing is written anywhere.
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

    // no-store: an admin banner edit must show on the next load, not from cache.
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

  /* --------------------------------------------------------- newsletter */

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

  /* ------------------------------------------------------------ render */

  const perRow = Math.max(2, Math.min(6, theme.productsPerRow || 4));

  const renderSection = (s: HomeSection) => {
    const cfg = s.config || {};

    switch (s.type) {
      case 'hero': {
        // Design options for this hero row (Appearance → Home → the hero
        // block): layout / height / autoplay / arrows / dots. Themes with
        // their own hero component receive the same `config` and decide
        // what they honour; the platform hero honours all of them.
        const heroOpts = heroOptionsFromSectionConfig(cfg);
        const heroSlides =
          heroOpts.layout === 'slideshow' ? heroBanners : heroBanners.slice(0, 1);
        return (
          <ThemeSectionRenderer
            key={s.id}
            section="hero"
            fallback={
              heroOpts.layout === 'split' ? (
                <HeroSplit
                  banner={heroBanners[0] ?? null}
                  height={heroOpts.height}
                />
              ) : (
                <HeroGallery
                  banners={heroSlides}
                  loaded={bannersLoaded}
                  autoPlay={heroOpts.autoPlay}
                  autoPlayMs={heroOpts.autoPlayMs}
                  showArrows={heroOpts.showArrows}
                  showDots={heroOpts.showDots}
                  height={heroOpts.height}
                />
              )
            }
            props={{ banners: heroSlides, config: cfg }}
          />
        );
      }

      case 'promo':
        return <PromoGrid key={s.id} banners={promoBanners} />;

      case 'bannerStrip':
        return <BannerStrip key={s.id} banners={stripBanners} />;

      case 'trustBar':
        return <TrustBar key={s.id} items={cfg.items} />;

      case 'features':
        return <FeatureIcons key={s.id} items={cfg.items} />;

      case 'categories':
        return (
          <ThemeSectionRenderer
            key={s.id}
            section="categories"
            fallback={
              <section style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '64px 20px' }}>
                <SectionHeading
                  title={s.title}
                  subtitle={s.subtitle}
                  linkText={cfg.linkText || 'View All →'}
                  linkHref={cfg.linkHref || '/products'}
                />
                {categories.length === 0 ? (
                  <p style={{ marginTop: '24px', color: 'var(--muted,#666)' }}>
                    No categories yet. Add some in Admin → Categories.
                  </p>
                ) : (
                  <div
                    style={{
                      marginTop: '32px',
                      display: 'grid',
                      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${perRow}, 1fr)`,
                      gap: '16px',
                    }}
                  >
                    {categories.slice(0, cfg.limit || 8).map((c) => (
                      <CategoryTile key={c.slug} category={c} />
                    ))}
                  </div>
                )}
              </section>
            }
            props={{ title: s.title ?? undefined, subtitle: s.subtitle ?? undefined, categories, config: cfg }}
          />
        );

      case 'featured': {
        // Only render full rows so the grid never ends with an orphan card.
        const cols = isMobile ? 2 : perRow;
        const shown = featuredProducts.slice(
          0,
          Math.max(cols, Math.floor(featuredProducts.length / cols) * cols)
        );
        return (
          <ThemeSectionRenderer
            key={s.id}
            section="featured"
            fallback={
              <section style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '64px 20px' }}>
                <SectionHeading
                  title={s.title}
                  subtitle={s.subtitle}
                  linkText={cfg.linkText || 'View All Products →'}
                  linkHref={cfg.linkHref || '/products'}
                />
                {loading && (
                  <div style={{ marginTop: '32px' }}>
                    <ProductGridSkeleton count={perRow * 2} />
                  </div>
                )}
                {!loading && shown.length > 0 && (
                  <div
                    style={{
                      marginTop: '32px',
                      display: 'grid',
                      gridTemplateColumns: `repeat(${cols}, 1fr)`,
                      gap: '24px',
                    }}
                  >
                    {shown.map((p) => (
                      <ProductCard key={p.id} product={p} currencySymbol={settings.currencySymbol} />
                    ))}
                  </div>
                )}
                {!loading && featuredProducts.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted,#666)' }}>
                    <p>No featured products yet.</p>
                    <p style={{ fontSize: '14px', marginTop: '8px' }}>
                      Mark products as “featured” in Admin → Products.
                    </p>
                  </div>
                )}
              </section>
            }
            props={{ title: s.title ?? undefined, subtitle: s.subtitle ?? undefined, products: shown, config: cfg }}
          />
        );
      }

      case 'carouselNew':
        return (
          <ProductCarousel
            key={s.id}
            title={s.title || 'New Arrivals'}
            subtitle={s.subtitle || undefined}
            products={newArrivals}
            viewAllHref={cfg.linkHref || '/products?sort=newest'}
            currencySymbol={settings.currencySymbol}
          />
        );

      case 'carouselTrending':
        return (
          <ProductCarousel
            key={s.id}
            title={s.title || 'Trending Now'}
            subtitle={s.subtitle || undefined}
            products={trending}
            viewAllHref={cfg.linkHref || '/products'}
            currencySymbol={settings.currencySymbol}
          />
        );

      case 'dealCountdown':
        return (
          <DealCountdown
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            badge={cfg.badge}
            buttonText={cfg.buttonText}
            buttonHref={cfg.buttonHref}
            gradientFrom={cfg.gradientFrom}
            gradientTo={cfg.gradientTo}
          />
        );

      case 'testimonials':
        return (
          <Testimonials key={s.id} title={s.title} subtitle={s.subtitle} items={cfg.items} />
        );

      case 'stats':
        return <StatsStrip key={s.id} items={cfg.items} />;

      case 'gallery':
        return (
          <HomeGallery
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            items={cfg.items}
            layout={cfg.layout === 'grid' ? 'grid' : 'masonry'}
            columns={cfg.columns}
          />
        );

      case 'faq':
        return (
          <FaqAccordion
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            items={cfg.items}
            columns={cfg.columns === 'one' ? 'one' : 'two'}
            openFirst={cfg.openFirst !== false}
          />
        );

      case 'logos':
        return (
          <LogoCloud
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            items={cfg.items}
            grayscale={cfg.grayscale !== false}
          />
        );

      case 'video':
        return (
          <VideoSection
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            url={cfg.url}
            autoplay={Boolean(cfg.autoplay)}
            muted={Boolean(cfg.muted)}
            loop={Boolean(cfg.loop)}
            aspect={cfg.aspect}
            poster={cfg.poster}
          />
        );

      case 'comparison':
        return (
          <ComparisonTable
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            columns={cfg.columns}
            rows={cfg.rows}
            highlight={typeof cfg.highlight === 'number' ? cfg.highlight : null}
          />
        );

      case 'quote':
        return (
          <PullQuote
            key={s.id}
            quote={cfg.quote}
            author={cfg.author}
            role={cfg.role}
            avatar={cfg.avatar}
            background={cfg.background}
          />
        );

      case 'lookbook':
        return (
          <LookbookSection
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            description={cfg.description}
            image={cfg.image}
            imagePosition={cfg.imagePosition === 'end' ? 'end' : 'start'}
            buttonText={cfg.buttonText}
            linkUrl={cfg.linkUrl}
            overlayColor={cfg.overlayColor}
          />
        );

      case 'showcaseRow':
        return (
          <ShowcaseRow
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            category={cfg.category}
            limit={cfg.limit}
            viewAllText={cfg.viewAllText}
            currencySymbol={settings.currencySymbol}
          />
        );

      case 'richText':
        return (
          <RichTextBlock
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            html={cfg.html}
            align={cfg.align === 'center' ? 'center' : 'left'}
          />
        );

      // Admin-designed section: rich content in a chosen background /
      // width / padding (Appearance → Home → "Custom section").
      case 'custom':
        return (
          <CustomSection
            key={s.id}
            title={s.title}
            html={cfg.html}
            background={cfg.background}
            align={cfg.align === 'center' ? 'center' : cfg.align === 'right' ? 'right' : 'left'}
            padding={cfg.padding}
            width={cfg.width}
          />
        );

      case 'newsletter':
        return (
          <Newsletter
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            buttonText={cfg.buttonText}
            placeholder={cfg.placeholder}
            onSubmit={subscribe}
            status={newsletterStatus}
            message={newsletterMessage}
          />
        );

      default:
        // Unknown type (e.g. a newer version wrote a block this build doesn't
        // know). Render nothing rather than crashing the whole page.
        return null;
    }
  };

  const visible = pickStorefrontHomeSections(sections)
    .filter(isHomeSectionVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ backgroundColor: 'var(--body-bg, #fff)', color: 'var(--body-text, #111)' }}>
      {/* SEO metadata is exported from page.tsx (server component).
          next/head is a no-op in App Router client components. */}
      {!sectionsLoaded ? (
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '40px 20px' }}>
          <ProductGridSkeleton count={perRow * 2} />
        </div>
      ) : (
        visible.map(renderSection)
      )}

      {/* "Recently viewed" - client-side, per-browser. Renders nothing
          for a fresh visitor (empty list), so it never shows as an
          empty section. Kept below the curated sections on purpose:
          it's a recall aid, not merchandising. */}
      <RecentlyViewed />
    </div>
  );
}

/** Category tile: uses the real category image when present, emoji otherwise. */
function CategoryTile({
  category,
}: {
  category: { name: string; slug: string; emoji: string; count: number; image?: string };
}) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = category.image && !imgFailed;

  return (
    <Link
      href={`/category/${category.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Keyboard users get the same lift/zoom on focus.
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        display: 'block',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius, 12px)',
        border: '1px solid var(--border, #e8e8e8)',
        backgroundColor: 'var(--card-bg, white)',
        textDecoration: 'none',
        color: 'var(--body-text, #111)',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? 'var(--shadow-hover, 0 12px 28px rgba(0,0,0,0.10))' : 'var(--shadow, none)',
      }}
    >
      <div
        style={{
          aspectRatio: '1',
          backgroundColor: 'var(--body-bg, #f5f5f5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {showImage ? (
          <StoreImage
            src={getImageUrl(category.image!)}
            alt={category.name}
            onError={() => setImgFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 500ms ease',
              transform: hovered ? 'scale(1.07)' : 'scale(1)',
            }}
          />
        ) : (
          <PlaceholderTile label="Category" emoji={category.emoji} seed={category.name} />
        )}
      </div>
      <div style={{ padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: '15px' }}>{category.name}</h3>
        <p style={{ fontSize: '13px', color: 'var(--muted, #777)', marginTop: '3px' }}>
          {category.count} {category.count === 1 ? 'product' : 'products'}
        </p>
      </div>
    </Link>
  );
}
