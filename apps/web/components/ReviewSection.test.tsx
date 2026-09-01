/**
 * ReviewSection — verified-purchaser badge and photo gallery.
 *
 * The existing component (no test before this commit) handled
 * rating + text. The recent revision added:
 *   - "Verified Purchaser" badge driven by `review.isVerified`.
 *   - Photo gallery rendered per review.
 *   - Photo lightbox with prev/next + close.
 *   - A photo-uploader in the write-a-review form.
 *
 * These tests pin the new behaviour so a future refactor
 * can't quietly break the trust signal or the lightbox.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReviewSection from './ReviewSection';

// vi.hoisted so the mock factory (which runs before module
// imports) can share state with the test body.
const hoisted = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {},
}));

vi.mock('@/lib/http', () => ({
  API_BASE: 'http://api.local/api',
}));

beforeEach(() => {
  localStorage.clear();
  hoisted.fetchMock.mockReset();
  // Default: no reviews, no upload, no user.
  hoisted.fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/reviews')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ data: [] }),
      });
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ data: null }),
    });
  });
  globalThis.fetch = hoisted.fetchMock as any;
});

const verifiedReview = {
  id: 'r-1',
  userId: 'u-1',
  productId: 'p-1',
  rating: 5,
  title: 'Great',
  comment: 'I loved it',
  isVerified: true,
  isApproved: true,
  photos: [
    { id: 'ph-1', reviewId: 'r-1', url: 'https://cdn/a.jpg', thumbnail: 'https://cdn/a-thumb.jpg', sortOrder: 0, createdAt: '2026-01-01' },
    { id: 'ph-2', reviewId: 'r-1', url: 'https://cdn/b.jpg', thumbnail: 'https://cdn/b-thumb.jpg', sortOrder: 1, createdAt: '2026-01-01' },
  ],
  createdAt: '2026-01-15T10:00:00Z',
  user: { id: 'u-1', firstName: 'Alice', lastName: 'Wonder' },
};

const unverifiedReview = {
  ...verifiedReview,
  id: 'r-2',
  userId: 'u-2',
  isVerified: false,
  photos: [],
  user: { id: 'u-2', firstName: 'Bob', lastName: 'B' },
};

function mockReviewsFetch(reviews: any[]) {
  hoisted.fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/products/') && url.includes('/reviews')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ data: reviews }),
      });
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ data: null }),
    });
  });
}

describe('ReviewSection: verified-purchaser badge', () => {
  it('renders the "Verified Purchaser" badge when isVerified is true', async () => {
    mockReviewsFetch([verifiedReview]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getAllByTestId('verified-purchaser-badge')).toHaveLength(1));
    expect(screen.getByTestId('verified-purchaser-badge').textContent).toContain('Verified Purchaser');
  });

  it('does NOT render the badge when isVerified is false', async () => {
    mockReviewsFetch([unverifiedReview]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getAllByTestId('review-card')).toHaveLength(1));
    expect(screen.queryByTestId('verified-purchaser-badge')).toBeNull();
  });

  it('shows the badge once per verified review', async () => {
    mockReviewsFetch([verifiedReview, { ...unverifiedReview, isVerified: true, id: 'r-3', userId: 'u-3' }]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getAllByTestId('review-card')).toHaveLength(2));
    expect(screen.getAllByTestId('verified-purchaser-badge')).toHaveLength(2);
  });
});

describe('ReviewSection: photo gallery', () => {
  it('renders one thumbnail per photo in the review', async () => {
    mockReviewsFetch([verifiedReview]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getByTestId('review-photos')).toBeTruthy());
    expect(screen.getByTestId('review-photo-0')).toBeTruthy();
    expect(screen.getByTestId('review-photo-1')).toBeTruthy();
  });

  it('does not render the photo grid when the review has no photos', async () => {
    mockReviewsFetch([unverifiedReview]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getAllByTestId('review-card')).toHaveLength(1));
    expect(screen.queryByTestId('review-photos')).toBeNull();
  });

  it('opens the lightbox when a photo thumbnail is clicked', async () => {
    mockReviewsFetch([verifiedReview]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getByTestId('review-photo-0')).toBeTruthy());
    fireEvent.click(screen.getByTestId('review-photo-0'));
    expect(screen.getByTestId('review-lightbox')).toBeTruthy();
    expect(screen.getByTestId('review-lightbox-image')).toBeTruthy();
  });

  it('closes the lightbox when the close button is clicked', async () => {
    mockReviewsFetch([verifiedReview]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getByTestId('review-photo-0')).toBeTruthy());
    fireEvent.click(screen.getByTestId('review-photo-0'));
    fireEvent.click(screen.getByTestId('review-lightbox-close'));
    expect(screen.queryByTestId('review-lightbox')).toBeNull();
  });

  it('cycles through photos with the prev/next buttons', async () => {
    mockReviewsFetch([verifiedReview]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    await waitFor(() => expect(screen.getByTestId('review-photo-0')).toBeTruthy());
    fireEvent.click(screen.getByTestId('review-photo-0'));
    // The lightbox shows the counter "1 / 2" first.
    expect(screen.getByTestId('review-lightbox-counter').textContent).toBe('1 / 2');
    fireEvent.click(screen.getByTestId('review-lightbox-next'));
    expect(screen.getByTestId('review-lightbox-counter').textContent).toBe('2 / 2');
    fireEvent.click(screen.getByTestId('review-lightbox-prev'));
    expect(screen.getByTestId('review-lightbox-counter').textContent).toBe('1 / 2');
  });
});

describe('ReviewSection: photo uploader in the form', () => {
  function renderFormSignedIn() {
    localStorage.setItem('user', JSON.stringify({ id: 'me', firstName: 'Me', lastName: 'M' }));
    localStorage.setItem('token', 'tkn');
    mockReviewsFetch([]);
    render(<ReviewSection productId="p-1" productName="Widget" />);
    // The "Write a Review" button only renders after the
    // component finishes the loading + checkUser useEffects.
    return screen.findByRole('button', { name: /write a review/i });
  }

  it('shows the "Add photos" button only when the form is open', async () => {
    await renderFormSignedIn();
    // Form isn't visible by default.
    expect(screen.queryByTestId('review-photo-button')).toBeNull();
    // Open the form.
    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    await waitFor(() => expect(screen.getByTestId('review-photo-button')).toBeTruthy());
  });

  it('previews files the user picks and removes them on the X', async () => {
    await renderFormSignedIn();
    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    await waitFor(() => expect(screen.getByTestId('review-photo-input')).toBeTruthy());

    // Simulate the user picking two files. happy-dom's
    // File constructor works for this; the React onChange
    // receives a FileList with our entries.
    const file1 = new File(['x'], 'a.png', { type: 'image/png' });
    const file2 = new File(['y'], 'b.png', { type: 'image/png' });
    const input = screen.getByTestId('review-photo-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file1, file2] });
    fireEvent.change(input);
    await waitFor(() => expect(screen.getByTestId('review-photo-previews')).toBeTruthy());
    expect(screen.getByTestId('review-photo-previews').children.length).toBe(2);

    fireEvent.click(screen.getByTestId('remove-photo-0'));
    expect(screen.getByTestId('review-photo-previews').children.length).toBe(1);
  });

  it('rejects too many files at the cap (5)', async () => {
    await renderFormSignedIn();
    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    await waitFor(() => expect(screen.getByTestId('review-photo-input')).toBeTruthy());
    const files = Array.from({ length: 6 }, (_, i) => new File(['x'], `${i}.png`, { type: 'image/png' }));
    const input = screen.getByTestId('review-photo-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files });
    fireEvent.change(input);
    // Only 5 previews are kept; the 6th is rejected with a
    // banner.
    await waitFor(() => {
      const previews = screen.getByTestId('review-photo-previews');
      expect(previews.children.length).toBe(5);
    });
    expect(screen.getByTestId('review-form-message').textContent).toContain('at most 5');
  });

  it('rejects an unsupported MIME type with a banner', async () => {
    await renderFormSignedIn();
    fireEvent.click(screen.getByRole('button', { name: /write a review/i }));
    await waitFor(() => expect(screen.getByTestId('review-photo-input')).toBeTruthy());
    const bad = new File(['x'], 'virus.exe', { type: 'application/octet-stream' });
    const input = screen.getByTestId('review-photo-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [bad] });
    fireEvent.change(input);
    await waitFor(() =>
      expect(screen.getByTestId('review-form-message').textContent).toMatch(/not a supported image/),
    );
  });
});
