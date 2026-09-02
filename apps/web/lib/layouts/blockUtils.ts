// ---------------------------------------------------------------------------
// blockUtils — pure helpers shared by the rich-block renderers (LayoutRenderer)
// and the Theme Studio config editor. Keeping them pure + side-effect free
// makes them trivially unit-testable and guarantees the editor and the
// storefront agree on the config shape for every rich block.
// ---------------------------------------------------------------------------
import type { BlockType } from './types';

/** Normalise a YouTube / Vimeo URL into an embeddable <iframe> src. */
export function toEmbedUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  // youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, /shorts/ID
  const yt =
    url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/) ||
    url.match(/youtube\.com\/watch\?.*v=([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/** Read the `items` array out of a block config (always an array). */
export function itemsOf(config: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(config.items) ? (config.items as Record<string, unknown>[]) : [];
}

/**
 * The rich blocks whose primary payload is a list of items. The Studio renders
 * an "Items (JSON)" editor for these; the renderers read them via itemsOf().
 */
export const LIST_BLOCK_TYPES: readonly BlockType[] = ['faq', 'steps', 'logoStrip', 'pricing', 'iconsGrid'];

/** A config field the Studio should expose as a plain text input. */
export interface ConfigField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: string[];
}

/** Per-block config field definitions for the Studio config editor. */
export const CONFIG_FIELDS: Partial<Record<BlockType, ConfigField[]>> = {
  cta: [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'buttonText', label: 'Button label' },
    { key: 'buttonHref', label: 'Button link' },
    { key: 'background', label: 'Background (color or gradient)', type: 'text' },
  ],
  video: [
    { key: 'src', label: 'Video URL (YouTube / Vimeo / .mp4)' },
    { key: 'caption', label: 'Caption (optional)' },
  ],
  image: [
    { key: 'src', label: 'Image URL' },
    { key: 'alt', label: 'Alt text' },
    { key: 'caption', label: 'Caption (optional)' },
  ],
  textImage: [
    { key: 'heading', label: 'Heading' },
    { key: 'body', label: 'Body text' },
    { key: 'image', label: 'Image URL' },
    { key: 'imageOnRight', label: 'Image side', type: 'select', options: ['right', 'left'] },
  ],
  quote: [
    { key: 'text', label: 'Quote' },
    { key: 'author', label: 'Author' },
    { key: 'role', label: 'Role / company' },
  ],
  divider: [],
  faq: [{ key: 'title', label: 'Title' }],
  steps: [{ key: 'title', label: 'Title' }],
  logoStrip: [{ key: 'title', label: 'Title' }],
  pricing: [{ key: 'title', label: 'Title' }],
  iconsGrid: [
    { key: 'title', label: 'Title' },
    { key: 'perRow', label: 'Items per row', type: 'number' },
  ],
};
