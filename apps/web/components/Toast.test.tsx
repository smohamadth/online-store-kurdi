/**
 * Toast / ToastContainer / addToast / removeToast.
 *
 * The module keeps its state in module-level `let` variables. To keep
 * tests independent we re-import the module per test via
 * `vi.resetModules()` so each test starts with an empty global toasts
 * array.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

// Static-typed re-imports. Each `await import(...)` inside tests gets a
// fresh module instance after vi.resetModules().
type ToastModule = typeof import('@/components/Toast');

let mod: ToastModule;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  // Re-import RTL/React too so any internal state is fresh. Then load
  // the Toast module fresh.
  const reactMod = await import('react');
  await import('@testing-library/react');
  mod = await import('@/components/Toast');
  // Capture React for use in tests without re-importing.
  (globalThis as any).__React = reactMod;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function el(node: React.ReactNode) {
  return node as any;
}

describe('Toast', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(el(<mod.ToastContainer />));
    expect(container).toBeEmptyDOMElement();
  });

  it('addToast renders a toast of the requested type with its colour and icon', () => {
    render(el(<mod.ToastContainer />));
    act(() => {
      mod.addToast({ type: 'success', message: 'Saved!' });
    });
    expect(screen.getByText('Saved!')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('emits the right icon for each type', () => {
    render(el(<mod.ToastContainer />));

    act(() => mod.addToast({ type: 'error', message: 'nope' }));
    // Each toast row contains: an icon span (rounded) and a close X button.
    // The icon span is identified by the inline border-radius: 50% style.
    const errorIcon = document.querySelector('span[style*="border-radius: 50%"]') as HTMLElement;
    expect(errorIcon).toBeInTheDocument();
    expect(errorIcon.textContent).toBe('✕');

    act(() => mod.addToast({ type: 'warning', message: 'careful' }));
    expect(screen.getByText('⚠')).toBeInTheDocument();

    act(() => mod.addToast({ type: 'info', message: 'fyi' }));
    expect(screen.getByText('ℹ')).toBeInTheDocument();
  });

  it('clicking a toast dismisses it', () => {
    render(el(<mod.ToastContainer />));
    act(() => {
      mod.addToast({ type: 'info', message: 'click me' });
    });
    expect(screen.getByText('click me')).toBeInTheDocument();

    act(() => {
      screen.getByText('click me').click();
    });
    expect(screen.queryByText('click me')).not.toBeInTheDocument();
  });

  it('clicking the X button dismisses the toast', () => {
    render(el(<mod.ToastContainer />));
    act(() => {
      mod.addToast({ type: 'info', message: 'X target' });
    });
    const closeBtn = screen.getByRole('button');
    act(() => closeBtn.click());
    expect(screen.queryByText('X target')).not.toBeInTheDocument();
  });

  it('auto-removes a toast after its duration', () => {
    render(el(<mod.ToastContainer />));
    act(() => {
      mod.addToast({ type: 'info', message: 'temporary', duration: 1000 });
    });
    expect(screen.getByText('temporary')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByText('temporary')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('temporary')).not.toBeInTheDocument();
  });

  it('uses the default 3000ms duration when none is given', () => {
    render(el(<mod.ToastContainer />));
    act(() => mod.addToast({ type: 'info', message: 'three seconds' }));
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByText('three seconds')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('three seconds')).not.toBeInTheDocument();
  });

  it('shows multiple toasts stacked', () => {
    render(el(<mod.ToastContainer />));
    act(() => {
      mod.addToast({ type: 'info', message: 'one' });
      mod.addToast({ type: 'info', message: 'two' });
      mod.addToast({ type: 'info', message: 'three' });
    });
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
  });

  it('two mounted containers stay in sync', () => {
    render(
      el(
        <div>
          <mod.ToastContainer />
          <mod.ToastContainer />
        </div>,
      ),
    );
    act(() => mod.addToast({ type: 'info', message: 'shared' }));
    expect(screen.getAllByText('shared').length).toBe(2);
  });

  it('removeToast is exported and callable', () => {
    expect(typeof mod.removeToast).toBe('function');
    expect(() => mod.removeToast('definitely-not-an-id')).not.toThrow();
  });
});
