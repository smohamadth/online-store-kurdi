/**
 * The home page the store ships with.
 *
 * These rows are inserted the first time /api/home-sections is asked for, so a
 * fresh install has a complete, editable home page instead of an empty one.
 * Editing a row in the admin never re-seeds it - we only insert keys that are
 * missing, so an admin who deletes a block does not get it back on restart
 * (deleting is done by hiding, see isVisible).
 */

export interface HomeSectionSeed {
  key: string;
  type: string;
  title?: string | null;
  subtitle?: string | null;
  isVisible: boolean;
  sortOrder: number;
  config?: Record<string, unknown>;
}

export const HOME_SECTION_SEED: HomeSectionSeed[] = [
  {
    key: 'hero',
    type: 'hero',
    title: null,
    subtitle: null,
    isVisible: true,
    sortOrder: 10,
    config: { autoplay: true, intervalMs: 6000, height: 'medium' },
  },
  {
    key: 'promo',
    type: 'promo',
    title: null,
    subtitle: null,
    isVisible: true,
    sortOrder: 20,
    config: {},
  },
  {
    key: 'trustBar',
    type: 'trustBar',
    title: null,
    subtitle: null,
    isVisible: true,
    sortOrder: 30,
    config: {
      items: [
        { icon: '🚚', title: 'Free shipping', text: 'On orders over 50' },
        { icon: '↩️', title: '30-day returns', text: 'Hassle-free refunds' },
        { icon: '🔒', title: 'Secure checkout', text: 'Encrypted payments' },
        { icon: '💬', title: '24/7 support', text: 'We reply within hours' },
      ],
    },
  },
  {
    key: 'categories',
    type: 'categories',
    title: 'Shop by Category',
    subtitle: 'Browse our wide selection of products',
    isVisible: true,
    sortOrder: 40,
    config: { linkText: 'View All →', linkHref: '/products', limit: 8 },
  },
  {
    key: 'featured',
    type: 'featured',
    title: 'Featured Products',
    subtitle: 'Our most popular items',
    isVisible: true,
    sortOrder: 50,
    config: { linkText: 'View All Products →', linkHref: '/products', limit: 8 },
  },
  {
    key: 'newArrivals',
    type: 'carouselNew',
    title: 'New Arrivals',
    subtitle: 'Fresh picks added this week',
    isVisible: true,
    sortOrder: 60,
    config: { linkHref: '/products?sort=newest' },
  },
  {
    key: 'dealCountdown',
    type: 'dealCountdown',
    title: 'Save big before midnight',
    subtitle: 'Limited quantities on selected items. New deals drop every morning.',
    isVisible: true,
    sortOrder: 70,
    config: {
      badge: 'Deal of the day',
      buttonText: 'Shop deals',
      buttonHref: '/deals',
      gradientFrom: '#111827',
      gradientTo: '#374151',
    },
  },
  {
    key: 'bannerStrip',
    type: 'bannerStrip',
    title: null,
    subtitle: null,
    isVisible: true,
    sortOrder: 75,
    config: {},
  },
  {
    key: 'trending',
    type: 'carouselTrending',
    title: 'Trending Now',
    subtitle: 'What other shoppers are buying',
    isVisible: true,
    sortOrder: 80,
    config: { linkHref: '/products' },
  },
  {
    key: 'testimonials',
    type: 'testimonials',
    title: 'Loved by our customers',
    subtitle: 'Real feedback from people who shop with us.',
    isVisible: true,
    sortOrder: 90,
    config: {
      items: [
        {
          name: 'Sarah M.',
          role: 'Verified buyer',
          rating: 5,
          text: 'Ordered on a Monday and it arrived Wednesday. Packaging was spotless and the quality is better than I expected.',
        },
        {
          name: 'Daniel K.',
          role: 'Verified buyer',
          rating: 5,
          text: 'Had a sizing question and support answered within the hour. The return process was genuinely painless.',
        },
        {
          name: 'Ava R.',
          role: 'Verified buyer',
          rating: 4,
          text: 'Great prices without the sketchy feeling you get on marketplaces. This is my third order this year.',
        },
      ],
    },
  },
  {
    key: 'gallery',
    type: 'gallery',
    title: 'From our shop',
    subtitle: 'A look at what we stock and how we pack it.',
    isVisible: true,
    sortOrder: 95,
    config: {
      layout: 'masonry',      // masonry | grid
      columns: 4,
      // Each item: { image, caption, linkUrl }. `image` empty = a coloured
      // placeholder tile is drawn, so a fresh install has a complete-looking
      // gallery before the owner uploads anything.
      items: [
        { image: '', caption: 'New season arrivals', linkUrl: '/products?sort=newest', tone: '#2563eb' },
        { image: '', caption: 'Everyday electronics', linkUrl: '/category/electronics', tone: '#0ea5e9' },
        { image: '', caption: 'Wardrobe staples', linkUrl: '/category/clothing', tone: '#8b5cf6' },
        { image: '', caption: 'Books worth your time', linkUrl: '/category/books', tone: '#f97316' },
        { image: '', caption: 'Packed with care', linkUrl: '/products', tone: '#16a34a' },
        { image: '', caption: 'Fast local delivery', linkUrl: '/track-order', tone: '#dc2626' },
      ],
    },
  },
  {
    key: 'stats',
    type: 'stats',
    title: null,
    subtitle: null,
    isVisible: true,
    sortOrder: 100,
    config: {
      items: [
        { value: '12500', suffix: '+', label: 'Happy customers' },
        { value: '48000', suffix: '+', label: 'Orders delivered' },
        { value: '4.9', suffix: '/5', label: 'Average rating' },
        { value: '32', suffix: '', label: 'Countries served' },
      ],
    },
  },
  {
    key: 'features',
    type: 'features',
    title: null,
    subtitle: null,
    isVisible: true,
    sortOrder: 110,
    config: {
      items: [
        { icon: '🚚', title: 'Free Shipping', text: 'On orders over $100' },
        { icon: '🔒', title: 'Secure Payment', text: '100% secure checkout' },
        { icon: '🌍', title: 'Worldwide Shipping', text: 'Deliver to your door' },
        { icon: '🔄', title: 'Easy Returns', text: '30 day return policy' },
      ],
    },
  },
  {
    key: 'newsletter',
    type: 'newsletter',
    title: 'Subscribe to Our Newsletter',
    subtitle: 'Get the latest updates on new products, sales, and exclusive offers.',
    isVisible: true,
    sortOrder: 120,
    config: { buttonText: 'Subscribe', placeholder: 'Enter your email' },
  },
];

/** Block types an admin may create from scratch in the admin builder. */
export const CREATABLE_TYPES = ['richText', 'custom', 'gallery', 'features', 'trustBar', 'testimonials', 'stats'];

export const ALL_TYPES = Array.from(
  new Set([...HOME_SECTION_SEED.map((s) => s.type), ...CREATABLE_TYPES])
);
