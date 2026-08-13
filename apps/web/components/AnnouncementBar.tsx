'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';

/** Thin promotional strip above the header, controlled from Admin → Appearance. */
export default function AnnouncementBar() {
  const { theme } = useTheme();

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
