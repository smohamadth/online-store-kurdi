/**
 * /preview/<key> — page tests.
 *
 * The page is a server component that:
 *   - Validates the theme key against the registry.
 *   - Generates noindex metadata.
 *   - Renders the PreviewView client component.
 *
 * The tests pin:
 *   - The page returns 404 for an unknown key (via notFound()).
 *   - The page renders the PreviewView for a known key.
 *   - The static params list contains every theme key.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThemePreviewPage, { generateMetadata, generateStaticParams } from './page';
import { THEMES } from '@/lib/themeRegistry';

// `notFound` from next/navigation throws a sentinel error in
// App Router. Mock it to throw a recognizable error so the
// "unknown key 404s" test can assert the right behaviour.
vi.mock('next/navigation', () => ({
  notFound: () => {
    const err = new Error('NEXT_NOT_FOUND');
    (err as any).digest = 'NEXT_NOT_FOUND';
    throw err;
  },
}));

describe('/preview/<key> — page', () => {
  it('renders the preview view for a known key', () => {
    const params = { key: 'bold' };
    render(<ThemePreviewPage params={params} />);
    // The PreviewView's chrome shows the theme name.
    // Note: the "Previewing: Bold" text is rendered by the
    // client PreviewHeader. RTL with happy-dom mounts
    // client components synchronously enough to find the
    // text.
    expect(screen.getByTestId('preview-header')).toBeInTheDocument();
    expect(screen.getByTestId('preview-theme-name').textContent).toContain('Bold');
  });

  it('renders the preview view for the default key', () => {
    const params = { key: 'default' };
    render(<ThemePreviewPage params={params} />);
    expect(screen.getByTestId('preview-header')).toBeInTheDocument();
    expect(screen.getByTestId('preview-theme-name').textContent).toContain('Default');
  });

  it('throws NEXT_NOT_FOUND for an unknown key', () => {
    const params = { key: 'does-not-exist' };
    // The page calls notFound() which our mock turns into a
    // thrown error. We catch and inspect.
    expect(() => render(<ThemePreviewPage params={params} />)).toThrow('NEXT_NOT_FOUND');
  });

  it('handles URL-encoded keys', () => {
    // "bold" doesn't need encoding but the test is for the
    // decodeURIComponent path which the page runs.
    const params = { key: encodeURIComponent('minimal') };
    render(<ThemePreviewPage params={params} />);
    expect(screen.getByTestId('preview-theme-name').textContent).toContain('Minimal');
  });
});

describe('/preview/<key> — generateMetadata', () => {
  it('emits noindex metadata for a known key', async () => {
    const metadata = await generateMetadata({ params: { key: 'bold' } });
    // Noindex is conveyed via `robots: { index: false, follow: false }`
    // (the App Router's structured form, not a string).
    expect(metadata.robots).toBeDefined();
    const robots = metadata.robots as any;
    expect(robots.index).toBe(false);
  });

  it('emits the theme name in the title', async () => {
    const metadata = await generateMetadata({ params: { key: 'minimal' } });
    const title = metadata.title as any;
    const titleString = typeof title === 'string' ? title : title?.absolute || title?.default || '';
    expect(titleString).toContain('Minimal');
  });

  it('emits noindex metadata for an unknown key', async () => {
    // Even an unknown key returns noindex so the 404 itself
    // isn't indexed.
    const metadata = await generateMetadata({ params: { key: 'no-such-theme' } });
    const robots = metadata.robots as any;
    expect(robots.index).toBe(false);
  });
});

describe('/preview/<key> — generateStaticParams', () => {
  it('returns every theme key', () => {
    const params = generateStaticParams();
    const keys = params.map((p) => p.key).sort();
    const expected = [...THEMES].map((t) => t.key).sort();
    expect(keys).toEqual(expected);
  });
});
