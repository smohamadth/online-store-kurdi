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
};

/** Types an admin can add from scratch (the rest are singletons already seeded). */
export const CREATABLE_TYPES = ['richText', 'custom', 'gallery', 'features', 'trustBar', 'testimonials', 'stats'];

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
