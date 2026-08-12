'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useStoreSettings } from '@/lib/settings';

/**
 * Enforces the "Maintenance mode" switch in Admin → Settings.
 *
 * That toggle was previously stored in the database and loaded into the client,
 * but nothing ever read it — turning it on had no visible effect anywhere on
 * the site. This blocks the storefront while leaving the admin panel and the
 * auth pages reachable, otherwise an admin could lock themselves out with no
 * way back in.
 */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { settings, loading } = useStoreSettings();
  const pathname = usePathname() || '';
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      const role = raw ? JSON.parse(raw)?.role : null;
      setIsAdmin(role === 'admin' || role === 'manager');
    } catch {
      setIsAdmin(false);
    }
    setChecked(true);
  }, [pathname]);

  // Never gate the routes needed to turn maintenance mode back off.
  const exempt =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password');

  // Wait for both the settings fetch and the role check before deciding, so a
  // brief flash of the maintenance screen never hides a working store.
  if (loading || !checked) return <>{children}</>;
  if (!settings.maintenanceMode || exempt || isAdmin) return <>{children}</>;

  return (
    <div
      role="status"
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '64px 24px',
        gap: '14px',
      }}
    >
      <div style={{ fontSize: '56px' }} aria-hidden="true">
        🛠️
      </div>
      <h1 style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-0.01em' }}>
        We&apos;ll be right back
      </h1>
      <p style={{ color: '#666', fontSize: '16px', maxWidth: '520px', lineHeight: 1.65 }}>
        {settings.maintenanceMessage?.trim()
          ? settings.maintenanceMessage
          : `${settings.storeName} is temporarily down for maintenance. Please check back shortly.`}
      </p>
    </div>
  );
}
