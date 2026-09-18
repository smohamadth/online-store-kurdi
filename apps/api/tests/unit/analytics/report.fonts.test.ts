import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import {
  fontCandidates,
  resolveUnicodeFont,
  resetFontCache,
  needsUnicodeFont,
} from '../../../src/modules/analytics/report.fonts';

beforeEach(() => resetFontCache());

describe('needsUnicodeFont', () => {
  // pdfkit's built-in Helvetica is WinAnsi-encoded and silently DROPS
  // anything outside Latin-1 - Kurdish and Arabic names rendered blank.
  it('flags Kurdish and Arabic', () => {
    expect(needsUnicodeFont('کوردی')).toBe(true);
    expect(needsUnicodeFont('ئازاد محەمەد')).toBe(true);
    expect(needsUnicodeFont('العربية')).toBe(true);
  });

  it('does not flag Latin-1, including accents the built-in font covers', () => {
    expect(needsUnicodeFont('Kurdî Store')).toBe(false);
    expect(needsUnicodeFont('plain ascii $1,234.56')).toBe(false);
  });

  it('tolerates empty input', () => {
    expect(needsUnicodeFont('')).toBe(false);
    expect(needsUnicodeFont(undefined as any)).toBe(false);
  });
});

describe('fontCandidates', () => {
  it('puts an explicit REPORT_PDF_FONT first', () => {
    const list = fontCandidates({ REPORT_PDF_FONT: '/custom/Sorani.ttf' } as any);
    expect(list[0]).toBe('/custom/Sorani.ttf');
  });

  it('still offers system fallbacks when nothing is configured', () => {
    const list = fontCandidates({} as any);
    expect(list.length).toBeGreaterThan(2);
    expect(list.some((p) => p.includes('DejaVuSans.ttf'))).toBe(true);
  });
});

describe('resolveUnicodeFont', () => {
  it('returns either a real readable file or null - never a guess', () => {
    const resolved = resolveUnicodeFont({} as any);
    if (resolved === null) return; // no system font here; the caller falls back
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('ignores an unreadable configured path and falls through', () => {
    resetFontCache();
    const resolved = resolveUnicodeFont({ REPORT_PDF_FONT: '/definitely/not/here.ttf' } as any);
    // Either a system font was found, or null - never the bogus path.
    expect(resolved).not.toBe('/definitely/not/here.ttf');
    if (resolved) expect(fs.existsSync(resolved)).toBe(true);
  });
});
