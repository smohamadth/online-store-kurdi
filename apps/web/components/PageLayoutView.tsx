'use client';

/**
 * PageLayoutView — render a page through the active theme's Theme Studio
 * layout when one exists, otherwise fall back to the page's built-in content.
 *
 * A storefront page wraps its normal body in this component:
 *
 *   <PageLayoutView page="products" data={{ products, title }}>
 *     {builtInPageBody}
 *   </PageLayoutView>
 *
 * When the active theme ships a `layouts.<page>`, the grid is rendered from
 * the layout's blocks (fed with `data`); otherwise the `children` fallback
 * renders exactly as before. This keeps every page opt-in and never changes
 * behaviour until an admin creates a layout for it.
 */
import { ReactNode } from 'react';
import { LayoutRenderer, LayoutData } from '@/lib/layouts/render';
import { useActiveLayout } from '@/lib/layouts/useActiveLayout';
import { PAGE_CHROME_BLOCKS, studioLayoutReplacesChrome } from '@/lib/layouts/pageChrome';
import type { PageKey } from '@/lib/layouts/types';

export default function PageLayoutView({
  page,
  data,
  children,
}: {
  page: PageKey;
  data: LayoutData;
  children: ReactNode;
}) {
  const layout = useActiveLayout(page);
  if (!layout || !studioLayoutReplacesChrome(layout, PAGE_CHROME_BLOCKS[page])) return <>{children}</>;
  return <LayoutRenderer layout={layout} data={data} />;
}
