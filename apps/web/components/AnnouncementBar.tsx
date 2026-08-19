'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme';

/** Thin promotional strip above the header, controlled from Admin → Appearance. */
export default function AnnouncementBar() {
  const pathname = usePathname();
  const { theme } = useTheme();

  // Storefront promo only. Inside the admin panel it pushed the 100vh shell
  // down by its own height, producing a scrollbar and a strip of shop
  // marketing above the dashboard.
  if (pathname?.startsWith('/admin')) return null;

  if (!theme.showAnnouncement || !theme.announcementText?.trim()) return null;

  const content = (
    <span style={{ fontSize: '14px', fontWeight: 600 }}>{theme.announcementText}</span>
  );

  return (
    <div
      style={{
        backgroundColor: theme.announcementBg,
        color: theme.announcementText2,
        textAlign: 'center',
        padding: '9px 16px',
      }}
    >
      {theme.announcementLink ? (
        <Link
          href={theme.announcementLink}
          style={{ color: theme.announcementText2, textDecoration: 'none' }}
        >
          {content} <span aria-hidden="true">→</span>
        </Link>
      ) : (
        content
      )}
    </div>
  );
}
