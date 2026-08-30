/**
 * FilterSidebar.
 *
 * The sidebar is fully controlled (parent owns the filter state), so
 * the test strategy is: render with a known filter + facets, drive
 * user interactions, and assert that onChange was called with the
 * right next state. The actual URL / API logic is tested separately
 * in filterParams.test.ts.
 *
 * Behaviors pinned:
 *   - Each checkbox/radio toggles the matching dimension.
 *   - Toggling a category that's already selected removes it.
 *   - Multi-value dimensions (attribute keys) accumulate values.
 *   - The Clear all button appears only when something is selected.
 *   - Empty filter state hides the Clear button.
 *   - Facet counts render next to each option.
 *   - Sections with no items are not rendered.
 *   - Currency symbol appears in the price placeholders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FilterSidebar, { type Facets } from '@/components/FilterSidebar';
import { EMPTY_FILTER } from '@/lib/filterParams';
import type { ProductFilter } from '@/lib/filterParams.types';

const sampleFacets: Facets = {
  categories: [
    { value: { id: 'c1', name: 'Clothing', slug: 'clothing' }, count: 12, selected: false },
    { value: { id: 'c2', name: 'Books', slug: 'books' }, count: 4, selected: false },
  ],
  types: [
    { value: 'physical', count: 14, selected: false },
    { value: 'digital', count: 2, selected: false },
  ],
  attributes: {
    size: [
      { value: 'M', count: 5, selected: false },
      { value: 'L', count: 6, selected: false },
    ],
    color: [{ value: 'red', count: 3, selected: false }],
  },
  typedOptions: [
    {
      id: 'opt-color',
      name: 'Color',
      values: [
        { id: 'ov-red', value: 'Red', swatch: '#f00', count: 4, selected: false },
        { id: 'ov-blue', value: 'Blue', swatch: '#00f', count: 2, selected: false },
      ],
    },
    {
      id: 'opt-size',
      name: 'Size',
      values: [
        { id: 'ov-s', value: 'Small', swatch: null, count: 3, selected: false },
        { id: 'ov-l', value: 'Large', swatch: null, count: 5, selected: false },
      ],
    },
  ],
  priceRange: { min: 5, max: 200 },
  inStock: { count: 10, total: 16 },
  onSale: { count: 3, total: 16 },
  rating: {
    min: 1,
    max: 5,
    buckets: [
      { value: 1, count: 1 },
      { value: 2, count: 2 },
      { value: 3, count: 3 },
      { value: 4, count: 4 },
      { value: 5, count: 5 },
    ],
  },
};

function renderSidebar(
  filter: ProductFilter = EMPTY_FILTER,
  facets: Facets | null = sampleFacets,
  props: Partial<{ currencySymbol: string; onChange: ReturnType<typeof vi.fn>; onClear: ReturnType<typeof vi.fn> }> = {},
) {
  const onChange = props.onChange ?? vi.fn();
  const onClear = props.onClear ?? vi.fn();
  const result = render(
    <FilterSidebar
      filter={filter}
      facets={facets}
      currencySymbol={props.currencySymbol ?? '$'}
      onChange={onChange}
      onClear={onClear}
    />,
  );
  return { ...result, onChange, onClear };
}

beforeEach(() => {
  localStorage.clear();
});

describe('FilterSidebar - structure', () => {
  it('renders the heading', () => {
    renderSidebar();
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
  });

  it('renders a section per facet dimension with data-testid', () => {
    renderSidebar();
    expect(screen.getByTestId('filter-section-category')).toBeInTheDocument();
    expect(screen.getByTestId('filter-section-type')).toBeInTheDocument();
    expect(screen.getByTestId('filter-section-price')).toBeInTheDocument();
    expect(screen.getByTestId('filter-section-toggles')).toBeInTheDocument();
    expect(screen.getByTestId('filter-section-rating')).toBeInTheDocument();
    expect(screen.getByTestId('filter-section-attr-size')).toBeInTheDocument();
    expect(screen.getByTestId('filter-section-attr-color')).toBeInTheDocument();
  });

  it('omits sections when facets are missing', () => {
    renderSidebar(EMPTY_FILTER, null);
    // No data, no sections beyond the always-present toggles.
    expect(screen.queryByTestId('filter-section-category')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-section-price')).not.toBeInTheDocument();
  });

  it('omits the price section when max is 0', () => {
    renderSidebar(EMPTY_FILTER, { ...sampleFacets, priceRange: { min: 0, max: 0 } });
    expect(screen.queryByTestId('filter-section-price')).not.toBeInTheDocument();
  });

  it('omits the rating section when no buckets have counts', () => {
    const facets: Facets = {
      ...sampleFacets,
      rating: {
        min: 0,
        max: 0,
        buckets: [
          { value: 1, count: 0 },
          { value: 2, count: 0 },
          { value: 3, count: 0 },
          { value: 4, count: 0 },
          { value: 5, count: 0 },
        ],
      },
    };
    renderSidebar(EMPTY_FILTER, facets);
    expect(screen.queryByTestId('filter-section-rating')).not.toBeInTheDocument();
  });

  it('omits the type section when both types have count 0', () => {
    const facets: Facets = {
      ...sampleFacets,
      types: [
        { value: 'physical', count: 0, selected: false },
        { value: 'digital', count: 0, selected: false },
      ],
    };
    renderSidebar(EMPTY_FILTER, facets);
    expect(screen.queryByTestId('filter-section-type')).not.toBeInTheDocument();
  });
});

describe('FilterSidebar - facets rendering', () => {
  it('renders each category with its name and count', () => {
    renderSidebar();
    expect(screen.getByTestId('filter-category-clothing')).toBeInTheDocument();
    expect(screen.getByText('Clothing')).toBeInTheDocument();
    // The "(12)" string also appears next to the rating-4 count, so we
    // look only at the row containing "Clothing" to disambiguate.
    expect(screen.getByTestId('filter-category-clothing').parentElement!.textContent).toContain('(12)');
    // The "(4)" is shared with the 4-star rating bucket; we look it
    // up by category testid instead.
    expect(screen.getByTestId('filter-category-books').parentElement!.textContent).toContain('(4)');
  });

  it('renders attribute options with their keys', () => {
    renderSidebar();
    expect(screen.getByTestId('filter-attr-size-M')).toBeInTheDocument();
    expect(screen.getByTestId('filter-attr-color-red')).toBeInTheDocument();
    // (5) is the count of size M variants. Scoped to the attr row so
    // it doesn't collide with the typed-option facet count of 5.
    const row = screen.getByTestId('filter-attr-size-M').parentElement!;
    expect(row.textContent).toContain('(5)');
  });

  it('uses the currency symbol in the price placeholders', () => {
    renderSidebar(EMPTY_FILTER, sampleFacets, { currencySymbol: '€' });
    const min = screen.getByTestId('filter-price-min') as HTMLInputElement;
    const max = screen.getByTestId('filter-price-max') as HTMLInputElement;
    expect(min.placeholder).toBe('€5.00');
    expect(max.placeholder).toBe('€200.00');
  });

  it('disables a category that has 0 count and is not selected', () => {
    const facets: Facets = {
      ...sampleFacets,
      categories: [
        { value: { id: 'c1', name: 'Empty', slug: 'empty' }, count: 0, selected: false },
        { value: { id: 'c2', name: 'Has', slug: 'has' }, count: 5, selected: false },
      ],
    };
    renderSidebar(EMPTY_FILTER, facets);
    const empty = screen.getByTestId('filter-category-empty') as HTMLInputElement;
    const has = screen.getByTestId('filter-category-has') as HTMLInputElement;
    expect(empty.disabled).toBe(true);
    expect(has.disabled).toBe(false);
  });
});

describe('FilterSidebar - interactions', () => {
  it('toggling a category checkbox calls onChange with the new array', () => {
    const { onChange } = renderSidebar();
    act(() => {
      fireEvent.click(screen.getByTestId('filter-category-clothing'));
    });
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTER,
      category: ['clothing'],
    });
  });

  it('toggling a selected category removes it', () => {
    const { onChange } = renderSidebar({ ...EMPTY_FILTER, category: ['clothing'] });
    act(() => {
      fireEvent.click(screen.getByTestId('filter-category-clothing'));
    });
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTER,
      category: [],
    });
  });

  it('toggling a type checkbox calls onChange with the new type list', () => {
    const { onChange } = renderSidebar();
    act(() => {
      fireEvent.click(screen.getByTestId('filter-type-digital'));
    });
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTER,
      type: ['digital'],
    });
  });

  it('toggling an attribute value adds it to the right key', () => {
    const { onChange } = renderSidebar();
    act(() => {
      fireEvent.click(screen.getByTestId('filter-attr-size-M'));
    });
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTER,
      attr: { size: ['M'] },
    });
  });

  it('toggling two values of the same attribute accumulates them', () => {
    let filter: ProductFilter = EMPTY_FILTER;
    const onChange = vi.fn((next: ProductFilter) => {
      filter = next;
    });
    const { rerender } = render(
      <FilterSidebar
        filter={filter}
        facets={sampleFacets}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('filter-attr-size-M'));
    });
    rerender(
      <FilterSidebar
        filter={filter}
        facets={sampleFacets}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('filter-attr-size-L'));
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTER,
      attr: { size: ['M', 'L'] },
    });
  });

  it('toggling the only value of an attribute removes the key', () => {
    const { onChange } = renderSidebar({ ...EMPTY_FILTER, attr: { size: ['M'] } });
    act(() => {
      fireEvent.click(screen.getByTestId('filter-attr-size-M'));
    });
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTER,
      attr: {},
    });
  });

  it('inStock checkbox toggles the boolean', () => {
    const { onChange } = renderSidebar();
    act(() => {
      fireEvent.click(screen.getByTestId('filter-instock'));
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, inStock: true });
  });

  it('onSale checkbox toggles the boolean', () => {
    const { onChange } = renderSidebar({ ...EMPTY_FILTER, onSale: true });
    act(() => {
      fireEvent.click(screen.getByTestId('filter-onsale'));
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, onSale: false });
  });

  it('price min input parses a valid number', () => {
    const { onChange } = renderSidebar();
    act(() => {
      fireEvent.change(screen.getByTestId('filter-price-min'), { target: { value: '15' } });
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, minPrice: 15 });
  });

  it('price min input with empty value sets minPrice to undefined', () => {
    const { onChange } = renderSidebar({ ...EMPTY_FILTER, minPrice: 15 });
    act(() => {
      fireEvent.change(screen.getByTestId('filter-price-min'), { target: { value: '' } });
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, minPrice: undefined });
  });

  it('price min input with non-numeric text falls back to undefined', () => {
    const { onChange } = renderSidebar({ ...EMPTY_FILTER, minPrice: 10 });
    act(() => {
      fireEvent.change(screen.getByTestId('filter-price-min'), { target: { value: 'abc' } });
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, minPrice: undefined });
  });

  it('rating radio buttons set minRating', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    let filter: ProductFilter = EMPTY_FILTER;
    const onChange = vi.fn((next: ProductFilter) => {
      filter = next;
    });
    const { rerender } = render(
      <FilterSidebar
        filter={filter}
        facets={sampleFacets}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('filter-rating-4'));
    rerender(
      <FilterSidebar
        filter={filter}
        facets={sampleFacets}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, minRating: 4 });

    await user.click(screen.getByTestId('filter-rating-any'));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, minRating: undefined });
  });
});

describe('FilterSidebar - Clear all', () => {
  it('hides the Clear button when no filter is set', () => {
    renderSidebar(EMPTY_FILTER);
    expect(screen.queryByTestId('filter-clear')).not.toBeInTheDocument();
  });

  it('shows the Clear button when a category is set', () => {
    renderSidebar({ ...EMPTY_FILTER, category: ['clothing'] });
    expect(screen.getByTestId('filter-clear')).toBeInTheDocument();
  });

  it('shows the Clear button when inStock is set', () => {
    renderSidebar({ ...EMPTY_FILTER, inStock: true });
    expect(screen.getByTestId('filter-clear')).toBeInTheDocument();
  });

  it('shows the Clear button when a price is set', () => {
    renderSidebar({ ...EMPTY_FILTER, minPrice: 10 });
    expect(screen.getByTestId('filter-clear')).toBeInTheDocument();
  });

  it('clicking Clear calls onClear', () => {
    const { onClear } = renderSidebar({ ...EMPTY_FILTER, category: ['x'] });
    act(() => {
      screen.getByTestId('filter-clear').click();
    });
    expect(onClear).toHaveBeenCalled();
  });
});

describe('FilterSidebar - initial checked state', () => {
  it('marks already-selected categories as checked', () => {
    renderSidebar({ ...EMPTY_FILTER, category: ['clothing'] });
    const input = screen.getByTestId('filter-category-clothing') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('marks already-selected attribute values as checked', () => {
    renderSidebar({ ...EMPTY_FILTER, attr: { size: ['M'] } });
    const input = screen.getByTestId('filter-attr-size-M') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('marks the matching rating radio as checked', () => {
    renderSidebar({ ...EMPTY_FILTER, minRating: 4 });
    const radio = screen.getByTestId('filter-rating-4') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });
});

describe('FilterSidebar - typed options', () => {
  it('renders a section per option, with one chip per value', () => {
    renderSidebar();
    // Two options -> two sections, with the option id in the testid.
    expect(screen.getByTestId('filter-section-option-opt-color')).toBeTruthy();
    expect(screen.getByTestId('filter-section-option-opt-size')).toBeTruthy();
    // Four value checkboxes (two per option).
    expect(screen.getByTestId('filter-option-opt-color-ov-red')).toBeTruthy();
    expect(screen.getByTestId('filter-option-opt-color-ov-blue')).toBeTruthy();
    expect(screen.getByTestId('filter-option-opt-size-ov-s')).toBeTruthy();
    expect(screen.getByTestId('filter-option-opt-size-ov-l')).toBeTruthy();
  });

  it('toggling an option value adds it to optionValueId', () => {
    const { onChange } = renderSidebar();
    act(() => {
      fireEvent.click(screen.getByTestId('filter-option-opt-color-ov-red'));
    });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls.at(-1)?.[0] as ProductFilter;
    expect(arg.optionValueId).toEqual(['ov-red']);
  });

  it('toggling a selected option value removes it', () => {
    const { onChange } = renderSidebar({ ...EMPTY_FILTER, optionValueId: ['ov-red'] });
    act(() => {
      fireEvent.click(screen.getByTestId('filter-option-opt-color-ov-red'));
    });
    const arg = onChange.mock.calls.at(-1)?.[0] as ProductFilter;
    expect(arg.optionValueId).toEqual([]);
  });

  it('marks already-selected option values as checked', () => {
    renderSidebar({ ...EMPTY_FILTER, optionValueId: ['ov-blue'] });
    const input = screen.getByTestId('filter-option-opt-color-ov-blue') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('does not render the typed option sections when facets omit them', () => {
    const facets: Facets = { ...sampleFacets };
    delete (facets as any).typedOptions;
    renderSidebar(EMPTY_FILTER, facets);
    expect(screen.queryByTestId('filter-section-option-opt-color')).toBeNull();
  });
});
