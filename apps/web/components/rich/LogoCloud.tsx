// Logo cloud — a rich prebuilt home block (type "logos").
//
// A "trusted by / our brands" strip: the row's logo items render as a
// centered row of brand marks. Items with an uploaded image show the
// image (optionally desaturated); items with only a name render as
// styled wordmarks so the block looks complete before any upload.

'use client';

import { SectionHeading } from '@/components/HomeSections';
import type { LogoItem } from '@/lib/homeSections';

interface Props {
  title?: string | null;
  subtitle?: string | null;
  items?: LogoItem[];
  /** Desaturate brand images for an even "trusted by" strip. */
  grayscale?: boolean;
}

export default function LogoCloud({ title, subtitle, items, grayscale = true }: Props) {
  const list = Array.isArray(items) ? items.filter((i) => i && (i.name || i.image)) : [];
  if (list.length === 0) return null;

  return (
    <section
      data-section="logos"
      style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '56px 20px',
      }}
    >
      <SectionHeading title={title} subtitle={subtitle} center />
      <div
        style={{
          marginTop: '34px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '44px 56px',
        }}
      >
        {list.map((logo, idx) =>
          logo.image ? (
            <img
              key={idx}
              src={logo.image}
              alt={logo.name || 'brand logo'}
              title={logo.name || undefined}
              loading="lazy"
              style={{
                height: '38px',
                maxWidth: '160px',
                objectFit: 'contain',
                filter: grayscale ? 'grayscale(1)' : 'none',
                opacity: grayscale ? 0.75 : 1,
              }}
            />
          ) : (
            <span
              key={idx}
              style={{
                fontSize: '20px',
                fontWeight: 'var(--heading-weight, 800)',
                letterSpacing: '-0.01em',
                color: 'var(--muted, #6b7280)',
                whiteSpace: 'nowrap',
              }}
            >
              {logo.name}
            </span>
          )
        )}
      </div>
    </section>
  );
}
