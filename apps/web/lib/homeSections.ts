/**
 * Shared types + client for the admin-editable home page.
 *
 * The storefront and the admin builder both read from here so there is exactly
 * one definition of what a block is.
 */

import { http, authHttp } from './http';

export interface HomeSection {
  id: string;
  key: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  isVisible: boolean;
  sortOrder: number;
  config: Record<string, any>;
}

export interface TrustItem {
  icon: string;
  title: string;
  text: string;
}
export interface TestimonialItem {
  name: string;
  role: string;
  rating: number;
  text: string;
}
export interface StatItem {
  value: string;
  suffix: string;
  label: string;
}
export interface FaqItem {
  q: string;
  a: string;
}
export interface LogoItem {
  name: string;
  image: string;
}
export interface ComparisonColumn {
  name: string;
  sub?: string;
}
export interface ComparisonRow {
  label: string;
  values: string[];
}

/** Human labels for the admin builder. */
export const TYPE_LABELS: Record<string, string> = {
  hero: 'Hero slider',
  promo: 'Promo banners',
  trustBar: 'Trust bar',
  categories: 'Category grid',
  featured: 'Featured products',
  carouselNew: 'New arrivals carousel',
  carouselTrending: 'Trending carousel',
  dealCountdown: 'Deal countdown',
  bannerStrip: 'Call-to-action banner',
  gallery: 'Image gallery',
  testimonials: 'Testimonials',
  stats: 'Stats strip',
  features: 'Feature icons',
  newsletter: 'Newsletter signup',
  richText: 'Rich text block',
  custom: 'Custom section (design it)',
  faq: 'FAQ accordion',
  logos: 'Brand logos',
  video: 'Video embed',
  comparison: 'Comparison table',
  quote: 'Pull quote',
  lookbook: 'Lookbook (image + copy)',
  showcaseRow: 'Category showcase',
};

export const TYPE_ICONS: Record<string, string> = {
  hero: '🖼️',
  promo: '🏷️',
  trustBar: '🛡️',
  categories: '🗂️',
  featured: '⭐',
  carouselNew: '🆕',
  carouselTrending: '🔥',
  dealCountdown: '⏰',
  bannerStrip: '📢',
  gallery: '🖼️',
  testimonials: '💬',
  stats: '📊',
  features: '✨',
  newsletter: '✉️',
  richText: '📝',
  custom: '🎨',
  faq: '❔',
  logos: '🤝',
  video: '🎬',
  comparison: '⚖️',
  quote: '💭',
  lookbook: '📖',
  showcaseRow: '🛍️',
};

/** Types an admin can add from scratch (the rest are singletons already seeded). */
export const CREATABLE_TYPES = [
  'richText',
  'custom',
  'gallery',
  'features',
  'trustBar',
  'testimonials',
  'stats',
  'faq',
  'logos',
  'video',
  'comparison',
  'quote',
  'lookbook',
  'showcaseRow',
];

/**
 * Pure drag-and-drop reorder: given the list, the index of the dragged
 * item, the index of the row being dropped ONTO, and whether the cursor
 * was in that row's top half (before) or bottom half (after), return the
 * new order.
 *
 * The drop index refers to the PRE-removal list, so when the drag comes
 * from above, the target row shifts down by one once the dragged item is
 * removed. Extracted from the HomeBuilder so the index math is unit
 * tested instead of learned from a mis-ordered home page.
 */
export function reorderSectionsByDrop<T extends { id: string }>(
  items: T[],
  dragIndex: number,
  dropIndex: number,
  after: boolean,
): T[] {
  if (dragIndex === dropIndex) return items;
  const t = dragIndex < dropIndex ? dropIndex - 1 : dropIndex;
  const insertAt = after ? t + 1 : t;
  const next = [...items];
  const [moved] = next.splice(dragIndex, 1);
  next.splice(insertAt, 0, moved);
  return next;
}

export async function fetchHomeSections(): Promise<HomeSection[]> {
  const res = await http.get<HomeSection[]>('/home-sections');
  return res.data || [];
}

export async function updateHomeSection(
  id: string,
  patch: Partial<Pick<HomeSection, 'title' | 'subtitle' | 'isVisible' | 'sortOrder' | 'config'>>
): Promise<HomeSection> {
  const res = await authHttp.put<HomeSection>(`/home-sections/${id}`, patch);
  return res.data;
}

export async function reorderHomeSections(order: string[]): Promise<HomeSection[]> {
  const res = await authHttp.put<HomeSection[]>('/home-sections/reorder', { order });
  return res.data || [];
}

export async function createHomeSection(body: {
  key: string;
  type: string;
  title?: string | null;
  subtitle?: string | null;
  config?: Record<string, any>;
}): Promise<HomeSection> {
  const res = await authHttp.post<HomeSection>('/home-sections', body);
  return res.data;
}

export async function deleteHomeSection(id: string): Promise<void> {
  await authHttp.delete(`/home-sections/${id}`);
}

export async function resetHomeSections(): Promise<HomeSection[]> {
  const res = await authHttp.post<HomeSection[]>('/home-sections/reset', {});
  return res.data || [];
}
