/**
 * Shared content-block storage helpers for the CMS.
 *
 * Pages and blog posts both store a `blocks` JSON string column
 * (array of { id, type, config }). The web app parses it into a block
 * list; the API owns the write-side concerns in one place so both
 * content types stay consistent:
 *
 *   - serialise the list to the JSON column (empty list -> null, so
 *     the column stays empty and the storefront falls back to the
 *     legacy `content` column);
 *   - sanitise the HTML-bearing block fields ON WRITE (same
 *     sanitiser as `content` - never store what the storefront might
 *     dangerouslySetInnerHTML);
 *   - parse the column back to an array (or null) on read so no
 *     client has to JSON.parse and swallow its own errors.
 */
import { sanitizeRichText } from './sanitizeRichText';

/**
 * Sanitise the HTML fields of a block list, then serialise it to the
 * JSON string column. Block config carries the same kind of admin
 * markup as `content` (richText / two-column HTML), so it gets the
 * same on-write sanitisation.
 */
export function serializeContentBlocks(blocks: unknown): string | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const cleaned = blocks
    .map((b: any) => {
      if (!b || typeof b !== 'object' || typeof b.id !== 'string' || typeof b.type !== 'string') {
        return null;
      }
      const config: Record<string, any> = {
        ...(b.config && typeof b.config === 'object' ? b.config : {}),
      };
      if (b.type === 'richText' && typeof config.html === 'string') {
        config.html = sanitizeRichText(config.html);
      }
      if (b.type === 'columns') {
        if (typeof config.left === 'string') config.left = sanitizeRichText(config.left);
        if (typeof config.right === 'string') config.right = sanitizeRichText(config.right);
      }
      return { id: b.id, type: b.type, config };
    })
    .filter(Boolean);
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

/**
 * Parse the `blocks` JSON string column into an array (or null when
 * empty/invalid), so no client has to JSON.parse and swallow its own
 * errors.
 */
export function parseBlocksColumn(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Rows come back with `blocks` as a JSON string column; hand every
 * client a parsed array (or null) instead of making each one
 * JSON.parse and swallow its own errors.
 */
export function withParsedBlocks<T>(row: T | null | undefined): T | null | undefined {
  if (!row) return row;
  return { ...(row as any), blocks: parseBlocksColumn((row as any).blocks) };
}
