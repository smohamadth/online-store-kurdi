import { describe, it, expect } from 'vitest';
import {
  renderReportPdf,
  renderReportCsv,
  formatDelta,
  ellipsize,
} from '../../../src/modules/analytics/report.renderers';
import type { SalesReport } from '../../../src/modules/analytics/report.service';

function makeReport(over: Partial<SalesReport> = {}): SalesReport {
  const delta = { current: 0, previous: 0, change: 0, percent: 0, direction: 'flat' as const };
  return {
    store: { name: 'Test Store', email: 'a@b.com', currencySymbol: '$' },
    range: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T00:00:00.000Z', days: 30, granularity: 'day' },
    generatedAt: '2024-02-01T00:00:00.000Z',
    totals: { revenue: 100, orders: 2, averageOrderValue: 50, unitsSold: 3, newCustomers: 1 },
    deltas: { revenue: delta, orders: delta, averageOrderValue: delta, newCustomers: delta },
    series: [{ date: '2024-01-01', label: '1 Jan', revenue: 100, orders: 2 }],
    ordersByStatus: { delivered: 2 },
    topProducts: [{ id: 'p1', name: 'Widget', sku: 'W-1', sold: 3, revenue: 100 }],
    topCustomers: [{ id: 'u1', name: 'Ada', email: 'ada@example.com', orders: 2, revenue: 100 }],
    lowStock: [{ id: 'p2', name: 'Scarce', sku: 'S-1', quantity: 1 }],
    payments: [{ method: 'cod', orders: 2, revenue: 100 }],
    ...over,
  };
}

describe('formatDelta', () => {
  it('says "no prior data" instead of inventing a percentage', () => {
    expect(formatDelta({ percent: null, direction: 'up' })).toBe('no prior data');
  });

  it('signs the change', () => {
    expect(formatDelta({ percent: 12.5, direction: 'up' })).toBe('+12.5% vs previous period');
    expect(formatDelta({ percent: -8, direction: 'down' })).toBe('-8% vs previous period');
  });

  // pdfkit's built-in Helvetica is WinAnsi-encoded: arrow glyphs render as
  // mojibake in the PDF. Verified by reading text back out of a rendered file.
  it('emits ASCII only, so the PDF font can encode it', () => {
    for (const d of [{ percent: 5, direction: 'up' }, { percent: -5, direction: 'down' },
      { percent: 0, direction: 'flat' }, { percent: null, direction: 'flat' }]) {
      expect(formatDelta(d)).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});

describe('renderReportPdf', () => {
  it('produces a valid PDF', async () => {
    const pdf = await renderReportPdf(makeReport());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders an empty store without throwing', async () => {
    const pdf = await renderReportPdf(makeReport({
      series: [], topProducts: [], topCustomers: [], lowStock: [], payments: [],
      ordersByStatus: {},
      totals: { revenue: 0, orders: 0, averageOrderValue: 0, unitsSold: 0, newCustomers: 0 },
    }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('paginates long tables', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i), name: `Product ${i}`, sku: `S-${i}`, sold: i, revenue: i * 10,
    }));
    const pdf = await renderReportPdf(makeReport({ topProducts: many }));
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pages).toBeGreaterThan(1);
  });

  it('survives a year of monthly buckets', async () => {
    const series = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      label: `M${i}`, revenue: i * 100, orders: i,
    }));
    const pdf = await renderReportPdf(makeReport({
      series, range: { from: '2024-01-01T00:00:00.000Z', to: '2024-12-31T00:00:00.000Z', days: 365, granularity: 'month' },
    }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('renderReportCsv', () => {
  it('includes every section and its figures', () => {
    const csv = renderReportCsv(makeReport());
    expect(csv).toContain('Summary');
    expect(csv).toContain('Top products');
    expect(csv).toContain('Top customers');
    expect(csv).toContain('Payment methods');
    expect(csv).toContain('Low stock');
    expect(csv).toContain('Widget');
    expect(csv).toContain('ada@example.com');
  });

  it('escapes commas and quotes so columns cannot shift', () => {
    const csv = renderReportCsv(makeReport({
      topProducts: [{ id: 'p', name: 'Chair, "Big"', sku: 'C,1', sold: 1, revenue: 5 }],
    }));
    expect(csv).toContain('"Chair, ""Big"""');
    expect(csv).toContain('"C,1"');
  });

  it('leaves the percent column blank rather than writing null', () => {
    const csv = renderReportCsv(makeReport({
      deltas: {
        revenue: { current: 1, previous: 0, change: 1, percent: null, direction: 'up' },
        orders: { current: 0, previous: 0, change: 0, percent: null, direction: 'flat' },
        averageOrderValue: { current: 0, previous: 0, change: 0, percent: null, direction: 'flat' },
        newCustomers: { current: 0, previous: 0, change: 0, percent: null, direction: 'flat' },
      },
    }));
    expect(csv).not.toContain('null');
  });
});

describe('ellipsize', () => {
  // A fake doc: 10 points per character, so widths are predictable.
  const doc = { widthOfString: (s: string) => s.length * 10 };

  it('leaves text that fits untouched', () => {
    expect(ellipsize(doc, 'short', 100)).toBe('short');
  });

  it('truncates with an ellipsis when too wide', () => {
    const out = ellipsize(doc, 'abcdefghij', 50);
    expect(out.endsWith('…')).toBe(true);
    expect(doc.widthOfString(out)).toBeLessThanOrEqual(50);
  });

  // An over-long name used to render past its column and strike through the
  // row beneath it once a Unicode font made wrapping possible.
  it('never returns something wider than the column', () => {
    for (const w of [10, 25, 50, 200]) {
      const out = ellipsize(doc, 'a'.repeat(80), w);
      expect(doc.widthOfString(out)).toBeLessThanOrEqual(w);
    }
  });

  it('falls back to the raw text if measuring throws', () => {
    const bad = { widthOfString: () => { throw new Error('bad glyph'); } };
    expect(ellipsize(bad, 'text', 10)).toBe('text');
  });

  it('handles null and empty input', () => {
    expect(ellipsize(doc, '' as any, 50)).toBe('');
    expect(ellipsize(doc, null as any, 50)).toBe('');
  });
});
