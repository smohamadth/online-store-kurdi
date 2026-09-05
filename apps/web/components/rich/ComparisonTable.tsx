// Comparison table — a rich prebuilt home block (type "comparison").
//
// Renders the classic "compare plans/products" table: a first column of
// feature labels, then one column per comparison item. Cell values are
// plain text; the literals "true"/"✓" and "false"/"x"/"✗" render as
// green check / red cross marks so the admin can fill the table fast.

'use client';

import { SectionHeading } from '@/components/HomeSections';
import type { ComparisonColumn, ComparisonRow } from '@/lib/homeSections';

interface Props {
  title?: string | null;
  subtitle?: string | null;
  columns?: ComparisonColumn[];
  rows?: ComparisonRow[];
  /** 1-based index of the column to emphasise (0/none disables). */
  highlight?: number | null;
}

function CellValue({ value }: { value: string | boolean | null | undefined }) {
  if (value === true) return <span style={{ color: '#16a34a', fontWeight: 800 }}>✓</span>;
  if (value === false) return <span style={{ color: 'var(--sale-color, #dc2626)', fontWeight: 800 }}>✕</span>;
  const v = String(value ?? '').trim();
  if (v === 'true' || v === '✓' || v === '✔') {
    return <span style={{ color: '#16a34a', fontWeight: 800 }}>✓</span>;
  }
  if (v === 'false' || v === 'x' || v === '✗' || v === '✕') {
    return <span style={{ color: 'var(--sale-color, #dc2626)', fontWeight: 800 }}>✕</span>;
  }
  if (v === '') return <span style={{ color: 'var(--border, #c3c8d1)' }}>—</span>;
  return <>{v}</>;
}

export default function ComparisonTable({
  title,
  subtitle,
  columns,
  rows,
  highlight = null,
}: Props) {
  const cols = Array.isArray(columns) ? columns.filter((c) => c && c.name) : [];
  const list = Array.isArray(rows)
    ? rows.filter((r) => r && r.label && Array.isArray(r.values))
    : [];
  if (cols.length === 0 || list.length === 0) return null;

  const hl = typeof highlight === 'number' && highlight >= 1 && highlight <= cols.length
    ? highlight
    : null;

  return (
    <section
      data-section="comparison"
      style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '64px 20px' }}
    >
      <SectionHeading title={title} subtitle={subtitle} center />
      <div style={{ marginTop: '36px', overflowX: 'auto' }}>
        <table
          data-highlight={hl ?? undefined}
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'var(--card-bg, #fff)',
            borderRadius: 'calc(var(--radius, 8px) + 4px)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow, none)',
            fontSize: '14.5px',
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: 'start',
                  padding: '18px 20px',
                  borderBottom: '2px solid var(--border, #e5e7eb)',
                  width: '34%',
                }}
              />
              {cols.map((c, i) => {
                const em = hl === i + 1;
                return (
                  <th
                    key={i}
                    style={{
                      textAlign: 'center',
                      padding: '18px 14px',
                      borderBottom: '2px solid var(--border, #e5e7eb)',
                      backgroundColor: em ? 'var(--surface-2, #f1f1f1)' : 'transparent',
                    }}
                  >
                    <div style={{ fontWeight: 'var(--heading-weight, 800)', color: 'var(--body-text, #111)', fontSize: '16px' }}>
                      {c.name}
                    </div>
                    {c.sub && (
                      <div style={{ marginTop: '4px', color: 'var(--muted, #6b7280)', fontSize: '13px', fontWeight: 500 }}>
                        {c.sub}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: `1px solid var(--border, #e5e7eb)` }}>
                <td
                  style={{
                    padding: '13px 20px',
                    color: 'var(--body-text, #111)',
                    fontWeight: 600,
                  }}
                >
                  {row.label}
                </td>
                {cols.map((_, ci) => {
                  const em = hl === ci + 1;
                  return (
                    <td
                      key={ci}
                      style={{
                        textAlign: 'center',
                        padding: '13px 14px',
                        color: 'var(--muted, #4b5563)',
                        backgroundColor: em ? 'var(--surface-2, #f1f1f1)' : 'transparent',
                      }}
                    >
                      <CellValue value={row.values?.[ci] ?? ''} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
