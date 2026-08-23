/**
 * ErrorBoundary.
 *
 * The boundary is a class component that:
 *   - Renders children normally.
 *   - Catches a render error and shows the default fallback ("Something
 *     went wrong") with a refresh button.
 *   - Uses a custom fallback when one is passed.
 *   - In dev mode, exposes the error message + stack in a <details>.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '@/components/ErrorBoundary';

function Boom({ message }: { message?: string }) {
  throw new Error(message || 'boom');
}

describe('ErrorBoundary', () => {
  let originalNodeEnv: string | undefined;
  let originalReload: () => void;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalReload = window.location.reload;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    window.location.reload = originalReload;
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows the default fallback when a child throws', () => {
    // Silence React's expected error log.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom message="disk melted" />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    expect(screen.getByText(/try refreshing the page/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();
  });

  it('renders the custom fallback when one is provided', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>custom sad face</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('custom sad face')).toBeInTheDocument();
    // Default fallback is NOT rendered.
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it('shows the error message in development mode', () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom message="super specific failure" />
      </ErrorBoundary>,
    );
    const details = document.querySelector('details');
    expect(details).toBeInTheDocument();
    const text = details!.textContent || '';
    expect(text).toContain('super specific failure');
  });

  it('hides the error message in production', () => {
    process.env.NODE_ENV = 'production';
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom message="super specific failure" />
      </ErrorBoundary>,
    );
    expect(document.querySelector('details')).toBeNull();
  });

  it('refresh button resets state and reloads the page', () => {
    process.env.NODE_ENV = 'production';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadSpy = vi.fn();
    window.location.reload = reloadSpy;

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    screen.getByRole('button', { name: /refresh page/i }).click();
    expect(reloadSpy).toHaveBeenCalled();
  });
});
