// LanguageSwitcher - the i18n picker in the header. Switches the
// active language via lib/i18n (localStorage + document lang/dir);
// the server layout picks the initial locale from cookie/
// Accept-Language so first paint is already in the right language.

'use client';

import { useState } from 'react';
import { languages, useTranslation } from '@/lib/i18n';

export default function LanguageSwitcher() {
  const { language, changeLanguage, direction } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const currentLang = languages.find(l => l.code === language);
  // Direction-aware pieces:
  //   - the caret glyph flips (CSS can't mirror a character).
  //   - the dropdown anchors to the inline-end of the trigger, the row
  //     text aligns to the inline-start, and the "current language" check
  //     is pushed to the inline-end of its row - all via logical CSS
  //     (insetInlineEnd / text-align: start / marginInlineStart), which
  //     mirrors with the live document.dir, including after a
  //     client-side language switch.
  const isRtl = direction === 'rtl';
  const caret = isRtl ? '◀' : '▶';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          background: 'none',
          // <button> does not inherit colour - without this it renders as the
          // UA's black `buttontext`, which is invisible on a dark header.
          color: 'var(--header-text, #111)',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        <span>{currentLang?.flag}</span>
        <span style={{ fontSize: '12px' }}>{currentLang?.code.toUpperCase()}</span>
        <span style={{ fontSize: '10px' }}>{caret}</span>
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            marginTop: '4px',
            // Inline-end anchor: was hard-coded `right: 0`, which lined the
            // dropdown up with the right edge of the trigger in LTR but
            // pushed it off-screen in RTL when the trigger sat on the right
            // side of the header.
            insetInlineEnd: 0,
            backgroundColor: 'var(--card-bg, white)',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 100,
            minWidth: '150px',
            overflow: 'hidden',
          }}>
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  changeLanguage(lang.code);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 14px',
                  background: language === lang.code ? '#f5f5f5' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: language === lang.code ? 600 : 400,
                  textAlign: 'start',
                }}
              >
                <span style={{ fontSize: '18px' }}>{lang.flag}</span>
                <span>{lang.name}</span>
                {language === lang.code && (
                  <span style={{ marginInlineStart: 'auto', color: '#22c55e' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
