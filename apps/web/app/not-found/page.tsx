import type { Metadata } from 'next';
import NotFoundView from '@/app/not-found';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

// Fully static: no data fetching, so this route itself never streams.
export const dynamic = 'force-static';

export default function NotFoundRoute() {
  return <NotFoundView />;
}
