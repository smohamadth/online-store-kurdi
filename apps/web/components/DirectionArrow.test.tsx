/**
 * DirectionArrow.
 *
 * The 15+ inline arrows we replaced in this pass (← Back, Next →,
 * View all →, etc.) all live in components that don't otherwise
 * import useTranslation. Rather than thread the hook into each
 * call site, the arrow reads the I18nSeedContext directly - the
 * root layout already provides it. This test pins:
 *   1. Each kind renders the expected LTR glyph by default.
 *   2. Each kind renders the mirrored glyph when the seed is RTL.
 *   3. The arrow is aria-hidden so screen readers don't read the
 *      glyph as a word ("rightwards arrow" etc.).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DirectionArrow } from './DirectionArrow';
import { I18nSeedProvider } from '@/lib/I18nSeedProvider';

describe('DirectionArrow', () => {
  it('renders the LTR glyph for `back` by default', () => {
    const { container } = render(<DirectionArrow kind="back" />);
    expect(container.textContent).toBe('←');
  });

  it('renders the RTL glyph for `back` when the seed is RTL', () => {
    const { container } = render(
      <I18nSeedProvider value={{ lang: 'ku', dir: 'rtl' }}>
        <DirectionArrow kind="back" />
      </I18nSeedProvider>,
    );
    expect(container.textContent).toBe('→');
  });

  it('mirrors `forward` between LTR and RTL', () => {
    const ltr = render(<DirectionArrow kind="forward" />);
    expect(ltr.container.textContent).toBe('→');
    ltr.unmount();
    const rtl = render(
      <I18nSeedProvider value={{ lang: 'ar', dir: 'rtl' }}>
        <DirectionArrow kind="forward" />
      </I18nSeedProvider>,
    );
    expect(rtl.container.textContent).toBe('←');
  });

  it('renders aria-hidden so screen readers skip the glyph', () => {
    const { container } = render(<DirectionArrow kind="back" />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('aria-hidden')).toBe('true');
  });
});
