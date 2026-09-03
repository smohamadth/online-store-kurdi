/**
 * Exit-intent email capture popup.
 *
 * The behaviour that matters is restraint: a popup that reappears is the most
 * effective way to make a store feel spammy. These pin "at most once per
 * browser, ever", the trigger conditions, and that a failed API call never
 * leaves the shopper stuck.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EmailCapturePopup, { CAPTURE_DISMISSED_KEY } from './EmailCapturePopup';

const mockCapture = vi.fn();
vi.mock('@/lib/marketing', () => ({
  captureEmail: (...args: unknown[]) => mockCapture(...args),
}));

let mockPath = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPath,
}));

/** Simulate the pointer leaving through the top edge of the viewport. */
function exitIntent(clientY = -5) {
  fireEvent.mouseOut(document, { relatedTarget: null, clientY });
}

beforeEach(() => {
  localStorage.clear();
  mockPath = '/';
  mockCapture.mockReset();
  mockCapture.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('trigger conditions', () => {
  it('is hidden until something triggers it', () => {
    render(<EmailCapturePopup />);
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it('opens when the pointer leaves through the top', async () => {
    render(<EmailCapturePopup />);
    exitIntent();
    await waitFor(() => expect(screen.getByTestId('email-capture-popup')).toBeTruthy());
  });

  it('ignores the pointer leaving sideways or downward', () => {
    // clientY > 0 means the pointer left through a side or the bottom, which
    // is ordinary mouse movement - not an intent to leave the page.
    render(<EmailCapturePopup />);
    exitIntent(200);
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it('ignores mouseout that stays inside the document', () => {
    // relatedTarget non-null = moved between elements, not out of the window.
    render(<EmailCapturePopup />);
    fireEvent.mouseOut(document, { relatedTarget: document.body, clientY: -5 });
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it('opens on the timed fallback for touch devices, where exit intent never fires', () => {
    vi.useFakeTimers();
    render(<EmailCapturePopup delayMs={1000} />);
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('email-capture-popup')).toBeTruthy();
  });

  it('delayMs=0 disables the timed fallback', () => {
    vi.useFakeTimers();
    render(<EmailCapturePopup delayMs={0} />);
    act(() => { vi.advanceTimersByTime(600_000); });
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it('does not open at all when disabled', () => {
    render(<EmailCapturePopup enabled={false} />);
    exitIntent();
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });
});

describe('shows at most once per browser', () => {
  it('does not reopen after the shopper dismisses it', async () => {
    const { unmount } = render(<EmailCapturePopup />);
    exitIntent();
    await waitFor(() => screen.getByTestId('email-capture-popup'));
    fireEvent.click(screen.getByTestId('email-capture-close'));
    await waitFor(() => expect(screen.queryByTestId('email-capture-popup')).toBeNull());

    // A second exit-intent in the same session must not bring it back.
    exitIntent();
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();

    // Nor a fresh page load.
    unmount();
    render(<EmailCapturePopup />);
    exitIntent();
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it('records the dismissal in localStorage', async () => {
    render(<EmailCapturePopup />);
    exitIntent();
    await waitFor(() => screen.getByTestId('email-capture-popup'));
    fireEvent.click(screen.getByTestId('email-capture-close'));
    expect(localStorage.getItem(CAPTURE_DISMISSED_KEY)).toBe('1');
  });

  it('never opens when the marker is already set', () => {
    localStorage.setItem(CAPTURE_DISMISSED_KEY, '1');
    render(<EmailCapturePopup />);
    exitIntent();
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it('the timer cannot reopen a popup that was already dismissed', () => {
    // Regression guard for reading `open` from a stale closure: the timed
    // fallback must respect a dismissal that happened before it fired.
    vi.useFakeTimers();
    render(<EmailCapturePopup delayMs={5000} />);
    exitIntent();
    fireEvent.click(screen.getByTestId('email-capture-close'));

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it('only one trigger wins - exit intent then timer opens it once', () => {
    vi.useFakeTimers();
    render(<EmailCapturePopup delayMs={1000} />);
    exitIntent();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getAllByTestId('email-capture-popup')).toHaveLength(1);
  });

  it('survives localStorage being unavailable', () => {
    // Private browsing throws on getItem/setItem. The popup should still work
    // rather than crashing the page it is mounted on.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => {
      render(<EmailCapturePopup />);
      exitIntent();
    }).not.toThrow();
    expect(screen.getByTestId('email-capture-popup')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('submission', () => {
  async function open() {
    render(<EmailCapturePopup />);
    exitIntent();
    await waitFor(() => screen.getByTestId('email-capture-popup'));
  }

  it('submits a valid address and confirms', async () => {
    await open();
    fireEvent.change(screen.getByTestId('email-capture-input'), {
      target: { value: 'shopper@example.com' },
    });
    fireEvent.click(screen.getByTestId('email-capture-submit'));

    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('shopper@example.com', 'exit_intent'));
    await waitFor(() => expect(screen.getByTestId('email-capture-success')).toBeTruthy());
  });

  it('reports the trigger that opened it', async () => {
    vi.useFakeTimers();
    render(<EmailCapturePopup delayMs={1000} />);
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.change(screen.getByTestId('email-capture-input'), {
      target: { value: 'timed@example.com' },
    });
    fireEvent.click(screen.getByTestId('email-capture-submit'));
    // Real timers again so the awaited promise can settle.
    vi.useRealTimers();
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('timed@example.com', 'timed'));
  });

  // The input is type="email", so the BROWSER refuses to submit some
  // malformed values before any handler runs ("nope", "a@", "a b@c.com").
  // Those are covered by the "never reaches the API" case below. The values
  // here are ones native validation lets through, where our own check is the
  // only thing standing between a shopper and a bad subscription.
  it.each([
    ['empty', ''],
    ['no TLD', 'a@b'],
  ])('rejects %s and shows an error', async (_label, value) => {
    await open();
    fireEvent.change(screen.getByTestId('email-capture-input'), { target: { value } });
    fireEvent.click(screen.getByTestId('email-capture-submit'));

    expect(screen.getByTestId('email-capture-error')).toBeTruthy();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it.each([
    ['no @', 'nope'],
    ['no domain', 'a@'],
    ['spaces', 'a b@c.com'],
  ])('never sends %s to the API', async (_label, value) => {
    // Blocked by native validation rather than by our handler - assert the
    // outcome that actually matters instead of the mechanism.
    await open();
    fireEvent.change(screen.getByTestId('email-capture-input'), { target: { value } });
    fireEvent.click(screen.getByTestId('email-capture-submit'));

    expect(mockCapture).not.toHaveBeenCalled();
    expect(screen.queryByTestId('email-capture-success')).toBeNull();
  });

  it('clears the error once the shopper starts fixing it', async () => {
    await open();
    // 'a@b' passes native type="email" validation but fails ours, so the
    // handler runs and sets the error state we want to observe clearing.
    fireEvent.change(screen.getByTestId('email-capture-input'), { target: { value: 'a@b' } });
    fireEvent.click(screen.getByTestId('email-capture-submit'));
    expect(screen.getByTestId('email-capture-error')).toBeTruthy();

    fireEvent.change(screen.getByTestId('email-capture-input'), { target: { value: 'good@x.com' } });
    expect(screen.queryByTestId('email-capture-error')).toBeNull();
  });

  it('shows an error and stays open when the API fails', async () => {
    // The shopper must be able to retry rather than being left with a dead
    // form or a popup that silently claims success.
    mockCapture.mockResolvedValue(false);
    await open();
    fireEvent.change(screen.getByTestId('email-capture-input'), {
      target: { value: 'fail@example.com' },
    });
    fireEvent.click(screen.getByTestId('email-capture-submit'));

    await waitFor(() => expect(screen.getByTestId('email-capture-error')).toBeTruthy());
    expect(screen.getByTestId('email-capture-popup')).toBeTruthy();
  });

  it('does not mark the browser done when the API fails', async () => {
    // Otherwise a transient outage permanently costs that subscriber.
    mockCapture.mockResolvedValue(false);
    await open();
    fireEvent.change(screen.getByTestId('email-capture-input'), {
      target: { value: 'fail@example.com' },
    });
    fireEvent.click(screen.getByTestId('email-capture-submit'));
    await waitFor(() => screen.getByTestId('email-capture-error'));

    expect(localStorage.getItem(CAPTURE_DISMISSED_KEY)).toBeNull();
  });

  it('ignores a double submit', async () => {
    let resolve!: (v: boolean) => void;
    mockCapture.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
    await open();
    fireEvent.change(screen.getByTestId('email-capture-input'), {
      target: { value: 'twice@example.com' },
    });
    fireEvent.click(screen.getByTestId('email-capture-submit'));
    fireEvent.click(screen.getByTestId('email-capture-submit'));

    expect(mockCapture).toHaveBeenCalledTimes(1);
    resolve(true);
  });
});

describe('accessibility and dismissal', () => {
  it('is a labelled modal dialog', async () => {
    render(<EmailCapturePopup />);
    exitIntent();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('email-capture-heading');
  });

  it('closes on Escape', async () => {
    render(<EmailCapturePopup />);
    exitIntent();
    await waitFor(() => screen.getByTestId('email-capture-popup'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('email-capture-popup')).toBeNull());
  });

  it('closes when the backdrop is clicked', async () => {
    render(<EmailCapturePopup />);
    exitIntent();
    const dialog = await screen.findByTestId('email-capture-popup');
    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByTestId('email-capture-popup')).toBeNull());
  });

  it('does NOT close when the panel itself is clicked', async () => {
    // Clicking the input or a label must not dismiss the form mid-typing.
    render(<EmailCapturePopup />);
    exitIntent();
    await screen.findByTestId('email-capture-popup');
    fireEvent.click(screen.getByTestId('email-capture-input'));
    expect(screen.getByTestId('email-capture-popup')).toBeTruthy();
  });

  it('renders the configured copy', async () => {
    render(<EmailCapturePopup heading="Custom heading" subheading="Custom sub" />);
    exitIntent();
    await screen.findByTestId('email-capture-popup');
    expect(screen.getByText('Custom heading')).toBeTruthy();
    expect(screen.getByText('Custom sub')).toBeTruthy();
  });
});


describe('route suppression', () => {
  it.each([
    ['/admin', '/admin'],
    ['an admin subpage', '/admin/products/123'],
    ['/checkout', '/checkout'],
    ['/cart', '/cart'],
  ])('never opens on %s', (_label, path) => {
    // A popup over the payment step costs a real order to win a newsletter
    // signup; over admin it just interrupts the operator's work.
    mockPath = path;
    render(<EmailCapturePopup />);
    exitIntent();
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });

  it.each([['/'], ['/products/widget'], ['/blog/post']])(
    'still opens on the storefront route %s',
    (path) => {
      mockPath = path;
      render(<EmailCapturePopup />);
      exitIntent();
      expect(screen.getByTestId('email-capture-popup')).toBeTruthy();
    },
  );

  it('does not consume the once-ever budget on a suppressed route', () => {
    // Visiting checkout must not silently burn the single showing, or the
    // shopper would never see it on any later page.
    mockPath = '/checkout';
    const { unmount } = render(<EmailCapturePopup />);
    exitIntent();
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
    unmount();

    mockPath = '/products/widget';
    render(<EmailCapturePopup />);
    exitIntent();
    expect(screen.getByTestId('email-capture-popup')).toBeTruthy();
  });

  it('does not fire the timer on a suppressed route', () => {
    vi.useFakeTimers();
    mockPath = '/admin';
    render(<EmailCapturePopup delayMs={1000} />);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByTestId('email-capture-popup')).toBeNull();
  });
});
