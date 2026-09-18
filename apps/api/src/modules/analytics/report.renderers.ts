/**
 * Admin sales report renderers: PDF and CSV.
 *
 * The PDF uses pdfkit, already a dependency for order receipts
 * (`orders/receipt.renderers.ts`) — a pure-JS library with no native binaries
 * or headless browser, so generating a report cannot fail on a machine that
 * couldn't install Chromium.
 *
 * Kept free of Prisma imports so it can be unit-tested against a literal
 * report object, the same split the receipt renderers use.
 */
import PDFDocument from 'pdfkit';
import type { SalesReport } from './report.service';
import { toBarHeights } from './report.helpers';

// A4 at pdfkit's default 72dpi, with a 50pt margin: content spans x=50..545.
const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;
/** Re-flow to a new page below this Y rather than writing into the margin. */
const PAGE_BOTTOM = 760;

function fmtMoney(symbol: string, n: number): string {
  return `${symbol}${(Number(n) || 0).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toISOString().slice(0, 10);
}

/**
 * Render a delta as human text.
 *
 * The null-percent case is the whole reason the old UI was wrong: with no
 * prior data there is no percentage to quote, so say so instead of inventing
 * one.
 */
export function formatDelta(d: { percent: number | null; direction: string }): string {
  if (d.percent === null) return 'no prior data';
  // ASCII only. pdfkit's built-in Helvetica is WinAnsi-encoded and has no
  // glyphs for the arrows used in the web UI - rendering "↑" produced the
  // literal mojibake "!‘" in the generated file. Verified by rasterising the
  // PDF and reading the text back, not by assumption.
  const sign = d.direction === 'up' ? '+' : d.direction === 'down' ? '-' : '';
  return `${sign}${Math.abs(d.percent)}% vs previous period`;
}

/** CSV escaping: quote anything containing a delimiter, quote, or newline. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Flatten the report to CSV.
 *
 * Several logical tables in one file, separated by blank lines and section
 * headers. Spreadsheets handle that fine and it keeps the export to a single
 * download rather than a zip.
 */
export function renderReportCsv(r: SalesReport): string {
  const rows: unknown[][] = [];
  const money = (n: number) => (Number(n) || 0).toFixed(2);

  rows.push([`${r.store.name} - sales report`]);
  rows.push(['from', fmtDate(r.range.from), 'to', fmtDate(r.range.to)]);
  rows.push(['generated', r.generatedAt]);
  rows.push([]);

  rows.push(['Summary']);
  rows.push(['metric', 'value', 'previous', 'change', 'percent']);
  const d = r.deltas;
  rows.push(['Revenue', money(r.totals.revenue), money(d.revenue.previous),
    money(d.revenue.change), d.revenue.percent ?? '']);
  rows.push(['Orders', r.totals.orders, d.orders.previous, d.orders.change,
    d.orders.percent ?? '']);
  rows.push(['Average order value', money(r.totals.averageOrderValue),
    money(d.averageOrderValue.previous), money(d.averageOrderValue.change),
    d.averageOrderValue.percent ?? '']);
  rows.push(['New customers', r.totals.newCustomers, d.newCustomers.previous,
    d.newCustomers.change, d.newCustomers.percent ?? '']);
  rows.push(['Units sold', r.totals.unitsSold]);
  rows.push([]);

  rows.push([`Revenue by ${r.range.granularity}`]);
  rows.push(['period', 'revenue', 'orders']);
  for (const b of r.series) rows.push([b.date, money(b.revenue), b.orders]);
  rows.push([]);

  rows.push(['Orders by status']);
  rows.push(['status', 'orders']);
  for (const [status, count] of Object.entries(r.ordersByStatus)) rows.push([status, count]);
  rows.push([]);

  rows.push(['Top products']);
  rows.push(['product', 'sku', 'units', 'revenue']);
  for (const p of r.topProducts) rows.push([p.name, p.sku ?? '', p.sold, money(p.revenue)]);
  rows.push([]);

  rows.push(['Top customers']);
  rows.push(['customer', 'email', 'orders', 'revenue']);
  for (const c of r.topCustomers) rows.push([c.name, c.email, c.orders, money(c.revenue)]);
  rows.push([]);

  rows.push(['Payment methods']);
  rows.push(['method', 'orders', 'revenue']);
  for (const p of r.payments) rows.push([p.method, p.orders, money(p.revenue)]);
  rows.push([]);

  rows.push(['Low stock']);
  rows.push(['product', 'sku', 'quantity']);
  for (const p of r.lowStock) rows.push([p.name, p.sku ?? '', p.quantity]);

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

/** Render the report as a PDF and resolve the bytes. */
export function renderReportPdf(r: SalesReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const sym = r.store.currencySymbol;

    /** Start a new page if `needed` points won't fit below the cursor. */
    const ensure = (needed: number) => {
      if (doc.y + needed > PAGE_BOTTOM) doc.addPage();
    };

    const rule = (color = '#e5e5e5') => {
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(color).lineWidth(1).stroke();
    };

    const heading = (text: string) => {
      ensure(60);
      doc.moveDown(1);
      doc.fontSize(13).fillColor('#111').text(text, LEFT);
      doc.moveDown(0.3);
      rule();
      doc.moveDown(0.5);
    };

    // ---- header -------------------------------------------------------
    doc.fontSize(20).fillColor('#111').text(r.store.name, LEFT, 50);
    doc.fontSize(10).fillColor('#6b7280')
      .text('Sales report', LEFT)
      .text(`${fmtDate(r.range.from)} to ${fmtDate(r.range.to)}  (${r.range.days} days)`, LEFT)
      .text(`Generated ${fmtDate(r.generatedAt)}`, LEFT);
    if (r.store.email) doc.text(r.store.email, LEFT);
    doc.moveDown(0.5);
    rule('#111');

    // ---- KPI cards ----------------------------------------------------
    heading('Summary');
    const cards: [string, string, string][] = [
      ['Revenue', fmtMoney(sym, r.totals.revenue), formatDelta(r.deltas.revenue)],
      ['Orders', String(r.totals.orders), formatDelta(r.deltas.orders)],
      ['Avg order value', fmtMoney(sym, r.totals.averageOrderValue),
        formatDelta(r.deltas.averageOrderValue)],
      ['New customers', String(r.totals.newCustomers), formatDelta(r.deltas.newCustomers)],
    ];
    const cardW = WIDTH / 2;
    let cardY = doc.y;
    cards.forEach(([label, value, delta], i) => {
      const x = LEFT + (i % 2) * cardW;
      if (i % 2 === 0 && i > 0) cardY += 58;
      doc.fontSize(9).fillColor('#6b7280').text(label, x, cardY, { width: cardW - 10 });
      doc.fontSize(17).fillColor('#111').text(value, x, cardY + 12, { width: cardW - 10 });
      doc.fontSize(8).fillColor('#6b7280').text(delta, x, cardY + 34, { width: cardW - 10 });
    });
    doc.y = cardY + 62;
    doc.x = LEFT;
    doc.fontSize(9).fillColor('#6b7280')
      .text(`Units sold: ${r.totals.unitsSold}. Revenue excludes cancelled and refunded orders.`,
        LEFT, doc.y, { width: WIDTH });

    // ---- revenue chart ------------------------------------------------
    heading(`Revenue by ${r.range.granularity}`);
    if (r.series.length === 0) {
      doc.fontSize(10).fillColor('#6b7280').text('No orders in this period.', LEFT);
    } else {
      const heights = toBarHeights(r.series);
      const chartH = 120;
      const top = doc.y;
      const gap = 3;
      const barW = Math.max(2, (WIDTH - gap * (r.series.length - 1)) / r.series.length);
      const baseline = top + chartH;

      r.series.forEach((b, i) => {
        const x = LEFT + i * (barW + gap);
        const h = Math.max(1, (heights[i] / 100) * chartH);
        doc.rect(x, baseline - h, barW, h).fill(b.revenue > 0 ? '#3b82f6' : '#e5e5e5');
      });

      doc.strokeColor('#e5e5e5').moveTo(LEFT, baseline).lineTo(RIGHT, baseline).stroke();

      // Label only as many ticks as will fit legibly.
      const step = Math.ceil(r.series.length / 12);
      doc.fontSize(7).fillColor('#6b7280');
      r.series.forEach((b, i) => {
        if (i % step !== 0) return;
        doc.text(b.label, LEFT + i * (barW + gap), baseline + 4,
          { width: barW * step + gap, align: 'left', lineBreak: false });
      });

      doc.y = baseline + 20;
      doc.x = LEFT;
      const peak = r.series.reduce((m, b) => (b.revenue > m.revenue ? b : m), r.series[0]);
      doc.fontSize(8).fillColor('#6b7280').text(
        `Peak: ${peak.label} at ${fmtMoney(sym, peak.revenue)}.`, LEFT, doc.y, { width: WIDTH });
    }

    // ---- reusable table ----------------------------------------------
    const table = (
      cols: { title: string; width: number; align?: 'left' | 'right' }[],
      data: (string | number)[][],
      empty: string,
    ) => {
      if (data.length === 0) {
        doc.fontSize(10).fillColor('#6b7280').text(empty, LEFT);
        return;
      }
      const header = () => {
        const y = doc.y;
        let x = LEFT;
        doc.fontSize(9).fillColor('#6b7280');
        for (const c of cols) {
          doc.text(c.title, x, y, { width: c.width, align: c.align ?? 'left', lineBreak: false });
          x += c.width;
        }
        doc.y = y + 14;
        rule();
        doc.moveDown(0.3);
      };
      header();
      for (const row of data) {
        // Repeat the header after a page break: a bare table continuing on
        // page 2 with no column titles is unreadable in print.
        if (doc.y + 16 > PAGE_BOTTOM) {
          doc.addPage();
          header();
        }
        const y = doc.y;
        let x = LEFT;
        doc.fontSize(9.5).fillColor('#111');
        row.forEach((cell, i) => {
          const c = cols[i];
          doc.text(String(cell), x, y, { width: c.width, align: c.align ?? 'left', lineBreak: false });
          x += c.width;
        });
        doc.y = y + 15;
      }
    };

    heading('Top products');
    table(
      [{ title: 'PRODUCT', width: 250 }, { title: 'SKU', width: 105 },
        { title: 'UNITS', width: 60, align: 'right' }, { title: 'REVENUE', width: 80, align: 'right' }],
      r.topProducts.map((p) => [p.name, p.sku ?? '-', p.sold, fmtMoney(sym, p.revenue)]),
      'No product sales in this period.',
    );

    heading('Top customers');
    table(
      [{ title: 'CUSTOMER', width: 170 }, { title: 'EMAIL', width: 185 },
        { title: 'ORDERS', width: 60, align: 'right' }, { title: 'REVENUE', width: 80, align: 'right' }],
      r.topCustomers.map((c) => [c.name, c.email, c.orders, fmtMoney(sym, c.revenue)]),
      'No customer orders in this period.',
    );

    heading('Orders by status');
    table(
      [{ title: 'STATUS', width: 395 }, { title: 'ORDERS', width: 100, align: 'right' }],
      Object.entries(r.ordersByStatus).map(([s, n]) => [s, n]),
      'No orders in this period.',
    );

    heading('Payment methods');
    table(
      [{ title: 'METHOD', width: 315 }, { title: 'ORDERS', width: 80, align: 'right' },
        { title: 'REVENUE', width: 100, align: 'right' }],
      r.payments.map((p) => [p.method, p.orders, fmtMoney(sym, p.revenue)]),
      'No payments in this period.',
    );

    heading('Low stock (5 or fewer)');
    table(
      [{ title: 'PRODUCT', width: 315 }, { title: 'SKU', width: 100 },
        { title: 'QTY', width: 80, align: 'right' }],
      r.lowStock.map((p) => [p.name, p.sku ?? '-', p.quantity]),
      'No products are low on stock.',
    );

    doc.end();
  });
}
