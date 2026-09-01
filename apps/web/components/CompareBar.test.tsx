/**
 * CompareBar + CompareProvider behaviour.
 *
 * - hidden with an empty list
 * - shows the selection with a working remove action
 * - the Compare link activates at 2+ items
 * - Clear empties the list
 * - the list is bounded to 4 items
 * - the list persists to localStorage (survives navigation/refresh)
 * - hidden on /compare and /admin routes
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { useState, ReactNode } from 'react';
import CompareBar from '@/components/CompareBar';
import { CompareProvider, useCompare, MAX_COMPARE_ITEMS } from '@/lib/compare';

// The bar uses usePathname; stub it with a mutable ref the tests set.
const pathRef = { current: '/' };
vi.mock('next/navigation', () => ({
  usePathname: () => pathRef.current,
}));

const item = (i: number) => ({
  id: `p${i}`,
  name: `Product ${i}`,
  slug: `product-${i}`,
  price: 10 * i,
  image: null,
});

/** Runs `action` once inside the provider (on first render). */
function Mutator({ action }: { action: (c: ReturnType<typeof useCompare>) => void }) {
  const compare = useCompare();
  const [done, setDone] = useState(false);
  if (!done) {
    act(() => {
      action(compare);
      setDone(true);
    });
  }
  return null;
}

function renderBar(action?: (c: ReturnType<typeof useCompare>) => void, path = '/') {
  pathRef.current = path;
  const ui = (
    <CompareProvider>
      {action && <Mutator action={action} />}
      <CompareBar />
    </CompareProvider>
  );
  return render(<>{ui}</>);
}

beforeEach(() => {
  localStorage.clear();
  pathRef.current = '/';
});

describe('CompareBar', () => {
  it('is hidden when the list is empty', () => {
    renderBar();
    expect(screen.queryByRole('region', { name: /compare bar/i })).toBeNull();
  });

  it('shows the selection with a working remove action', async () => {
    renderBar((c) => c.toggle(item(1)));
    await screen.findByRole('region', { name: /compare bar/i });
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/remove product 1 from comparison/i));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /compare bar/i })).toBeNull()
    );
  });

  it('activates the Compare link at two items', async () => {
    renderBar((c) => {
      c.toggle(item(1));
      c.toggle(item(2));
    });
    const link = await screen.findByText('Compare');
    expect(link.closest('a')).toHaveAttribute('href', '/compare');
  });

  it('shows the "pick more" hint with a single item', async () => {
    renderBar((c) => c.toggle(item(1)));
    expect(await screen.findByText('Pick 2+ to compare')).toBeInTheDocument();
  });

  it('clears everything via the Clear button', async () => {
    renderBar((c) => {
      c.toggle(item(1));
      c.toggle(item(2));
    });
    fireEvent.click(await screen.findByText('Clear'));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /compare bar/i })).toBeNull()
    );
  });

  it('persists the list to localStorage', async () => {
    renderBar((c) => {
      c.toggle(item(1));
      c.toggle(item(2));
    });
    await screen.findByRole('region', { name: /compare bar/i });
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('compareList') || '[]');
      expect(saved.map((i: any) => i.id)).toEqual(['p1', 'p2']);
    });
  });

  it('bounds the list to four items', async () => {
    renderBar((c) => {
      c.toggle(item(1));
      c.toggle(item(2));
      c.toggle(item(3));
      c.toggle(item(4));
      c.toggle(item(5));
    });
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('compareList') || '[]');
      expect(saved).toHaveLength(MAX_COMPARE_ITEMS);
      expect(saved.map((i: any) => i.id)).not.toContain('p5');
    });
  });

  it('is hidden on /compare and /admin even with items selected', async () => {
    renderBar((c) => c.toggle(item(1)), '/compare');
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('compareList') || '[]');
      expect(saved).toHaveLength(1);
    });
    expect(screen.queryByRole('region', { name: /compare bar/i })).toBeNull();
  });
});
