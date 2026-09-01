/**
 * Filter type shared between the URL encoder, the FilterSidebar, and
 * the products page. Kept separate from the API so the storefront
 * can build the same shape from the URL without importing anything
 * the server would have to type-check.
 */
export interface ProductFilter {
  page: number;
  limit: number;
  status?: 'active' | 'draft' | 'inactive' | 'archived';
  category: string[];
  type: ('physical' | 'digital')[];
  attr: Record<string, string[]>;
  inStock: boolean;
  onSale: boolean;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  // Typed-option filter (?optionValueId=...) - matches products
  // that have at least one variant with this OptionValue. The PDP
  // swatch picker can deep-link to a filtered list by pushing a
  // value here; the FilterSidebar can render a typed-option
  // section when facets include `typedOptions`.
  optionValueId: string[];
  sort:
    | 'newest'
    | 'oldest'
    | 'price_asc'
    | 'price_desc'
    | 'name_asc'
    | 'name_desc'
    | 'rating_desc'
    | 'popular'
    | 'relevance';
}
