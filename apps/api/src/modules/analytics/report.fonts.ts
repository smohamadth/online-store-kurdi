/**
 * Unicode font resolution for generated PDFs.
 *
 * WHY THIS EXISTS
 * ---------------
 * pdfkit's built-in Helvetica is WinAnsi-encoded: it covers Latin-1 and
 * nothing else. It does not throw on Kurdish or Arabic text — it silently
 * DROPS the glyphs. A report for a store called "کوردی" with a customer named
 * "ئازاد محەمەد" rendered those cells blank, and nothing in the logs said so.
 *
 * That is unacceptable here specifically: the README positions this project as
 * Kurdish-first (Sorani/Arabic/Persian/Turkish, RTL). The store's own primary
 * audience is exactly the one whose names vanish.
 *
 * WHAT THIS DOES
 * --------------
 * Finds a TrueType font with Arabic-script coverage and registers it so the
 * renderer can embed it. Resolution order:
 *   1. REPORT_PDF_FONT — an explicit path, for operators who want a specific
 *      face (e.g. a proper Sorani font with better shaping than DejaVu).
 *   2. A bundled font at apps/api/assets/fonts, if one has been added.
 *   3. Common system locations (DejaVu ships on most Linux images, including
 *      the CI runner and the project's Docker base).
 * If none is found it returns null and the caller keeps using Helvetica, so a
 * Latin-only store still gets a report rather than a crash.
 *
 * KNOWN LIMITATION
 * ----------------
 * pdfkit does not implement the Unicode bidirectional algorithm. Arabic-script
 * glyphs are embedded and shaped by the font, but a string mixing RTL and LTR
 * runs can appear in logical rather than visual order. Fully correct RTL
 * layout needs a shaping/bidi pass (e.g. harfbuzz) or an HTML-to-PDF pipeline.
 * Embedding the font is the difference between "imperfect word order" and
 * "the name is simply not there", which is the trade being made.
 */
import fs from 'fs';
import path from 'path';

/** Candidate paths, in priority order. First readable file wins. */
export function fontCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const list: string[] = [];
  if (env.REPORT_PDF_FONT) list.push(env.REPORT_PDF_FONT);
  list.push(path.join(__dirname, '../../../assets/fonts/NotoSansArabic-Regular.ttf'));
  list.push(path.join(__dirname, '../../../assets/fonts/DejaVuSans.ttf'));
  list.push(
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  );
  return list;
}

/** Candidate paths for a bold face, in priority order. */
export function boldFontCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const list: string[] = [];
  if (env.REPORT_PDF_FONT_BOLD) list.push(env.REPORT_PDF_FONT_BOLD);
  list.push(path.join(__dirname, '../../../assets/fonts/DejaVuSans-Bold.ttf'));
  list.push(
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  );
  return list;
}

let cached: string | null | undefined;
let cachedBold: string | null | undefined;

function firstReadable(paths: string[]): string | null {
  for (const candidate of paths) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Unreadable path (permissions, broken symlink): try the next one.
    }
  }
  return null;
}

/**
 * Path to a usable bold Unicode font, or null.
 *
 * Falls back to the regular face when no bold file exists, so headings stay
 * legible (just not bold) rather than reverting to Helvetica mid-document,
 * which would drop the very glyphs we embedded a font to keep.
 */
export function resolveUnicodeBoldFont(env: NodeJS.ProcessEnv = process.env): string | null {
  if (cachedBold !== undefined) return cachedBold;
  cachedBold = firstReadable(boldFontCandidates(env)) ?? resolveUnicodeFont(env);
  return cachedBold;
}

/**
 * Path to a usable Unicode font, or null if none is installed.
 * Cached: this touches the filesystem and a report renders many text runs.
 */
export function resolveUnicodeFont(env: NodeJS.ProcessEnv = process.env): string | null {
  if (cached !== undefined) return cached;
  cached = firstReadable(fontCandidates(env));
  return cached;
}

/** Test seam: drop the memoised lookup. */
export function resetFontCache(): void {
  cached = undefined;
  cachedBold = undefined;
}

/**
 * True when the text needs a Unicode font — i.e. contains anything the
 * built-in WinAnsi encoding cannot represent.
 */
export function needsUnicodeFont(text: string): boolean {
  return /[^\u0000-\u00ff]/.test(text || '');
}
