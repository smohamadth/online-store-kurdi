import type { Metadata } from 'next';
import DevelopersPage from '@/components/developers/DevelopersPage';

export const metadata: Metadata = {
  title: 'Developer reference — API & theming',
  description:
    'Build headless storefronts, apps and theme sections against this store: the live public ' +
    'API catalog, the one-call storefront bootstrap, and the home/hero design contract.',
  robots: { index: true, follow: true },
};

export default function Page() {
  return <DevelopersPage />;
}
