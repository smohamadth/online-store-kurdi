/**
 * CSV formula-injection guards (utils/csv serialize + import round-trip).
 *
 * Exporting admin data (product names, customer names from orders) to CSV
 * must not produce cells that Excel/Sheets evaluates as formulas, and
 * re-importing an export must not leave the protective apostrophe behind.
 */
import { describe, it, expect } from 'vitest';
import { serializeCsv } from '../../../src/utils/csv';
import { readStrCell } from '../../../src/modules/importExport/mappers';

describe('serializeCsv — formula injection', () => {
  it('prefixes cells starting with =, +, @, tab and CR', () => {
    const csv = serializeCsv([
      ['name'],
      ['=HYPERLINK("http://evil","x")'],
      ['+cmd|' + "'" + ' /C calc!A0'],
      ['@SUM(A1:A2)'],
      ['\t=1+1'],
    ]);
    // The HYPERLINK cell contains commas+quotes, so it is also CSV-quoted —
    // assert on the prefix that must survive quoting.
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("'+cmd|' /C calc!A0");
    expect(csv).toContain("'@SUM(A1:A2)");
    expect(csv).toContain("'\t=1+1");
  });

  it('prefixes a minus only when it is not a negative number', () => {
    expect(serializeCsv([['v'], ['-5']])).toContain('-5');
    expect(serializeCsv([['v'], ['-3.14']])).toContain('-3.14');
    // "-foo" would parse as a formula error / name in Excel.
    expect(serializeCsv([['v'], ['-foo']])).toContain("'-foo");
  });

  it('leaves ordinary values untouched', () => {
    const csv = serializeCsv([
      ['name', 'price', 'notes'],
      ['T-Shirt', 19.99, 'summer, 2026'],
      ['Mug', 9.5, 'plain'],
    ]);
    expect(csv).toContain('T-Shirt,19.99,"summer, 2026"');
    expect(csv).not.toContain("'T-Shirt");
  });
});

describe('readStrCell — export/import round-trip', () => {
  it('strips the protective apostrophe when it guards a formula char', () => {
    expect(readStrCell({ name: "'=1+1" }, 'name')).toBe('=1+1');
    expect(readStrCell({ name: "'@SUM(A1)" }, 'name')).toBe('@SUM(A1)');
    expect(readStrCell({ name: "'-cmd" }, 'name')).toBe('-cmd');
  });

  it('keeps a legitimate leading apostrophe in normal words', () => {
    // "'tis" is a real word; only the formula-guard prefix is stripped.
    expect(readStrCell({ name: "'tis the season" }, 'name')).toBe("'tis the season");
    expect(readStrCell({ name: "'-5" }, 'name')).toBe("'-5"); // not a formula
  });
});
