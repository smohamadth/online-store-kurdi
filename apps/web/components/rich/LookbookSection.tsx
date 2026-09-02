// Lookbook — a rich prebuilt home block (type "lookbook").
//
// An editorial split band: photography on one side, copy + call to
// action on the other. The copy column is the first grid item and the
// media column the second, so in an RTL document the layout mirrors
// automatically. When no image is uploaded the band shows the copy
// alone (full width) rather than a broken placeholder.

'use client';

import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { SectionHeading } from '@/components/HomeSections';
import { useIsMobile } from '@/lib/hooks';
import { getImageUrl } from '@/lib/api';

interface Props {
  title?: string | null;
  subtitle?: string | null;
  description?: string;
  image?: string;
  /** Which side of the band the photo sits on (inline-start/end aware). */
  imagePosition?: 'start' | 'end';
  buttonText?: string;
  linkUrl?: string;
  /** Fallback wash behind the photo. */
  overlayColor?: string;
}

export default function LookbookSection({
  title,
  subtitle,
  description,
  image,
  imagePosition = 'start',
  buttonText,
  linkUrl,
  overlayColor,
}: Props) {
  const isMobile = useIsMobile();
  const hasCopy = Boolean(title || subtitle || description || (buttonText && linkUrl));
  const src = getImageUrl(image || '');
  const hasImage = Boolean(src);
  if (!hasCopy && !hasImage) return null;
  // No image (or no copy) degrades gracefully to a single-column band.
  const imageFirst = imagePosition !== 'end';

  const copyInner = (
    <>
      <SectionHeading title={title} subtitle={subtitle} />
      {description && (
        <p
          style={{
            margin: '14px 0 0',
            fontSize: '16px',
            lineHeight: 1.7,
            color: 'var(--muted, #4b5563)',
            maxWidth: '46ch',
          }}
        >
          {description}
        </p>
      )}
      {buttonText && linkUrl && (
        <Link
          href={linkUrl}
          style={{
            marginTop: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '13px 24px',
            backgroundColor: 'var(--brand, #111111)',
            color: 'var(--brand-text, #ffffff)',
            borderRadius: 'var(--btn-radius, 8px)',
            fontSize: '15px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {buttonText}
          <DirectionArrow kind="forward" />
        </Link>
      )}
    </>
  );

  const copy = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: isMobile ? '36px 24px' : '48px',
        minHeight: isMobile ? undefined : 460,
        maxWidth: '600px',
      }}
    >
      {copyInner}
    </div>
  );

  const media = hasImage ? (
    <Link
      href={linkUrl || '#'}
      aria-label={title || buttonText || 'Open image'}
      tabIndex={linkUrl ? 0 : -1}
      style={{ display: 'block' }}
    >
      <img
        src={src}
        alt={title || 'editorial photo'}
        loading="lazy"
        style={{
          width: '100%',
          height: isMobile ? 260 : '100%',
          minHeight: isMobile ? undefined : 460,
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </Link>
  ) : null;

  const band = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
        borderRadius: 'calc(var(--radius, 8px) + 8px)',
        overflow: 'hidden',
        border: '1px solid var(--border, #e5e7eb)',
        backgroundColor: 'var(--card-bg, #fff)',
        boxShadow: 'var(--shadow, none)',
        alignItems: 'stretch',
      }}
    >
      {!hasImage && (
        <div style={{ padding: isMobile ? '36px 24px' : '56px' }}>{copyInner}</div>
      )}
      {hasImage && imageFirst ? media : null}
      {hasImage && imageFirst ? copy : null}
      {hasImage && !imageFirst ? copy : null}
      {hasImage && !imageFirst ? media : null}
    </div>
  );

  return (
    <section
      data-section="lookbook"
      style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '64px 20px',
      }}
    >
      {band}
    </section>
  );
}
