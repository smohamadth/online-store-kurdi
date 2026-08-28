/**
 * PageBlocks — storefront renderer for page layout blocks.
 *
 * Pins that every block type renders its core content, that unknown
 * block types are skipped (a page saved by a newer admin bundle must
 * not break an older storefront), and that text-like config values
 * (callout text, heading text) are rendered as TEXT, never as HTML.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PageBlocks } from './PageBlocks';
import type { PageBlock } from '@/lib/pageBlocks';

const b = (id: string, type: string, config: Record<string, any>): PageBlock =>
  ({ id, type, config }) as PageBlock;

describe('PageBlocks', () => {
  it('renders rich text html', () => {
    const { container } = render(<PageBlocks blocks={[b('a', 'richText', { html: '<p>Store body</p>' })]} />);
    expect(container.innerHTML).toContain('Store body');
  });

  it('renders h2/h3 headings with text (not html) as text', () => {
    const { container, rerender } = render(
      <PageBlocks blocks={[b('a', 'heading', { text: 'Our story', level: 2 })]} />,
    );
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe('Our story');

    rerender(<PageBlocks blocks={[b('a', 'heading', { text: 'Details', level: 3 })]} />);
    const h3 = container.querySelector('h3');
    expect(h3?.textContent).toBe('Details');
  });

  it('escapes heading text - a title with markup is text', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'heading', { text: 'A <b>bold</b> claim' })]} />,
    );
    expect(container.querySelector('h2 b')).toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('A <b>bold</b> claim');
  });

  it('renders callout text as text with the tone styling', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'callout', { text: 'Free returns', tone: 'success' })]} />,
    );
    const note = container.querySelector('[role="note"]');
    expect(note?.textContent).toBe('Free returns');
    expect(note?.getAttribute('style')).toContain('#f0fdf4');
  });

  it('renders images with alt and caption', () => {
    const { container } = render(
      <PageBlocks
        blocks={[b('a', 'image', { url: '/x.jpg', alt: 'Our shop', caption: 'The flagship store' })]}
      />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/x.jpg');
    expect(img?.getAttribute('alt')).toBe('Our shop');
    expect(container.querySelector('figcaption')?.textContent).toBe('The flagship store');
  });

  it('renders two columns from sanitized html', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'columns', { left: '<p>Left col</p>', right: '<p>Right col</p>' })]} />,
    );
    expect(container.textContent).toContain('Left col');
    expect(container.textContent).toContain('Right col');
  });

  it('renders a cta link with its label and href', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'cta', { label: 'Contact us', href: '/contact', variant: 'outline' })]} />,
    );
    const a = container.querySelector('a');
    expect(a?.textContent).toBe('Contact us');
    expect(a?.getAttribute('href')).toBe('/contact');
  });

  it('renders divider and spacer as inert elements', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'divider', {}), b('b', 'spacer', { size: 'lg' })]} />,
    );
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('skips unknown block types without breaking the rest', () => {
    const { container } = render(
      <PageBlocks
        blocks={[
          b('a', 'warp-drive', {}),
          b('b', 'richText', { html: '<p>Still here</p>' }),
        ]}
      />,
    );
    expect(container.textContent).toContain('Still here');
  });

  it('renders nothing for an empty block list', () => {
    const { container } = render(<PageBlocks blocks={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
