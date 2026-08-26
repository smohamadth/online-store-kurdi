/**
 * /preview — gallery page tests.
 *
 * The gallery lists every installed theme as a card with a
 * preview image, name, description, and a link to
 * /preview/<key>. The tests pin:
 *   - The page renders without crashing.
 *   - Every theme in the registry gets a card.
 *   - The cards are sorted by key (deterministic order).
 *   - Paid themes show the "Paid" badge.
 *   - The card link points at the right preview URL.
 *
 * Server-component test: no client-side state, just
 * render-and-inspect. The components config handles it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PreviewGalleryPage from './page';
import { THEMES } from '@/lib/themeRegistry';

describe('/preview — gallery', () => {
  it('renders without crashing', () => {
    render(<PreviewGalleryPage />);
    expect(screen.getByTestId('preview-gallery')).toBeInTheDocument();
  });

  it('renders a card for every theme in the registry', () => {
    render(<PreviewGalleryPage />);
    for (const theme of THEMES) {
      expect(
        screen.getByTestId(`preview-gallery-card-${theme.key}`),
        `expected card for theme "${theme.key}"`,
      ).toBeInTheDocument();
    }
  });

  it('every card has a link to /preview/<key>', () => {
    render(<PreviewGalleryPage />);
    for (const theme of THEMES) {
      const card = screen.getByTestId(`preview-gallery-card-${theme.key}`);
      const anchor = card.closest('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('href')).toBe(`/preview/${theme.key}`);
    }
  });

  it('paid themes show a "Paid" badge', () => {
    render(<PreviewGalleryPage />);
    for (const theme of THEMES) {
      const card = screen.getByTestId(`preview-gallery-card-${theme.key}`);
      if (theme.features.paid) {
        // The badge text is "Paid". We look for the text
        // inside the card to confirm it's there.
        expect(card.textContent).toMatch(/Paid/);
      }
    }
  });

  it('every card shows the theme name and version+author', () => {
    render(<PreviewGalleryPage />);
    for (const theme of THEMES) {
      const card = screen.getByTestId(`preview-gallery-card-${theme.key}`);
      expect(card.textContent).toContain(theme.name);
      expect(card.textContent).toContain(theme.version);
      expect(card.textContent).toContain(theme.author);
    }
  });

  it('the cards are sorted by key (deterministic order)', () => {
    const { container } = render(<PreviewGalleryPage />);
    const cards = container.querySelectorAll('[data-testid^="preview-gallery-card-"]');
    const keys = Array.from(cards).map((c) =>
      c.getAttribute('data-testid')!.replace('preview-gallery-card-', ''),
    );
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});
