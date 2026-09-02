/**
 * Rich prebuilt home blocks (components/rich/*).
 *
 * Each block is pure presentational (config in -> markup out), so these
 * tests pin the essentials: content rendering, the design toggles that
 * change markup, and the "hide when nothing to show" rule that keeps an
 * empty block from leaving a blank band on the page.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FaqAccordion from './FaqAccordion';
import LogoCloud from './LogoCloud';
import VideoSection from './VideoSection';
import ComparisonTable from './ComparisonTable';
import PullQuote from './PullQuote';
import LookbookSection from './LookbookSection';

describe('FaqAccordion', () => {
  const items = [
    { q: 'How long does shipping take?', a: '3–5 working days.' },
    { q: 'Returns?', a: '30 days.' },
  ];

  it('renders every question and opens the first item by default', () => {
    const { container } = render(<FaqAccordion title="FAQ" items={items} />);
    expect(container.textContent).toContain('How long does shipping take?');
    expect(container.textContent).toContain('Returns?');
    const buttons = container.querySelectorAll('button[aria-expanded="true"]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('How long does shipping take?');
  });

  it('expands a closed item on click', () => {
    const { container } = render(<FaqAccordion title="FAQ" items={items} openFirst={false} />);
    expect(container.querySelectorAll('button[aria-expanded="true"]').length).toBe(0);
    const second = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Returns?')
    )!;
    fireEvent.click(second);
    expect(container.querySelectorAll('button[aria-expanded="true"]').length).toBe(1);
    expect(container.textContent).toContain('30 days.');
  });

  it('renders nothing when there are no items', () => {
    const { container } = render(<FaqAccordion title="FAQ" items={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('LogoCloud', () => {
  it('renders wordmarks for image-less logos and images for uploaded ones', () => {
    const { container } = render(
      <LogoCloud
        title="Trusted by"
        items={[
          { name: 'Acme', image: '' },
          { name: 'Beta', image: '/uploads/beta.png' },
        ]}
        grayscale
      />
    );
    expect(container.textContent).toContain('Acme');
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('Beta');
    expect(img?.getAttribute('style') ?? '').toContain('grayscale(1)');
  });

  it('renders nothing with no logos', () => {
    const { container } = render(<LogoCloud title="Trusted by" items={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('VideoSection', () => {
  it('turns a YouTube watch URL into a nocookie embed', () => {
    const { container } = render(
      <VideoSection title="Lookbook" url="https://www.youtube.com/watch?v=abc123XYZ" />
    );
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toContain('youtube-nocookie.com/embed/abc123XYZ');
    expect(iframe?.getAttribute('allowFullScreen')).not.toBeNull();
  });

  it('adds autoplay + muted params for autoplay', () => {
    const { container } = render(
      <VideoSection url="https://vimeo.com/123456" autoplay muted loop />
    );
    const src = container.querySelector('iframe')?.getAttribute('src') ?? '';
    expect(src).toContain('player.vimeo.com/video/123456');
    expect(src).toContain('autoplay=1');
    expect(src).toContain('muted=1');
    expect(src).toContain('loop=1');
  });

  it('renders a <video> tag for direct files', () => {
    const { container } = render(<VideoSection url="https://cdn.example.com/clip.mp4" />);
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://cdn.example.com/clip.mp4');
  });

  it('renders nothing for unknown links or no URL', () => {
    const a = render(<VideoSection url="" />);
    expect(a.container.innerHTML).toBe('');
    const b = render(<VideoSection url="https://evil.example/x" />);
    expect(b.container.innerHTML).toBe('');
  });
});

describe('ComparisonTable', () => {
  it('renders labels and converts true/false cells into marks', () => {
    const { container } = render(
      <ComparisonTable
        title="Compare"
        columns={[{ name: 'Basic', sub: '$5' }, { name: 'Pro' }]}
        rows={[
          { label: 'Free shipping', values: ['false', 'true'] },
          { label: 'Max items', values: ['', 'text-value'] },
        ]}
        highlight={2}
      />
    );
    expect(container.textContent).toContain('Compare');
    expect(container.textContent).toContain('Free shipping');
    expect(container.textContent).toContain('✓');
    expect(container.textContent).toContain('✕');
    expect(container.textContent).toContain('text-value');
    // Highlighted column (2) is marked on the table element.
    expect(container.querySelector('table')?.getAttribute('data-highlight')).toBe('2');
  });

  it('renders nothing without columns or rows', () => {
    const a = render(<ComparisonTable columns={[]} rows={[]} />);
    expect(a.container.innerHTML).toBe('');
  });
});

describe('PullQuote', () => {
  it('renders the quote with attribution', () => {
    const { container } = render(
      <PullQuote quote="Quality first." author="Jane" role="Founder" />
    );
    expect(container.textContent).toContain('Quality first.');
    expect(container.textContent).toContain('Jane');
    expect(container.textContent).toContain('Founder');
  });

  it('applies the brand/dark background variants', () => {
    const dark = render(<PullQuote quote="Q" background="dark" />);
    expect(dark.container.querySelector('[data-section="quote"]')?.getAttribute('data-background')).toBe('dark');
    // Dark keeps an explicit colour (test DOM cannot serialize color var()s,
    // so the brand case is asserted via its data attribute instead).
    expect(dark.container.innerHTML).toContain('#111827');
    const brand = render(<PullQuote quote="Q" background="brand" />);
    expect(brand.container.querySelector('[data-section="quote"]')?.getAttribute('data-background')).toBe('brand');
  });

  it('renders nothing without a quote', () => {
    const { container } = render(<PullQuote quote="" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('LookbookSection', () => {
  it('renders copy + CTA and links the image to the CTA URL', () => {
    const { container } = render(
      <LookbookSection
        title="The summer look"
        description="Light fabrics, bold colours."
        image="/uploads/look.jpg"
        buttonText="Shop it"
        linkUrl="/products?sort=newest"
      />
    );
    expect(container.textContent).toContain('The summer look');
    expect(container.textContent).toContain('Shop it');
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.some((a) => a.getAttribute('href') === '/products?sort=newest')).toBe(true);
  });

  it('renders the copy band full-width when there is no photo', () => {
    const { container } = render(
      <LookbookSection title="Text only" description="No photo needed." buttonText="Shop" linkUrl="/products" />
    );
    expect(container.textContent).toContain('Text only');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing when empty', () => {
    const { container } = render(<LookbookSection />);
    expect(container.innerHTML).toBe('');
  });
});
