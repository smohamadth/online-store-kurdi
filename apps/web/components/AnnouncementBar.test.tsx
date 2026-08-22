/**
 * AnnouncementBar.
 *
 * - Returns null on admin routes.
 * - Returns null when the admin disabled the announcement.
 * - Returns null when announcementText is empty/whitespace.
 * - Renders a plain <span> when there is text but no link.
 * - Renders a <Link> with the destination when there is a link.
 * - Uses the theme's announcementBg + announcementText2 colours.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnnouncementBar from '@/components/AnnouncementBar';
import { setNextRouter } from '@/test/setup-components';
import { DEFAULT_THEME } from '@/lib/theme';

// The component calls useTheme() which kicks off a fetch. The default
// fetch stub in setup-components returns 404, so the provider ends up
// with DEFAULT_THEME (the shipped defaults). Override useTheme to
// inject custom theme values without involving the network.
vi.mock('@/lib/theme', async () => {
  const actual = await vi.importActual<any>('@/lib/theme');
  return {
    ...actual,
    useTheme: () => ({
      theme: (globalThis as any).__testTheme || actual.DEFAULT_THEME,
      loading: false,
      reload: () => {},
    }),
  };
});

function withTheme(theme: Record<string, any>) {
  (globalThis as any).__testTheme = { ...DEFAULT_THEME, ...theme };
}

beforeEach(() => {
  delete (globalThis as any).__testTheme;
  setNextRouter({ pathname: '/' });
});

describe('AnnouncementBar', () => {
  it('renders nothing on admin routes', () => {
    setNextRouter({ pathname: '/admin/dashboard' });
    withTheme({ showAnnouncement: true, announcementText: 'Hi' });
    const { container } = render(<AnnouncementBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when showAnnouncement is false', () => {
    withTheme({ showAnnouncement: false, announcementText: 'Hi' });
    const { container } = render(<AnnouncementBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when announcementText is empty/whitespace', () => {
    withTheme({ showAnnouncement: true, announcementText: '   ' });
    const { container } = render(<AnnouncementBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the text inside a <span> when no link is set', () => {
    withTheme({ showAnnouncement: true, announcementText: 'Free shipping today!', announcementLink: null });
    render(<AnnouncementBar />);
    const text = screen.getByText('Free shipping today!');
    expect(text.tagName).toBe('SPAN');
    // The arrow suffix should NOT be present.
    expect(screen.queryByText('→')).not.toBeInTheDocument();
  });

  it('renders a link with the destination when announcementLink is set', () => {
    withTheme({
      showAnnouncement: true,
      announcementText: 'Visit the sale',
      announcementLink: '/deals',
    });
    render(<AnnouncementBar />);
    const link = screen.getByRole('link', { name: /Visit the sale/ });
    expect(link).toHaveAttribute('href', '/deals');
  });

  it('applies the theme colours to the bar', () => {
    withTheme({
      showAnnouncement: true,
      announcementText: 'Hi',
      announcementBg: '#123456',
      announcementText2: '#abcdef',
    });
    const { container } = render(<AnnouncementBar />);
    const bar = container.firstChild as HTMLElement;
    const style = bar.getAttribute('style') || '';
    expect(style).toContain('background-color: #123456');
    expect(style).toContain('color: #abcdef');
  });
});
