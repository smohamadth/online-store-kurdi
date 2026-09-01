/**
 * StoreImage - the store's single image component.
 *
 * The split is the contract:
 *  - same-origin / relative URLs render through next/image (which is
 *    what adds lazy loading, async decode, and `priority` for the LCP
 *    product image)
 *  - absolute external URLs and data: URIs render as a plain <img>
 *    (merchants paste arbitrary image URLs; hotlinks must not go
 *    through the optimizer)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import StoreImage from './StoreImage';

describe('StoreImage', () => {
  it('renders a plain <img> for a relative URL without dimensions (fallback)', () => {
    const { container } = render(<StoreImage src="/images/x.jpg" alt="X" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('alt')).toBe('X');
    expect(img!.getAttribute('src')).toBe('/images/x.jpg');
  });

  it('lazy-loads and async-decodes non-priority images', () => {
    const { container } = render(<StoreImage src="/images/x.jpg" alt="X" fill />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('eager-loads the LCP image when priority is set', () => {
    const { container } = render(
      <StoreImage src="/images/hero.jpg" alt="Hero" fill priority />,
    );
    const img = container.querySelector('img')!;
    // priority => no lazy loading; next/image also sets fetchpriority
    expect(img.getAttribute('loading')).not.toBe('lazy');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });

  it('renders a plain img for external http(s) URLs (no optimizer)', () => {
    const { container } = render(
      <StoreImage src="https://cdn.example.com/p.jpg" alt="Remote" />,
    );
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/p.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('renders a plain img for data: URIs', () => {
    const { container } = render(
      <StoreImage src="data:image/png;base64,AAAA" alt="Inline" />,
    );
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('passes through onError (the broken-image fallback depends on it)', () => {
    const onError = vi.fn();
    const { container } = render(
      <StoreImage src="/images/broken.jpg" alt="B" fill onError={onError} />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(onError).toHaveBeenCalled();
  });
});
