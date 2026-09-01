'use client';

/**
 * StaticLayoutRenderer — render a pre-resolved PageLayout with page data.
 *
 * Unlike PageLayoutView (which resolves the active theme's layout client-side),
 * this component takes the layout as a prop. It is for SERVER pages that have
 * already resolved the active theme server-side (via serverLayout.ts) so the
 * layout ships in the initial HTML.
 */
import { LayoutRenderer, LayoutData } from '@/lib/layouts/render';
import type { PageLayout } from '@/lib/layouts/types';

export default function StaticLayoutRenderer({
  layout,
  data,
}: {
  layout: PageLayout;
  data: LayoutData;
}) {
  return <LayoutRenderer layout={layout} data={data} />;
}
