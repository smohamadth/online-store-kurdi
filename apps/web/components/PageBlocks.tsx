import type { PageBlock } from '@/lib/pageBlocks';

/**
 * Storefront renderer for page layout blocks.
 *
 * Plain server component (no client JS needed) - the blocks are static
 * once the page is saved. Styling uses the store's theme tokens
 * (var(--body-text), var(--border), var(--brand)...) so a rebranded
 * store restyles block pages automatically, with neutral fallbacks for
 * the tokens that historically had no variable.
 */

const ALIGNMENTS = ['left', 'center', 'right'] as const;

function isAlign(v: unknown): v is 'left' | 'center' | 'right' {
  return typeof v === 'string' && (ALIGNMENTS as readonly string[]).includes(v);
}

/**
 * Map a stored alignment to a LOGICAL text-align value so the block
 * mirrors correctly in RTL (a "left" section sits at the start of the
 * line in both directions). The storefront renders dir="rtl" for
 * Kurdish/Arabic visitors, and the RTL ratchet forbids physical
 * left/right alignment in customer-facing source.
 */
function alignToTextAlign(align: string | undefined): 'start' | 'center' | 'end' {
  if (align === 'right') return 'end';
  if (align === 'center') return 'center';
  return 'start';
}

const CALLOUT_TONES: Record<string, { bg: string; border: string; color: string }> = {
  info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
  warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
  danger: { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
};

export function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  return (
    <>
      {blocks.map((b) => {
        switch (b.type) {
          case 'richText':
            return (
              <div
                key={b.id}
                style={{ lineHeight: 1.75 }}
                dangerouslySetInnerHTML={{ __html: b.config.html || '' }}
              />
            );

          case 'heading': {
            const level = b.config.level === 3 ? 3 : 2;
            const align = isAlign(b.config.align) ? b.config.align : 'left';
            const Tag = (level === 3 ? 'h3' : 'h2') as 'h2' | 'h3';
            return (
              <Tag
                key={b.id}
                style={{
                  margin: '28px 0 12px',
                  textAlign: alignToTextAlign(align),
                  fontSize: level === 3 ? '20px' : '26px',
                  fontWeight: 700,
                  color: 'var(--body-text, #111)',
                }}
              >
                {b.config.text || ''}
              </Tag>
            );
          }

          case 'image': {
            if (!b.config.url) return null;
            const align = isAlign(b.config.align) ? b.config.align : 'center';
            const half = b.config.width === 'half';
            // Logical margins so a half-width image anchored "right"
            // sits at the end of the line in RTL too.
            const imgStyle: React.CSSProperties = {
              display: 'block',
              maxWidth: half ? '50%' : '100%',
              borderRadius: '8px',
            };
            if (align === 'center') {
              imgStyle.marginInline = 'auto';
            } else if (align === 'right') {
              imgStyle.marginInlineStart = 'auto';
            }
            return (
              <figure
                key={b.id}
                style={{
                  margin: '20px 0',
                  textAlign: alignToTextAlign(align),
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.config.url} alt={b.config.alt || ''} style={imgStyle} />
                {b.config.caption && (
                  <figcaption
                    style={{
                      fontSize: '13px',
                      color: 'var(--muted, #666)',
                      marginTop: '8px',
                    }}
                  >
                    {b.config.caption}
                  </figcaption>
                )}
              </figure>
            );
          }

          case 'columns':
            return (
              <div
                key={b.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '24px',
                  margin: '20px 0',
                  lineHeight: 1.7,
                }}
              >
                <div dangerouslySetInnerHTML={{ __html: b.config.left || '' }} />
                <div dangerouslySetInnerHTML={{ __html: b.config.right || '' }} />
              </div>
            );

          case 'callout': {
            const tone = CALLOUT_TONES[b.config.tone] || CALLOUT_TONES.info;
            return (
              <div
                key={b.id}
                role="note"
                style={{
                  margin: '20px 0',
                  padding: '14px 18px',
                  borderRadius: '8px',
                  backgroundColor: tone.bg,
                  border: `1px solid ${tone.border}`,
                  color: tone.color,
                  fontSize: '14.5px',
                  lineHeight: 1.6,
                }}
              >
                {b.config.text || ''}
              </div>
            );
          }

          case 'quote': {
            if (!b.config.text) return null;
            return (
              <blockquote
                key={b.id}
                style={{
                  margin: '24px 0',
                  padding: '8px 24px',
                  borderInlineStart: '4px solid var(--brand, #111)',
                  fontSize: '18px',
                  fontStyle: 'italic',
                  lineHeight: 1.6,
                  color: 'var(--body-text, #111)',
                }}
              >
                “{b.config.text}”
                {b.config.attribution && (
                  <footer
                    style={{
                      marginTop: '10px',
                      fontSize: '13.5px',
                      fontStyle: 'normal',
                      color: 'var(--muted, #666)',
                    }}
                  >
                    — {b.config.attribution}
                  </footer>
                )}
              </blockquote>
            );
          }

          case 'gallery': {
            // Up to four images, each { url, caption }. Entries without a
            // URL are skipped so a half-filled gallery still looks right.
            const items = Array.isArray(b.config.images)
              ? b.config.images.filter((im: any) => im && typeof im === 'object' && im.url).slice(0, 4)
              : [];
            if (items.length === 0) return null;
            return (
              <div
                key={b.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                  margin: '24px 0',
                }}
              >
                {items.map((im: any, i: number) => (
                  <figure key={i} style={{ margin: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={im.url}
                      alt={im.alt || im.caption || ''}
                      style={{
                        width: '100%',
                        display: 'block',
                        borderRadius: '8px',
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                      }}
                    />
                    {im.caption && (
                      <figcaption
                        style={{
                          fontSize: '12.5px',
                          color: 'var(--muted, #666)',
                          marginTop: '6px',
                          textAlign: 'center',
                        }}
                      >
                        {im.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            );
          }

          case 'cta': {
            if (!b.config.label || !b.config.href) return null;
            const outline = b.config.variant === 'outline';
            return (
              <div key={b.id} style={{ margin: '24px 0' }}>
                <a
                  href={b.config.href}
                  style={{
                    display: 'inline-block',
                    padding: '12px 26px',
                    borderRadius: '8px',
                    backgroundColor: outline ? 'transparent' : 'var(--brand, #111)',
                    color: outline ? 'var(--brand, #111)' : 'var(--brand-text, #fff)',
                    border: outline ? '1.5px solid var(--brand, #111)' : 'none',
                    fontSize: '15px',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {b.config.label}
                </a>
              </div>
            );
          }

          case 'divider':
            return (
              <hr
                key={b.id}
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--border, #e5e5e5)',
                  margin: '28px 0',
                }}
              />
            );

          case 'spacer': {
            const size = { sm: 12, md: 28, lg: 56 }[b.config.size as string] ?? 28;
            return <div key={b.id} style={{ height: size }} aria-hidden="true" />;
          }

          default:
          // Unknown block types (saved by a newer admin bundle) are
          // skipped, never page-breaking.
            return null;
        }
      })}
    </>
  );
}
