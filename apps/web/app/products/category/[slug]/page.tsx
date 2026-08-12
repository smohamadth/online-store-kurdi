import { permanentRedirect } from 'next/navigation';

/**
 * /products/category/<slug>  ->  /category/<slug>
 *
 * There is no route conflict between this and /products/[slug] (one segment
 * vs two), so this URL shape is perfectly valid. We support it as an alias
 * and 308-redirect to the canonical /category/<slug> so the store has exactly
 * ONE indexable URL per category instead of two competing duplicates.
 */
export default function ProductsCategoryAlias({ params }: { params: { slug: string } }) {
  permanentRedirect(`/category/${params.slug}`);
}
