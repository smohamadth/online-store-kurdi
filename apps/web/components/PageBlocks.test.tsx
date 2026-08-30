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
import { CUSTOM_BACKGROUNDS } from './HomeSections';
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

  it('renders quote text and attribution as text (not html)', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'quote', { text: 'Great service.', attribution: 'Dana, owner' })]} />,
    );
    const bq = container.querySelector('blockquote');
    expect(bq).not.toBeNull();
    expect(bq?.textContent).toContain('Great service.');
    expect(bq?.textContent).toContain('Dana, owner');
    // The attribution is a <footer>, not an <h*> or script.
    expect(bq?.querySelector('footer')?.textContent).toContain('Dana, owner');
  });

  it('renders a quote without attribution when it is empty', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'quote', { text: 'Just words.' })]} />,
    );
    expect(container.querySelector('blockquote')?.querySelector('footer')).toBeNull();
  });

  it('renders a gallery of images with captions, skipping empty urls', () => {
    const { container } = render(
      <PageBlocks
        blocks={[
          b('a', 'gallery', {
            images: [
              { url: '/one.jpg', caption: 'One' },
              { url: '', caption: 'no url, skipped' },
              { url: '/three.jpg', caption: 'Three' },
            ],
          }),
        ]}
      />,
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toBe('/one.jpg');
    expect(imgs[1].getAttribute('src')).toBe('/three.jpg');
    const figcaps = Array.from(container.querySelectorAll('figcaption')).map((f) => f.textContent);
    expect(figcaps).toEqual(['One', 'Three']);
  });

  it('caps a gallery at four images', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ url: `/x${i}.jpg`, caption: `${i}` }));
    const { container } = render(<PageBlocks blocks={[b('a', 'gallery', { images: five })]} />);
    expect(container.querySelectorAll('img')).toHaveLength(4);
  });

  it('renders nothing for a gallery with no usable images', () => {
    const { container } = render(
      <PageBlocks blocks={[b('a', 'gallery', { images: [{ url: '', caption: '' }] })]} />,
    );
    expect(container.querySelector('img')).toBeNull();
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

  describe('custom section (admin-designed)', () => {
    it('pins the background palette: every option is readable on its own band', () => {
      // Contract: text/heading colours must contrast their background.
      // brand/dark invert (light text on the coloured band), none/soft
      // keep the theme's body text. An unknown value falls back to soft
      // (never to an unstyled, unreadable band).
      expect(CUSTOM_BACKGROUNDS.none).toEqual({
        bg: 'transparent',
        text: 'var(--body-text, #111)',
        heading: 'var(--body-text, #111)',
      });
      expect(CUSTOM_BACKGROUNDS.soft.bg).toBe('var(--surface-2, #f5f5f7)');
      expect(CUSTOM_BACKGROUNDS.soft.text).toBe('var(--body-text, #111)');
      expect(CUSTOM_BACKGROUNDS.brand.bg).toBe('var(--brand, #111)');
      expect(CUSTOM_BACKGROUNDS.brand.text).toBe('var(--brand-text, #fff)');
      expect(CUSTOM_BACKGROUNDS.dark).toEqual({ bg: '#111827', text: '#e5e7eb', heading: '#ffffff' });
    });

    it('renders the title as a heading and the rich content', () => {
      const { container } = render(
        <PageBlocks
          blocks={[b('a', 'custom', { title: 'Why us', html: '<p>Crafted in Kurdistan</p>' })]}
        />,
      );
      expect(container.querySelector('h2')?.textContent).toBe('Why us');
      expect(container.textContent).toContain('Crafted in Kurdistan');
    });

    it('applies the chosen width, padding and alignment', () => {
      // (var()-based backgrounds are not serialised by jsdom's CSSOM, so
      // the palette itself is pinned in the "background palette" test
      // above; here we pin the layout choices, which jsdom preserves.)
      const { container } = render(
        <PageBlocks
          blocks={[
            b('a', 'custom', {
              html: '<p>x</p>',
              background: 'brand',
              width: 'full',
              padding: 'none',
              align: 'center',
            }),
          ]}
        />,
      );
      const section = container.querySelector('section');
      expect(section).not.toBeNull();
      // padding "none" -> 0 20px (horizontal breathing room only)
      expect(section!.getAttribute('style')).toContain('padding: 0px 20px');
      const inner = section!.querySelector('div')!;
      const style = inner.getAttribute('style') || '';
      // width "full" -> no max-width; align center -> centered text
      expect(style).toContain('max-width: none');
      expect(style).toContain('text-align: center');
    });

    it('defaults to large vertical padding when config is minimal', () => {
      const { container } = render(<PageBlocks blocks={[b('a', 'custom', { html: '<p>x</p>' })]} />);
      const section = container.querySelector('section');
      expect(section!.getAttribute('style')).toContain('padding: 56px 20px');
      expect(section!.querySelector('div')!.getAttribute('style')).toContain('max-width: 860px');
    });

    it('renders nothing for a custom block with no title and no content', () => {
      const { container } = render(<PageBlocks blocks={[b('a', 'custom', {})]} />);
      expect(container.innerHTML).toBe('');
    });
  });
});
