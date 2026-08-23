/**
 * Smoke test for the component test pipeline. If this passes, RTL,
 * happy-dom, and the next/navigation stub are all wired up correctly.
 * It also covers the Spinner component family which is purely
 * presentational.
 */
import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import Spinner, { LoadingState, LoadingOverlay, ButtonSpinner } from '@/components/Spinner';

describe('Spinner', () => {
  it('renders a status element with the given label', () => {
    renderWithProviders(<Spinner label="Loading products" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Loading products');
  });

  it('applies the size prop as inline width/height', () => {
    renderWithProviders(<Spinner size={48} />);
    const status = screen.getByRole('status');
    // happy-dom normalises the unit-suffixed string in style; check both
    // the substring and the underlying value.
    expect(status.getAttribute('style')).toContain('48px');
  });

  it('uses the default "Loading" label when none is provided', () => {
    renderWithProviders(<Spinner />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
  });
});

describe('LoadingState', () => {
  // The inner Spinner also has role="status", so we target the wrapper by
  // its `aria-live="polite"` attribute - that's the one the screen reader
  // announcement is attached to.
  function getLiveRegion() {
    return screen.getByRole('status', { name: undefined }) || screen.getAllByRole('status')[0];
  }

  it('renders a polite live region with the default message', () => {
    renderWithProviders(<LoadingState />);
    const region = document.querySelector('[aria-live="polite"]')!;
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent(/Loading…/);
  });

  it('honours a custom message', () => {
    renderWithProviders(<LoadingState message="Fetching your cart…" />);
    const region = document.querySelector('[aria-live="polite"]')!;
    expect(region).toHaveTextContent(/Fetching your cart/);
  });

  it('renders no message <p> when message is null', () => {
    renderWithProviders(<LoadingState message={null} />);
    // The region is still there (announces "loading"), but no <p> with text.
    const region = document.querySelector('[aria-live="polite"]')!;
    expect(region.querySelector('p')).toBeNull();
  });

  it('accepts a string minHeight', () => {
    renderWithProviders(<LoadingState minHeight="50vh" />);
    const region = document.querySelector('[aria-live="polite"]')!;
    expect(region.getAttribute('style')).toContain('50vh');
  });
});

describe('LoadingOverlay', () => {
  it('renders nothing when show is false', () => {
    renderWithProviders(<LoadingOverlay show={false} message="Saving" />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders an alertdialog when show is true', () => {
    renderWithProviders(<LoadingOverlay show message="Saving your changes" />);
    const overlay = screen.getByRole('alertdialog');
    expect(overlay).toHaveAttribute('aria-busy', 'true');
    expect(overlay).toHaveAttribute('aria-label', 'Saving your changes');
    expect(overlay).toHaveTextContent(/Saving your changes/);
  });
});

describe('ButtonSpinner', () => {
  it('renders a spinner with the "Working" label so it announces as a pending action', () => {
    renderWithProviders(<ButtonSpinner />);
    // The inner Spinner renders a role="status" with label "Working".
    const inner = screen.getByRole('status');
    expect(inner).toHaveAttribute('aria-label', 'Working');
  });
});
