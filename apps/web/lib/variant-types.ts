/**
 * Type definitions for the variant + option data the storefront
 * consumes. These mirror the API response shape (the Option
 * tree from GET /api/products/:id/options and the Variant
 * array from GET /api/products/:id/variants).
 */
export interface OptionValue {
  id: string;
  value: string;
  // Optional swatch colour for visual pickers (#rrggbb).
  swatch: string | null;
  sortOrder: number;
}

export interface Option {
  id: string;
  name: string;
  sortOrder: number;
  values: OptionValue[];
}

export interface Variant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  slug: string | null;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  isActive: boolean;
  sortOrder: number;
  // Typed option values - joined from GET /api/variants/:id/options.
  optionValues?: { optionValue: { value: string; option: { name: string } } }[];
}
