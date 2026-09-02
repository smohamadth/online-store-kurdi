/**
 * Rich blog building blocks — table of contents, share row and the
 * end-of-post subscribe box.
 *
 * TableOfContents is the interesting one: it must derive its links from
 * the article's own rendered headings (both HTML-content and layout-block
 * posts render h2/h3 under .post-body), assign stable ids, hide itself for
 * short posts, and expose the copy-link affordance on ShareButtons.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TableOfContents from './TableOfContents';
import ShareButtons from '@/components/ShareButtons';
import BlogSubscribe from './BlogSubscribe';

describe('TableOfContents', () => {
  it('builds links from the article headings and assigns ids', () => {
    const { container } = render(
      <div>
        <div className="post-body">
          <h2>First section</h2>
          <p>text</p>
          <h2>Second section</h2>
          <h3>A sub point</h3>
        </div>
        <TableOfContents />
      </div>
    );
    const links = screen.getAllByRole('link');
    // h2 + h2 + h3 = 3 links (h3 indented but still linked).
    expect(links.length).toBe(3);
    const heading = container.querySelector('.post-body h2') as HTMLHeadingElement;
    expect(heading.id).toBe('first-section');
    expect(links[0].getAttribute('href')).toBe('#first-section');
    expect(screen.getAllByText('A sub point').length).toBeGreaterThan(0);
  });

  it('keeps duplicate headings unique', () => {
    render(
      <div>
        <div className="post-body">
          <h2>Repeat</h2>
          <h2>Repeat</h2>
        </div>
        <TableOfContents />
      </div>
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(2);
    const ids = links.map((l) => l.getAttribute('href'));
    expect(new Set(ids).size).toBe(2);
  });

  it('renders nothing for short articles (fewer than two headings)', () => {
    const { container } = render(
      <div>
        <div className="post-body">
          <h2>Only one</h2>
        </div>
        <TableOfContents />
      </div>
    );
    expect(container.querySelector('nav')).toBeNull();
  });

  it('scrolling to a heading is smooth and updates the URL hash', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal('history', { ...history, replaceState: vi.fn() });
    render(
      <div>
        <div className="post-body">
          <h2>Alpha</h2>
          <h2>Beta</h2>
        </div>
        <TableOfContents />
      </div>
    );
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const beta = within(toc).getByText('Beta');
    fireEvent.click(beta);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '#beta');
  });
});

describe('ShareButtons', () => {
  it('renders platform share links with the page URL', () => {
    render(<ShareButtons url="https://shop.example/blog/hello" title="Hello world" />);
    const x = screen.getByRole('link', { name: 'Share on X' });
    expect(x.getAttribute('href')).toContain('twitter.com/intent/tweet');
    expect(x.getAttribute('href')).toContain(encodeURIComponent('https://shop.example/blog/hello'));
    expect(screen.getByRole('link', { name: 'Share on Facebook' }).getAttribute('href')).toContain(
      'facebook.com/sharer'
    );
    expect(screen.getByRole('link', { name: 'Share on WhatsApp' }).getAttribute('href')).toContain('wa.me');
    expect(screen.getByRole('link', { name: 'Share on Telegram' }).getAttribute('href')).toContain('t.me/share');
  });

  it('copies the URL to the clipboard and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ShareButtons url="https://shop.example/blog/hello" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://shop.example/blog/hello'));
    expect(await screen.findByText('✓ Copied')).toBeTruthy();
  });
});

describe('BlogSubscribe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the email and shows the success message', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Check your inbox!' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<BlogSubscribe />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByText(/Check your inbox!/)).toBeTruthy();
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toContain('/newsletter/subscribe');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'reader@example.com' });
  });

  it('surfaces the server error message', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Already subscribed.' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<BlogSubscribe />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Already subscribed.')).toBeTruthy();
  });
});
