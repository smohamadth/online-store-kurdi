/**
 * Variant selector: pick the variant that matches the customer's
 * currently-chosen option values.
 *
 * The PDP (and any other storefront page that needs to drive
 * variant selection) uses the typed Option/OptionValue tree
 * instead of the legacy `attributes` JSON column. The legacy
 * code used the JSON keys; this helper expects the same data
 * shape but reads from the typed tree.
 *
 * Falls back to legacy `attributes` matching if the product has
 * no typed options - the storefront continues to work for
 * products that haven't been migrated to the new schema yet.
 */
import type { Variant, Option } from './variant-types';

export type ChosenOptions = Record<string, string>; // optionName -> optionValue

/**
 * Given the list of variants and the customer's chosen option
 * values, return the variant that matches. `undefined` if no
 * match (the customer picked an out-of-stock combination, or
 * the typed options don't exist for this product).
 */
export function pickVariant(
  variants: Variant[],
  options: Option[],
  chosen: ChosenOptions,
): Variant | undefined {
  if (!variants || variants.length === 0) return undefined;
  // No typed options: fall back to "first active variant". If
  // no variant is active, return undefined - the storefront should
  // not silently surface a disabled variant.
  if (!options || options.length === 0) {
    return variants.find((v) => v.isActive);
  }
  // For each variant, look up its chosen option values and
  // compare against the customer's selection. A variant is a
  // match when, for every option the customer has chosen, the
  // variant has the same value.
  for (const v of variants) {
    if (!v.isActive) continue;
    let ok = true;
    for (const [optionName, wantedValue] of Object.entries(chosen)) {
      if (!wantedValue) continue;
      // The variant's chosen option values come pre-joined from
      // GET /api/variants/:id/options; we accept either shape.
      const variantValues = (v as any).optionValues
        ?.map((ov: any) => ov.optionValue?.value)
        ?? readLegacyAttribute(v, optionName);
      if (!variantValues || !variantValues.includes(wantedValue)) {
        ok = false;
        break;
      }
    }
    if (ok) return v;
  }
  return undefined;
}

/**
 * Initial option selection: pick the first value of each option
 * (deterministic - sorted by sortOrder). Returns an empty object
 * if no options are defined.
 */
export function defaultSelection(options: Option[]): ChosenOptions {
  const out: ChosenOptions = {};
  for (const opt of options || []) {
    if (opt.values && opt.values.length > 0) {
      const sorted = [...opt.values].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      out[opt.name] = sorted[0].value;
    }
  }
  return out;
}

/** Read the legacy `attributes` JSON for a variant (best-effort
 *  fallback when the product hasn't been migrated to typed
 *  options yet). */
function readLegacyAttribute(v: Variant, name: string): string[] | undefined {
  const raw = (v as any).attributes;
  if (!raw) return undefined;
  let attrs: Record<string, unknown>;
  try {
    attrs = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return undefined;
  }
  const v2 = attrs[name];
  if (typeof v2 === 'string') return [v2];
  if (Array.isArray(v2) && v2.every((x) => typeof x === 'string')) return v2 as string[];
  return undefined;
}

/**
 * Stable display name for a swatch button. Trims long values,
 * upper-cases the first letter of single-word values so swatch
 * chips render consistently.
 */
export function swatchLabel(value: string): string {
  if (!value) return '';
  if (value.length <= 12) return value.charAt(0).toUpperCase() + value.slice(1);
  return value.slice(0, 12) + '…';
}
