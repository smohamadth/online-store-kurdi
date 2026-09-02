/**
 * Maintenance for the VariantAttribute query index.
 *
 * Variant.attributes is a JSON string - the source of truth for display
 * (PDP, admin). The VariantAttribute table mirrors it as (key, value)
 * rows so /products filtering and the facet sidebar can match variants
 * by attribute in indexed SQL instead of fetching + JSON-parsing every
 * variant of the candidate set (the old O(catalog) post-filter).
 *
 * The index is maintained at every variant write site (see the callers
 * of syncVariantAttributes): variant.service create/update/delete, the
 * product create route, and the import/export commit. A variant deleted
 * outside those paths (there are none today) would also lose its rows
 * via the FK cascade in the real database.
 *
 * The sync is delete-then-create, not a diff: attribute sets are small
 * (a handful of pairs), so a full rewrite is cheaper to reason about
 * and always converges.
 */
import { parseAttributes } from './variant.helpers';

/** A prisma client or an interactive-transaction handle (same delegate API). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AttributeClient = any;

/**
 * Rewrite the index rows for one variant. Pass the attributes exactly
 * as they are (or will be) stored on the variant row (JSON string).
 * Accepts a prisma client or an interactive-transaction handle.
 */
export async function syncVariantAttributes(
  client: AttributeClient,
  variantId: string,
  attributesJson: string | null | undefined,
): Promise<void> {
  await client.variantAttribute.deleteMany({ where: { variantId } });
  const attrs = parseAttributes(attributesJson);
  const entries = Object.entries(attrs);
  if (entries.length === 0) return;
  await client.variantAttribute.createMany({
    data: entries.map(([key, value]) => ({ variantId, key, value: String(value) })),
  });
}

/** Drop one variant's index rows (used on force-delete; the FK cascade covers the real DB). */
export async function deleteVariantAttributes(
  client: AttributeClient,
  variantId: string,
): Promise<void> {
  await client.variantAttribute.deleteMany({ where: { variantId } });
}
