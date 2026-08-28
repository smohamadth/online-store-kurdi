/**
 * Page layout blocks.
 *
 * A CMS page (info | legal | help) is composed of an ordered list of
 * blocks instead of a single rich-text blob - the same block-based
 * model the home page builder uses, so the admin gets layout control
 * (headings, images, two columns, callouts, buttons, spacing) without
 * writing code.
 *
 * Storage: the API keeps the blocks as a JSON string column
 * (`Page.blocks`, the same JSON-as-string pattern as `dimensions`,
 * `metaKeywords` and blog `tags`). The editor and the storefront both
 * work with the parsed array; this module is the single place that
 * knows how to move between the two, and how to fall back to the
 * legacy `content` column for pages saved before blocks existed.
 */

export type PageBlockType =
  | 'richText'
  | 'heading'
  | 'image'
  | 'columns'
  | 'callout'
  | 'cta'
  | 'divider'
  | 'spacer';

export interface PageBlock {
  /** Stable client-generated id ("blk-..."). */
  id: string;
  type: PageBlockType;
  /** Type-specific fields. See the renderers in components/PageBlocks.tsx. */
  config: Record<string, any>;
}

export const PAGE_BLOCK_TYPES: PageBlockType[] = [
  'richText',
  'heading',
  'image',
  'columns',
  'callout',
  'cta',
  'divider',
  'spacer',
];

export const PAGE_BLOCK_LABELS: Record<PageBlockType, string> = {
  richText: 'Rich text',
  heading: 'Heading',
  image: 'Image',
  columns: 'Two columns',
  callout: 'Callout box',
  cta: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
};

const KNOWN_TYPES = new Set<string>(PAGE_BLOCK_TYPES);

/** Fresh id for a new block. Not cryptographic - just collision-avoiding. */
export function newBlockId(): string {
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parse the stored JSON column into a block list.
 *
 * Tolerant on purpose: a page must never fail to render because of a
 * half-written blocks column. Anything that is not a well-formed block
 * (bad JSON, not an array, wrong shape, unknown type) is dropped; a
 * page whose blocks column is empty/invalid falls back to its legacy
 * `content` by callers checking for an empty result.
 */
export function parsePageBlocks(raw: unknown): PageBlock[] {
  let arr: unknown = raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: PageBlock[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    if (typeof b.id !== 'string' || typeof b.type !== 'string') continue;
    if (!KNOWN_TYPES.has(b.type)) continue;
    out.push({
      id: b.id,
      type: b.type as PageBlockType,
      config: b.config && typeof b.config === 'object' ? (b.config as Record<string, any>) : {},
    });
  }
  return out;
}

/** Serialise blocks for the API. Empty list -> null (column stays empty). */
export function serializePageBlocks(blocks: PageBlock[] | null | undefined): string | null {
  if (!blocks || blocks.length === 0) return null;
  return JSON.stringify(
    blocks.map((b) => ({
      id: b.id,
      type: b.type,
      config: b.config ?? {},
    })),
  );
}

/**
 * Wrap legacy rich-text content as a single-block layout so the editor
 * shows exactly what the page currently renders.
 */
export function blocksFromLegacyContent(content: string | null | undefined): PageBlock[] {
  const text = (content || '').trim();
  if (!text) return [];
  return [{ id: newBlockId(), type: 'richText', config: { html: content } }];
}

/**
 * The legacy single-column view of a block layout: what used to live in
 * `content` for the parts that are plain text content. The editor syncs
 * this into the `content` column on every save, so a page whose blocks
 * are all deleted (or a stale client that only reads `content`) never
 * renders content the admin no longer asked for.
 *
 * Structural blocks (image, columns, divider, spacer, callout, cta)
 * contribute their readable text only - their layout has no
 * single-column equivalent.
 */
export function blocksToLegacyContent(blocks: PageBlock[] | null | undefined): string {
  if (!blocks || blocks.length === 0) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    const c = b.config || {};
    switch (b.type) {
      case 'richText':
        if (c.html) parts.push(c.html);
        break;
      case 'heading': {
        const level = c.level === 3 ? 3 : 2;
        if (c.text) parts.push(`<h${level}>${escapeHtml(String(c.text))}</h${level}>`);
        break;
      }
      case 'callout':
        if (c.text) parts.push(`<p>${escapeHtml(String(c.text))}</p>`);
        break;
      case 'cta':
        if (c.label && c.href) {
          parts.push(`<p><a href="${escapeHtml(String(c.href))}">${escapeHtml(String(c.label))}</a></p>`);
        }
        break;
      default:
        // image / columns / divider / spacer: no single-column equivalent.
        break;
    }
  }
  return parts.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
