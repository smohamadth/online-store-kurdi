/**
 * Unit tests for the dependency-free CSV parser/serializer used by the
 * bulk import/export feature (src/utils/csv.ts).
 *
 * Focus: the things a spreadsheet can produce - quoted fields with
 * embedded commas, doubled quotes, embedded newlines, CRLF endings and
 * trailing empty lines - plus a parse/serialise round-trip.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, serializeCsv } from '../../src/utils/csv';

describe('parseCsv', () => {
  it('parses a plain header + rows', () => {
    expect(parseCsv('name,sku,price\nWidget,W-1,9.99\nGadget,G-1,19.99')).toEqual([
      ['name', 'sku', 'price'],
      ['Widget', 'W-1', '9.99'],
      ['Gadget', 'G-1', '19.99'],
    ]);
  });

  it('quotes a field containing a comma', () => {
    expect(parseCsv('name,desc\nBig, "A, B and C"')).toEqual([
      ['name', 'desc'],
      ['Big', 'A, B and C'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsv('desc\n"He said ""hi"" to me"')).toEqual([['desc'], ['He said "hi" to me']]);
  });

  it('keeps embedded newlines inside a quoted field', () => {
    expect(parseCsv('desc\n"line one\nline two"')).toEqual([['desc'], ['line one\nline two']]);
  });

  it('accepts CRLF, CR and LF line endings', () => {
    expect(parseCsv('a,b\r\nc,d\re,f')).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']]);
  });

  it('drops a trailing empty line (spreadsheet export habit)', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\n1,2\n\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps a fully empty last cell but drops fully empty rows', () => {
    expect(parseCsv('a,b\n1,\n\n2,3')).toEqual([['a', 'b'], ['1', ''], ['2', '3']]);
  });

  it('handles a single column and a single cell', () => {
    expect(parseCsv('only')).toEqual([['only']]);
    expect(parseCsv('a\nb\nc')).toEqual([['a'], ['b'], ['c']]);
  });

  it('treats a quote mid-field as literal text (RFC 4180 only quotes at field start)', () => {
    expect(parseCsv('a\nab"cd')).toEqual([['a'], ['ab"cd']]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('serializeCsv', () => {
  it('joins cells and rows with the bare minimum quoting', () => {
    expect(serializeCsv([['a', 'b'], ['1', '2']])).toBe('a,b\n1,2\n');
  });

  it('quotes cells containing a comma, quote or newline', () => {
    expect(serializeCsv([['a, b', 'say "hi"', 'line1\nline2']])).toBe('"a, b","say ""hi""","line1\nline2"\n');
  });

  it('converts numbers/booleans to strings and null/undefined to empty', () => {
    expect(serializeCsv([[1, true, null, undefined]])).toBe('1,true,,\n');
  });

  it('round-trips a matrix through parseCsv', () => {
    const matrix: (string | number | boolean)[][] = [
      ['name', 'desc', 'price', 'active'],
      ['Widget, deluxe', 'He said "wow"\nand more', 9.99, true],
      ['', 'plain', 0, false],
    ];
    const text = serializeCsv(matrix);
    expect(parseCsv(text)).toEqual([
      ['name', 'desc', 'price', 'active'],
      ['Widget, deluxe', 'He said "wow"\nand more', '9.99', 'true'],
      ['', 'plain', '0', 'false'],
    ]);
  });
});
