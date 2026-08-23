'use client';

/**
 * FilterSidebar - the storefront's filter panel.
 *
 * Renders the checkboxes, range slider, and chip rail that back the
 * `/products` page. The component is fully controlled: the parent
 * owns the filter state and passes the current value plus an
 * `onChange` callback. The sidebar does not read or write the URL
 * itself; that's the page's job, which means the sidebar is easy
 * to drop into other layouts (e.g. a drawer on mobile).
 *
 * Two pieces of data are required:
 *   - `filter`:  the current ProductFilter (a subset is fine; missing
 *                fields are treated as "off")
 *   - `facets`:  the Facets object from GET /api/products/facets.
 *                The sidebar uses the counts next to each option to
 *                show how many products would match if the user
 *                toggled that option.
 *
 * The `formatPrice` helper is a small implementation that supports
 * the only two formats this store currently ships. If the store
 * ever supports per-locale pricing, swap this out for a proper
 * Intl.NumberFormat.
 */

import { useCallback, useMemo } from 'react';
import type { ProductFilter } from '@/lib/filterParams.types';

export interface FacetBucket<T> {
  value: T;
  count: number;
  selected: boolean;
}

export interface Facets {
  categories: FacetBucket<{ id: string; name: string; slug: string }>[];
  types: FacetBucket<'physical' | 'digital'>[];
  attributes: Record<string, { value: string; count: number; selected: boolean }[]>;
  priceRange: { min: number; max: number };
  inStock: { count: number; total: number };
  onSale: { count: number; total: number };
  rating: { min: number; max: number; buckets: { value: number; count: number }[] };
}

interface Props {
  filter: ProductFilter;
  facets: Facets | null;
  currencySymbol?: string;
  onChange: (next: ProductFilter) => void;
  onClear: () => void;
}

function formatPrice(value: number, symbol: string): string {
  if (!Number.isFinite(value)) return `${symbol}0`;
  return `${symbol}${value.toFixed(2)}`;
}

