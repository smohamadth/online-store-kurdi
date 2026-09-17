'use client';

import { useId, useRef, useState } from 'react';
import { applyThemeHomeLayout, type HomeSection } from '@/lib/homeSections';
import { errorMessage } from '@/lib/http';

/** One explicitly destructive operation shared by all three design screens. */
export default function ReplaceHomepageButton({
  themeKey,
  themeName,
  disabled = false,
  disabledReason,
  onApplied,
  onBusyChange,
}: {
  /** Omitted only in the Home editor: the API resolves the saved active theme. */
  themeKey?: string;
  themeName?: string;
  disabled?: boolean;
  disabledReason?: string;
  onApplied?: (sections: HomeSection[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const replace = async () => {
    if (disabled || inFlight.current) return;
    const source = themeName ? `“${themeName}”` : 'the active theme';
    if (!window.confirm(
      `Replace the live homepage with the saved home template from ${source}? ` +
      'All current homepage blocks will be deleted. This does not change the active theme, colours, or fonts.',
    )) return;

    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    onBusyChange?.(true);
    try {
      const result = await applyThemeHomeLayout(themeKey);
      onApplied?.(result.sections);
      setNotice({ error: false, text: result.message || 'Homepage replaced. Edit its blocks in Appearance → Homepage.' });
    } catch (error) {
      setNotice({ error: true, text: errorMessage(error, 'Could not replace the homepage. Please try again.') });
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <button
        type="button"
        disabled={disabled || busy}
        aria-describedby={disabledReason ? id : undefined}
        onClick={replace}
        style={{
          padding: '9px 14px', border: '1px solid #d4d4d4', borderRadius: 6,
          background: '#fff', color: '#111', fontWeight: 600, fontSize: 13,
          cursor: disabled || busy ? 'not-allowed' : 'pointer', opacity: disabled || busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Replacing homepage…' : 'Replace homepage from theme'}
      </button>
      {disabledReason && <p id={id} style={{ margin: '6px 0 0', color: '#666', fontSize: 12 }}>{disabledReason}</p>}
      {notice && (
        <p role={notice.error ? 'alert' : 'status'} style={{ margin: '8px 0 0', color: notice.error ? '#b91c1c' : '#166534', fontSize: 13 }}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
