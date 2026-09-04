/**
 * On-write sanitisation for Home builder configs and Theme Studio block configs.
 *
 * HTML-bearing fields go through sanitizeRichText. Link/media fields are
 * allowlisted (http(s)/relative, plus mailto/tel for links). Unsafe schemes
 * are stored as empty strings so a save still succeeds without persisting XSS.
 */
import { sanitizeRichText } from './sanitizeRichText';
import { isSafeLinkUrl, isSafeMediaUrl } from './safeUrl';

const HTML_KEYS = new Set(['html', 'quote', 'description', 'a', 'text', 'content']);
const LINK_KEYS = new Set(['linkUrl', 'buttonHref', 'linkHref', 'href']);
const MEDIA_KEYS = new Set(['image', 'src', 'poster', 'url']);

export function scrubBuilderConfig(config: Record<string, unknown>): Record<string, unknown> {
  return scrubNode(config) as Record<string, unknown>;
}

function scrubNode(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubNode(item, parentKey));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && parentKey === 'values') {
      return sanitizeRichText(value);
    }
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') {
      if (HTML_KEYS.has(k)) out[k] = sanitizeRichText(v);
      else if (LINK_KEYS.has(k)) out[k] = isSafeLinkUrl(v) ? v : '';
      else if (MEDIA_KEYS.has(k)) out[k] = isSafeMediaUrl(v) ? v : '';
      else out[k] = v;
    } else {
      out[k] = scrubNode(v, k);
    }
  }
  return out;
}

/** Walk Theme Studio `layouts.<page>.blocks[].config`. */
export function scrubStudioLayouts(
  layouts: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!layouts) return layouts;
  const out: Record<string, unknown> = {};
  for (const [page, layout] of Object.entries(layouts)) {
    if (!layout || typeof layout !== 'object') {
      out[page] = layout;
      continue;
    }
    const L = layout as { blocks?: unknown };
    if (!Array.isArray(L.blocks)) {
      out[page] = layout;
      continue;
    }
    out[page] = {
      ...L,
      blocks: L.blocks.map((b) => {
        if (!b || typeof b !== 'object') return b;
        const block = b as { config?: unknown };
        if (!block.config || typeof block.config !== 'object') return b;
        return { ...block, config: scrubBuilderConfig(block.config as Record<string, unknown>) };
      }),
    };
  }
  return out;
}
