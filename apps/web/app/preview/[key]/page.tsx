import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  isInstalledTheme,
  getTheme,
  listThemeKeys,
} from '@/lib/themeRegistry';
import { buildNoindexMetadata } from '@/lib/seo';
import { PreviewView } from './PreviewView';

interface PageProps {
  params: { key: string };
}

/**
 * /preview/<key> — theme preview.
 *
 * A merchant-facing page that demos what a theme looks like
 * with realistic content. The key must be a known theme;
 * anything else 404s.
 *
 * The page is a server component for the metadata and
 * validation, but the content renders client-side because
 * the section components are client components (they use
 * the theme context).
 *
 * Why noindex? Preview pages are a merchant surface, not a
 * public marketing surface (the public-facing marketplace
 * gallery is a different page that links here). Crawlers
 * should not index the previews; the metadata blocks them.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const key = decodeURIComponent(params.key);
  if (!isInstalledTheme(key)) {
    // A non-installed key is a 404. We still emit noindex
    // metadata so the 404 page itself isn't indexed.
    return buildNoindexMetadata({ title: 'Theme not found', path: '/preview' });
  }
  const theme = getTheme(key);
  return buildNoindexMetadata({
    title: `${theme.name} theme — Preview`,
    description: theme.description,
    path: '/preview',
  });
}

/**
 * Pre-render the known themes. New themes added to the
 * registry without a rebuild won't be in the static param
 * list; the dynamic route still resolves them at request
 * time, just without the static optimisation.
 */
export function generateStaticParams() {
  return listThemeKeys().map((key) => ({ key }));
}

export default function ThemePreviewPage({ params }: PageProps) {
  const key = decodeURIComponent(params.key);
  if (!isInstalledTheme(key)) {
    // The route is only registered for known themes; an
    // unknown key is a real 404. Next.js renders the
    // closest not-found.tsx (or the default 404 if there
    // isn't one).
    notFound();
  }
  const theme = getTheme(key);
  return <PreviewView themeKey={key} themeName={theme.name} themeDescription={theme.description} />;
}
