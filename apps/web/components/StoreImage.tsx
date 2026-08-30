'use client';

import Image from 'next/image';
import type { CSSProperties, ImgHTMLAttributes } from 'react';

/**
 * The store's single image component.
 *
 * - Same-origin / relative URLs (public assets, /uploads) go through
 *   `next/image`, which adds the loading semantics that were missing
 *   from the old raw `<img>` tags: lazy loading, async decode, and —
 *   for the product page's main image (the LCP element) — `priority`,
 *   which sets fetchpriority=high and loads eagerly.
 * - Absolute external URLs and data: URIs render as a plain
 *   `<img loading="lazy">`. Merchants can paste arbitrary image URLs
 *   into product data; running third-party hotlinks through the
 *   optimizer would break them (remotePatterns validation, hotlink
 *   protection) without any benefit for a self-hosted store.
 *
 * Note: next.config.js ships `images.unoptimized: true`, so next/image
 * here contributes loading semantics, not a resize pipeline.
 */
export interface StoreImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'width' | 'height'> {
  src: string;
  alt: string;
  /** Fill the parent container (which must be positioned). */
  fill?: boolean;
  /** LCP image: eager load + fetchpriority=high. */
  priority?: boolean;
  style?: CSSProperties;
  /** next/image requires numbers (its type is stricter than <img>'s). */
  width?: number;
  height?: number;
}

export default function StoreImage({
  src,
  alt,
  fill,
  priority,
  style,
  width,
  height,
  ...rest
}: StoreImageProps) {
  const isExternal = /^https?:\/\//i.test(src) || src.startsWith('data:');
  // next/image requires either `fill` or explicit width+height; when
  // neither is available, keep the previous raw-<img> behaviour rather
  // than throw at render.
  const canUseNextImage = !isExternal && (fill || (width !== undefined && height !== undefined));

  if (!canUseNextImage) {
    return (
      <img
        src={src}
        alt={alt}
        loading={priority ? undefined : 'lazy'}
        decoding="async"
        style={style}
        width={width}
        height={height}
        {...rest}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      priority={priority}
      style={style}
      width={width}
      height={height}
      {...rest}
    />
  );
}
