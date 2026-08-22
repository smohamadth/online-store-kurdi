/**
 * Helper that renders a component wrapped in the storefront providers.
 *
 * CartProvider + ThemeProvider are what every page mounts under, so the
 * closest thing to a real render is wrapping in both. Tests that need
 * finer control (e.g. setting theme before mount) use the lower-level
 * `render` from @testing-library/react directly.
 */
import { ReactNode, ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { CartProvider } from '@/lib/store';
import { ThemeProvider } from '@/lib/theme';

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <CartProvider>{children}</CartProvider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
