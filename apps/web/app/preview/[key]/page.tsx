import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  isInstalledTheme,
  getTheme,
  listThemeKeys,
  type ThemeConfig,
} from '@/lib/themeRegistry';
import { fetchThemeCatalog } from '@/lib/themeRuntime';
import { buildNoindexMetadata } from '@/lib/seo';
import { PreviewView } from './PreviewView';

interface PageProps {
  params: { key: string };
}

/**
 * Resolve the theme being previewed: bundled themes come from the static
 * registry; admin-installed themes are looked up in the runtime catalog the
 * API serves (they are not in the web bundle). Returns null when the key is
 * unknown — the page then 404s.
 */
async function resolvePreviewTheme(key: string): Promise<ThemeConfig | null> {
  if (isInstalledTheme(key)) return getTheme(key);
  try {
    const { themes } = await fetchThemeCatalog();
    return themes.find((t) => t.key === key) ?? null;
  } catch {
    return null;
  }
}

/**
 * /preview/<key> — theme preview.
 *
 * A merchant-facing page that demos what a theme looks like
 * with realistic content. The key must be a known theme
 * (bundled or admin-installed); anything else 404s.
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
  const theme = await resolvePreviewTheme(key);
  if (!theme) {
    // A non-installed key is a 404. We still emit noindex
    // metadata so the 404 page itself isn't indexed.
    return buildNoindexMetadata({ title: 'Theme not found', path: '/preview' });
  }
  return buildNoindexMetadata({
    title: `${theme.name} theme — Preview`,
    description: theme.description,
    path: '/preview',
  });
}

/**
 * Pre-render the bundled themes. Installed themes are dynamic
 * (they don't exist at build time); the dynamic route still
 * resolves them at request time, just without the static
 * optimisation.
 */
export function generateStaticParams() {
  return listThemeKeys().map((key) => ({ key }));
}

export default async function ThemePreviewPage({ params }: PageProps) {
  const key = decodeURIComponent(params.key);
  const theme = await resolvePreviewTheme(key);
  if (!theme) {
    // The route is only registered for known themes; an
    // unknown key is a real 404. Next.js renders the
    // closest not-found.tsx (or the default 404 if there
    // isn't one).
    notFound();
  }
  return (
    <PreviewView
      themeKey={theme.key}
      themeName={theme.name}
      themeDescription={theme.description}
      themeConfig={theme}
    />
  );
}
