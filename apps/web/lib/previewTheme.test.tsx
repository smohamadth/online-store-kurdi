/**
 * previewTheme — provider + context tests.
 *
 * The provider is the bridge between the /preview/<key>
 * route and the platform's section components. It
 * computes the theme from the registry (no API call) and
 * injects it as the ThemeContext value, so any section
 * component (MinimalHero, BoldCategories, etc.) renders
 * against the previewed theme.
 *
 * What we test:
 *   - The provider computes a Theme for the given key.
 *   - The ThemeContext inside the provider reports the
 *     previewed theme's activeTheme.
 *   - The isPreviewing flag is correct (true when the
 *     previewed key differs from the store's, false when
 *     they match).
 *   - The CSS variable style block is rendered with the
 *     right selector.
 *   - The usePreviewTheme hook returns null outside the
 *     provider.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTheme } from './theme';
import { PreviewThemeProvider, usePreviewTheme } from './previewTheme';

function ActiveThemeReporter({ testid }: { testid: string }) {
  const { theme } = useTheme();
  return (
    <span data-testid={testid} data-active={theme.activeTheme}>
      {theme.activeTheme}
    </span>
  );
}

function PreviewContextReporter({ testid }: { testid: string }) {
  const ctx = usePreviewTheme();
  return (
    <span
      data-testid={testid}
      data-preview={ctx?.config.key ?? 'none'}
      data-is-previewing={ctx ? String(ctx.isPreviewing) : 'no-provider'}
    >
      {ctx?.config.key ?? 'no preview'}
    </span>
  );
}

describe('PreviewThemeProvider — theme context', () => {
  it('sets the activeTheme on the inner ThemeContext to the previewed key', () => {
    render(
      <PreviewThemeProvider themeKey="bold" storeActiveTheme="default">
        <ActiveThemeReporter testid="report" />
      </PreviewThemeProvider>,
    );
    const el = screen.getByTestId('report');
    expect(el.dataset.active).toBe('bold');
  });

  it('renders different active themes for different keys', () => {
    const { rerender } = render(
      <PreviewThemeProvider themeKey="default" storeActiveTheme="default">
        <ActiveThemeReporter testid="report" />
      </PreviewThemeProvider>,
    );
    expect(screen.getByTestId('report').dataset.active).toBe('default');

    rerender(
      <PreviewThemeProvider themeKey="minimal" storeActiveTheme="default">
        <ActiveThemeReporter testid="report" />
      </PreviewThemeProvider>,
    );
    expect(screen.getByTestId('report').dataset.active).toBe('minimal');
  });

  it('falls back to default for an unknown key', () => {
    render(
      <PreviewThemeProvider themeKey="does-not-exist" storeActiveTheme="default">
        <ActiveThemeReporter testid="report" />
      </PreviewThemeProvider>,
    );
    // The defensive fallback resolves to the default theme.
    expect(screen.getByTestId('report').dataset.active).toBe('default');
  });
});

describe('PreviewThemeProvider — preview context', () => {
  it('exposes the previewed config to usePreviewTheme', () => {
    render(
      <PreviewThemeProvider themeKey="bold" storeActiveTheme="default">
        <PreviewContextReporter testid="ctx" />
      </PreviewThemeProvider>,
    );
    const el = screen.getByTestId('ctx');
    expect(el.dataset.preview).toBe('bold');
  });

  it('reports isPreviewing=true when the previewed key differs from the store', () => {
    render(
      <PreviewThemeProvider themeKey="bold" storeActiveTheme="default">
        <PreviewContextReporter testid="ctx" />
      </PreviewThemeProvider>,
    );
    expect(screen.getByTestId('ctx').dataset.isPreviewing).toBe('true');
  });

  it('reports isPreviewing=false when the previewed key matches the store', () => {
    render(
      <PreviewThemeProvider themeKey="bold" storeActiveTheme="bold">
        <PreviewContextReporter testid="ctx" />
      </PreviewThemeProvider>,
    );
    expect(screen.getByTestId('ctx').dataset.isPreviewing).toBe('false');
  });

  it('reports isPreviewing=false when the store has no active theme and the preview is default', () => {
    render(
      <PreviewThemeProvider themeKey="default" storeActiveTheme={null}>
        <PreviewContextReporter testid="ctx" />
      </PreviewThemeProvider>,
    );
    expect(screen.getByTestId('ctx').dataset.isPreviewing).toBe('false');
  });
});

describe('usePreviewTheme — outside provider', () => {
  it('returns null when called outside a PreviewThemeProvider', () => {
    function Bare() {
      const ctx = usePreviewTheme();
      return (
        <span data-testid="bare" data-preview={ctx === null ? 'null' : ctx.config.key}>
          bare
        </span>
      );
    }
    render(<Bare />);
    expect(screen.getByTestId('bare').dataset.preview).toBe('null');
  });
});

describe('PreviewThemeProvider — CSS variable injection', () => {
  it('renders a <style> tag with the right [data-theme-preview] selector', () => {
    const { container } = render(
      <PreviewThemeProvider themeKey="minimal" storeActiveTheme="default">
        <span>child</span>
      </PreviewThemeProvider>,
    );
    // The provider sets a data-theme-preview attribute on its
    // outer wrapper div. The style tag inside the wrapper
    // targets that attribute.
    const wrapper = container.querySelector('[data-theme-preview="minimal"]');
    expect(wrapper).not.toBeNull();
    // The style tag's content must include the data attribute
    // selector. We don't pin the full CSS payload (it can
    // change), but the selector must be there.
    const styleTags = container.querySelectorAll('style');
    let foundSelector = false;
    for (const tag of Array.from(styleTags)) {
      if (tag.textContent?.includes('[data-theme-preview="minimal"]')) {
        foundSelector = true;
        break;
      }
    }
    expect(foundSelector).toBe(true);
  });
});
