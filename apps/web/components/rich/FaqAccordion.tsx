// FAQ accordion — a rich prebuilt home block (type "faq").
//
// Renders the row's Q&A items as expandable cards. Pure presentational:
// the admin edits items in the Home builder; the storefront theme tokens
// (--card-bg, --border, --muted, --accent) drive the look so it stays
// correct in every preset and in RTL.

'use client';

import { useState } from 'react';
import { SectionHeading } from '@/components/HomeSections';
import type { FaqItem } from '@/lib/homeSections';

interface Props {
  title?: string | null;
  subtitle?: string | null;
  items?: FaqItem[];
  /** one = single column; two = two-column grid on desktop. */
  columns?: 'one' | 'two';
  /** Whether the first item starts open on load. */
  openFirst?: boolean;
}

export default function FaqAccordion({
  title,
  subtitle,
  items,
  columns = 'two',
  openFirst = true,
}: Props) {
  const [open, setOpen] = useState<number[]>(openFirst && items?.length ? [0] : []);
  const list = Array.isArray(items) ? items.filter((i) => i && (i.q || i.a)) : [];

  if (list.length === 0 && !title && !subtitle) return null;
  if (list.length === 0) return null;

  const toggle = (idx: number) =>
    setOpen((cur) => (cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx]));

  const twoCol = columns === 'two' && list.length > 1;

  return (
    <section
      data-section="faq"
      style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '64px 20px' }}
    >
      <SectionHeading title={title} subtitle={subtitle} center={!twoCol} />
      <div
        style={{
          marginTop: '36px',
          display: 'grid',
          gridTemplateColumns: twoCol ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 760px)',
          justifyContent: twoCol ? 'stretch' : 'center',
          gap: '14px',
          alignItems: 'start',
        }}
      >
        {list.map((item, idx) => {
          const isOpen = open.includes(idx);
          return (
            <div
              key={idx}
              style={{
                border: `1px solid ${isOpen ? 'var(--accent, #2563eb)' : 'var(--border, #e5e7eb)'}`,
                borderRadius: 'var(--radius, 8px)',
                backgroundColor: 'var(--card-bg, #fff)',
                overflow: 'hidden',
                transition: 'border-color 0.15s ease',
              }}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  width: '100%',
                  padding: '15px 18px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'start',
                  color: 'var(--body-text, #111)',
                  fontSize: '15.5px',
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                <span>{item.q}</span>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isOpen ? 'var(--accent, #2563eb)' : 'var(--surface-2, #f1f1f1)',
                    color: isOpen ? '#fff' : 'var(--muted, #6b7280)',
                    fontSize: '14px',
                    fontWeight: 800,
                    transition: 'transform 0.18s ease, background-color 0.18s ease',
                    transform: isOpen ? 'rotate(45deg)' : 'none',
                  }}
                >
                  +
                </span>
              </button>
              {isOpen && (
                <div
                  style={{
                    padding: '0 18px 18px',
                    color: 'var(--muted, #4b5563)',
                    fontSize: '14.5px',
                    lineHeight: 1.75,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
