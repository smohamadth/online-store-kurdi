import type { Metadata } from 'next';
import { renderPage, generatePageMetadata } from '../../_components/PageView';

/**
 * /help/<slug> — customer-support pages.
 *
 * "Shipping", "Warranty", "Sizing guide", "Returns". Sits
 * next to the existing /faq and /contact as a curated help
 * section, but with the rich-text editor instead of a
 * Q&A-list.
 */
export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  return generatePageMetadata('help', params.slug);
}

export default function HelpPage({ params }: { params: { slug: string } }) {
  return renderPage('help', params.slug);
}