function toggleArrayValue<T>(arr: T[] | undefined, value: T): T[] {
  const set = new Set(arr || []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

export default function FilterSidebar({
  filter,
  facets,
  currencySymbol = '$',
  onChange,
  onClear,
}: Props) {
  // The local "draft" price range so the user can finish typing before
  // we push a new fetch. We commit on blur or after a short idle.
  // For simplicity here we commit immediately on each change - the
  // store's pagination will mask the noise of one product in flight.
  const minPrice = filter.minPrice ?? '';
  const maxPrice = filter.maxPrice ?? '';

  const handleCategoryToggle = useCallback(
    (slug: string) => {
      onChange({ ...filter, category: toggleArrayValue(filter.category, slug) });
    },
    [filter, onChange],
  );

  const handleTypeToggle = useCallback(
    (type: 'physical' | 'digital') => {
      onChange({ ...filter, type: toggleArrayValue(filter.type, type) });
    },
    [filter, onChange],
  );

  const handleAttrToggle = useCallback(
    (key: string, value: string) => {
      const next = { ...filter.attr };
      next[key] = toggleArrayValue(next[key], value);
      if (next[key].length === 0) delete next[key];
      onChange({ ...filter, attr: next });
    },
    [filter, onChange],
  );

  const handlePriceChange = useCallback(
    (field: 'minPrice' | 'maxPrice', raw: string) => {
      // Accept blanks and numbers. Anything non-numeric becomes "absent".
      const cleaned = raw.trim();
      const num = cleaned === '' ? undefined : Number(cleaned);
      const safe = num !== undefined && Number.isFinite(num) ? num : undefined;
      onChange({ ...filter, [field]: safe });
    },
    [filter, onChange],
  );

  const handleMinRating = useCallback(
    (raw: string) => {
      // Empty string means "any rating". Number('') === 0, so the
      // Number.isFinite check alone is not enough - explicitly clear.
      if (raw === '') {
        onChange({ ...filter, minRating: undefined });
        return;
      }
      const n = Number(raw);
      onChange({ ...filter, minRating: Number.isFinite(n) ? n : undefined });
    },
    [filter, onChange],
  );

  const hasAnySelection = useMemo(() => {
    return (
      (filter.category?.length ?? 0) > 0 ||
      (filter.type?.length ?? 0) > 0 ||
      Object.keys(filter.attr || {}).length > 0 ||
      filter.inStock ||
      filter.onSale ||
      filter.minRating !== undefined ||
      filter.minPrice !== undefined ||
      filter.maxPrice !== undefined
    );
  }, [filter]);

  return (
    <aside
      aria-label="Filters"
      style={{
        backgroundColor: 'var(--card-bg, #fff)',
        border: '1px solid var(--border, #e5e5e5)',
        borderRadius: '12px',
        padding: '20px',
        minWidth: 0,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Filters</h2>
        {hasAnySelection && (
          <button
            type="button"
            onClick={onClear}
            data-testid="filter-clear"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent, #2563eb)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Clear all
          </button>
        )}
      </header>

      {/* Categories */}
      {facets?.categories && facets.categories.length > 0 && (
        <FilterSection title="Category" testId="filter-section-category">
          {facets.categories.map((c) => (
            <FilterCheckbox
              key={c.value.slug}
              label={c.value.name}
              count={c.count}
              checked={filter.category.includes(c.value.slug)}
              disabled={c.count === 0 && !c.selected}
              onChange={() => handleCategoryToggle(c.value.slug)}
              testId={`filter-category-${c.value.slug}`}
            />
          ))}
        </FilterSection>
      )}

      {/* Type */}
      {facets?.types && facets.types.some((t) => t.count > 0) && (
        <FilterSection title="Type" testId="filter-section-type">
          {facets.types.map((t) => (
            <FilterCheckbox
              key={t.value}
              label={t.value === 'physical' ? 'Physical' : 'Digital'}
              count={t.count}
              checked={filter.type.includes(t.value)}
              disabled={t.count === 0 && !t.selected}
              onChange={() => handleTypeToggle(t.value)}
              testId={`filter-type-${t.value}`}
            />
          ))}
        </FilterSection>
      )}

      {/* Price */}
      {facets && facets.priceRange.max > 0 && (
        <FilterSection title="Price" testId="filter-section-price">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder={`${formatPrice(facets.priceRange.min, currencySymbol)}`}
              value={minPrice === '' ? '' : minPrice}
              onChange={(e) => handlePriceChange('minPrice', e.target.value)}
              data-testid="filter-price-min"
              aria-label="Minimum price"
              style={priceInputStyle}
            />
            <span style={{ color: 'var(--muted, #6b7280)' }}>–</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder={`${formatPrice(facets.priceRange.max, currencySymbol)}`}
              value={maxPrice === '' ? '' : maxPrice}
              onChange={(e) => handlePriceChange('maxPrice', e.target.value)}
              data-testid="filter-price-max"
              aria-label="Maximum price"
              style={priceInputStyle}
            />
          </div>
        </FilterSection>
      )}

      {/* Quick toggles */}
      <FilterSection title="" testId="filter-section-toggles">
        <FilterCheckbox
          label="In stock only"
          count={facets?.inStock.count ?? 0}
          checked={filter.inStock}
          onChange={() => onChange({ ...filter, inStock: !filter.inStock })}
          testId="filter-instock"
        />
        <FilterCheckbox
          label="On sale"
          count={facets?.onSale.count ?? 0}
          checked={filter.onSale}
          onChange={() => onChange({ ...filter, onSale: !filter.onSale })}
          testId="filter-onsale"
        />
      </FilterSection>

      {/* Min rating */}
      {facets && facets.rating.buckets.some((b) => b.count > 0) && (
        <FilterSection title="Minimum rating" testId="filter-section-rating">
          {[undefined, 4, 3, 2, 1].map((value) => {
            const label = value === undefined ? 'Any' : `${value}+ stars`;
            const bucket = value !== undefined ? facets.rating.buckets.find((b) => b.value === value) : null;
            const count = bucket?.count ?? facets.rating.buckets.reduce((a, b) => a + b.count, 0);
            return (
              <FilterRadio
                key={label}
                label={label}
                count={count}
                checked={filter.minRating === value}
                onChange={() => handleMinRating(value === undefined ? '' : String(value))}
                testId={`filter-rating-${value ?? 'any'}`}
              />
            );
          })}
        </FilterSection>
      )}

      {/* Attributes - dynamic, one section per key. */}
      {facets &&
        Object.entries(facets.attributes).map(([key, values]) => (
          <FilterSection title={key.charAt(0).toUpperCase() + key.slice(1)} key={key} testId={`filter-section-attr-${key}`}>
            {values.map((v) => (
              <FilterCheckbox
                key={`${key}-${v.value}`}
                label={v.value}
                count={v.count}
                checked={(filter.attr[key] || []).includes(v.value)}
                onChange={() => handleAttrToggle(key, v.value)}
                testId={`filter-attr-${key}-${v.value}`}
              />
            ))}
          </FilterSection>
        ))}
    </aside>
  );
}

const priceInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: '6px',
  fontSize: '13px',
  outline: 'none',
  backgroundColor: 'var(--card-bg, #fff)',
  color: 'var(--body-text, #111)',
};

function FilterSection({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  // `title=""` is the signal for "no header, just the children" used
  // for the quick toggles section.
  return (
    <section
      data-testid={testId}
      style={{
        borderTop: '1px solid var(--border, #e5e5e5)',
        paddingTop: title ? '14px' : '0',
        marginTop: title ? '14px' : '0',
      }}
    >
      {title && (
        <h3
          style={{
            fontSize: '13px',
            fontWeight: 700,
            margin: '0 0 10px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--body-text, #111)',
          }}
        >
          {title}
        </h3>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </section>
  );
}

function FilterCheckbox({
  label,
  count,
  checked,
  disabled,
  onChange,
  testId,
}: {
  label: string;
  count?: number;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  testId?: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--muted, #9a9a9a)' : 'var(--body-text, #111)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        data-testid={testId}
        style={{ accentColor: 'var(--brand, #111)' }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      {typeof count === 'number' && (
        <span style={{ color: 'var(--muted, #6b7280)', fontSize: '12px' }}>({count})</span>
      )}
    </label>
  );
}

function FilterRadio({
  label,
  count,
  checked,
  onChange,
  testId,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
  testId?: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        cursor: 'pointer',
        color: 'var(--body-text, #111)',
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        data-testid={testId}
        name="filter-min-rating"
        style={{ accentColor: 'var(--brand, #111)' }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      {typeof count === 'number' && (
        <span style={{ color: 'var(--muted, #6b7280)', fontSize: '12px' }}>({count})</span>
      )}
    </label>
  );
}
