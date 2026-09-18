import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { useDesignNavigationGuard } from './useDesignNavigationGuard';

const message = 'Discard unsaved design edits and leave this page?';
function Editor({ dirty = true, onNavigate = vi.fn() }: { dirty?: boolean; onNavigate?: () => void }) {
  useDesignNavigationGuard(dirty, message);
  return <>
    <a href="/admin/products" onClick={(event) => { event.preventDefault(); onNavigate(); }}>Sidebar link</a>
    <a href="/preview/default" target="_blank" onClick={(event) => event.preventDefault()}>Preview</a>
    <a href="#fields" onClick={(event) => event.preventDefault()}>Same document</a>
    <a href="/archive.zip" download onClick={(event) => event.preventDefault()}>Download</a>
  </>;
}
const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/appearance');
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});

describe('design draft navigation protection', () => {
  it('blocks a cancelled sidebar navigation before the Next Link handler can run', () => {
    const navigate = vi.fn();
    render(<Editor onNavigate={navigate} />);
    fireEvent.click(screen.getByText('Sidebar link'));
    expect(window.confirm).toHaveBeenCalledWith(message);
    expect(navigate).not.toHaveBeenCalled();
    expect(unload()).toBe(true);
  });

  it('lets an approved navigation proceed without a duplicate native prompt', () => {
    vi.useFakeTimers();
    vi.mocked(window.confirm).mockReturnValue(true);
    const navigate = vi.fn();
    render(<Editor onNavigate={navigate} />);
    fireEvent.click(screen.getByText('Sidebar link'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(unload()).toBe(false);
    act(() => { vi.advanceTimersByTime(1001); });
    expect(unload()).toBe(true);
  });

  it('cleans up after saving/discarding and after unmount', () => {
    const { rerender, unmount } = render(<Editor />);
    expect(unload()).toBe(true);
    rerender(<Editor dirty={false} />);
    fireEvent.click(screen.getByText('Sidebar link'));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(unload()).toBe(false);
    rerender(<Editor />);
    unmount();
    expect(unload()).toBe(false);
  });

  it('does not interrupt new tabs, downloads, hash links, or modifier clicks', () => {
    render(<Editor />);
    fireEvent.click(screen.getByText('Preview'));
    fireEvent.click(screen.getByText('Same document'));
    fireEvent.click(screen.getByText('Download'));
    fireEvent.click(screen.getByText('Sidebar link'), { ctrlKey: true });
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
