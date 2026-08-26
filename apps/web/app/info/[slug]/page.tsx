import type { Metadata } from 'next';
import { renderPage, generatePageMetadata } from '../../_components/PageView';

/**
 * /info/<slug> — information pages.
 *
 * "About us", "Sustainability", "Press", "Our story" — pages
 * the merchant wants to publish but that aren't policy
 * documents or help articles. The shared renderer does the
 * work; this file is the URL segment.
 */
export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  return generatePageMetadata('info', params.slug);
}

export default function InfoPage({ params }: { params: { slug: string } }) {
  return renderPage('info', params.slug);
}
