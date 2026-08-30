'use client';

import { useCurrency } from '@/lib/currency';

/**
 * CurrencyPicker — header dropdown that lets the visitor
 * switch the display currency.
 *
 * The picker is intentionally minimal. It shows the current
 * picker's symbol/code, lists every enabled currency (plus the
 * base), and updates the visitor's choice on change. The
 * actual conversion happens in `useCurrency().formatMoney` -
 * we only persist the visitor's pick here.
 *
 * The visual style mirrors the existing LanguageSwitcher so
 * the header doesn't end up with two different dropdown
 * designs side by side.
 */
export default function CurrencyPicker() {
  const { displayCode, currencies, setDisplayCode } = useCurrency();

  // Don't render anything until we know what currencies the
  // store supports. A picker with only the base is fine, but
  // a one-option dropdown is just visual noise.
  if (currencies.length <= 1) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        color: 'var(--muted, #6b7280)',
      }}
    >
      <span aria-hidden="true">💱</span>
      <label
        htmlFor="currency-picker"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Display currency
      </label>
      <select
        id="currency-picker"
        data-testid="currency-picker"
        value={displayCode}
        onChange={(e) => setDisplayCode(e.target.value)}
        style={{
          padding: '4px 8px',
          fontSize: '13px',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: '4px',
          background: 'var(--card-bg, #fff)',
          color: 'var(--body-text, #111)',
          cursor: 'pointer',
        }}
      >
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} {c.isBase ? '' : `· ${c.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}
