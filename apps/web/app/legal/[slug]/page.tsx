import type { Metadata } from 'next';
import { renderPage, generatePageMetadata } from '../../_components/PageView';

/**
 * /legal/<slug> — policy / legal pages.
 *
 * "Privacy", "Terms", "Cookies", "Accessibility". The merchant
 * can override the shipping-app's built-in /privacy and /terms
 * pages by giving a CMS page the same title (the API
 * disallows slug collision with the reserved set, so the
 * built-ins win on routing; the CMS pages sit at /legal/<slug>
 * as the legal appendix).
 */
export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  return generatePageMetadata('legal', params.slug);
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  return renderPage('legal', params.slug);
}
