/**
 * Pure receipt renderers.
 *
 * Extracted from `receipt.service.ts` so the unit tests can import
 * them without dragging in the prisma client (which fails to
 * load outside the integration test environment).
 *
 * Two formats are supported: HTML (used by the printable receipt
 * page; no extra deps) and PDF (rendered with pdfkit). The data
 * shape they consume is the same `ReceiptData` defined in the
 * service module; the service re-exports the type for callers.
 */
import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface ReceiptItem {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isBackorder: boolean;
}

export interface ReceiptAddress {
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone?: string | null;
}

export interface ReceiptData {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    paymentMethod?: string | null;
    createdAt: string;
    shippedAt?: string | null;
    trackingNumber?: string | null;
    customerNote?: string | null;
  };
  customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  items: ReceiptItem[];
  shippingAddress: ReceiptAddress | null;
  billingAddress: ReceiptAddress | null;
  totals: {
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
  };
  store: {
    name: string;
    address?: string;
    email?: string;
    url: string;
  };
  documentType: 'receipt';
}

// ---------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function renderAddressBlock(label: string, addr: ReceiptAddress | null): string {
  if (!addr) {
    return `
      <div class="addr">
        <h3>${esc(label)}</h3>
        <p class="muted">Not provided</p>
      </div>`;
  }
  const lines = [
    `${addr.firstName} ${addr.lastName}`,
    addr.addressLine1,
    addr.addressLine2,
    `${addr.city}, ${addr.state} ${addr.zipCode}`,
    addr.country,
    addr.phone ? `Phone: ${addr.phone}` : null,
  ].filter(Boolean);
  return `
    <div class="addr">
      <h3>${esc(label)}</h3>
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>`;
}

/**
 * Render the receipt as a self-contained HTML document. Includes
 * a small `<style>` block so the page looks right when printed
 * (paper size, margins, no header/footer chrome).
 */
export function renderReceiptHtml(d: ReceiptData): string {
  const rows = d.items.map((it) => `
    <tr>
      <td>
        <div class="item-name">${esc(it.name)}</div>
        ${it.sku ? `<div class="item-sku">SKU: ${esc(it.sku)}</div>` : ''}
        ${it.isBackorder ? `<div class="item-badge">Pre-order</div>` : ''}
      </td>
      <td class="num">${it.quantity}</td>
      <td class="num">${fmtMoney(it.unitPrice)}</td>
      <td class="num">${fmtMoney(it.totalPrice)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt ${esc(d.order.orderNumber)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; max-width: 800px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; margin: 24px 0 8px; }
    h3 { font-size: 13px; margin: 0 0 4px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #111; }
    .store-name { font-size: 18px; font-weight: 700; }
    .store-meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .doc-type { text-align: right; }
    .doc-type .label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
    .doc-type .number { font-size: 16px; font-weight: 600; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 16px 0; font-size: 13px; }
    .meta-row { display: flex; justify-content: space-between; }
    .meta-row .k { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; padding: 8px 0; border-bottom: 1px solid #e5e5e5; }
    th.num, td.num { text-align: right; }
    td { padding: 8px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; font-size: 13px; }
    .item-name { font-weight: 500; }
    .item-sku { font-size: 11px; color: #6b7280; font-family: monospace; }
    .item-badge { display: inline-block; margin-top: 4px; padding: 1px 6px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 10px; text-transform: uppercase; }
    .totals { margin-top: 12px; }
    .totals .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .totals .row.total { border-top: 1px solid #111; margin-top: 4px; padding-top: 8px; font-size: 16px; font-weight: 700; }
    .addrs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 8px; font-size: 13px; }
    .addr p { margin: 0 0 2px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #6b7280; text-align: center; }
    .muted { color: #6b7280; font-style: italic; }
    .no-print { margin: 0 0 16px; }
    .no-print button { padding: 8px 16px; background: #111; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">🖨 Print or save as PDF</button>
    <a href="/api/orders/${esc(d.order.id)}/receipt.pdf" style="margin-left:8px;font-size:13px;">Download PDF</a>
  </div>
  <div class="header">
    <div>
      <div class="store-name">${esc(d.store.name)}</div>
      ${d.store.address ? `<div class="store-meta">${esc(d.store.address)}</div>` : ''}
      ${d.store.email ? `<div class="store-meta">${esc(d.store.email)}</div>` : ''}
    </div>
    <div class="doc-type">
      <div class="label">${esc(d.documentType)}</div>
      <div class="number">#${esc(d.order.orderNumber)}</div>
      <div class="store-meta">${fmtDate(d.order.createdAt)}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="meta-row"><span class="k">Bill to</span></div>
      <div><strong>${esc(d.customer.firstName)} ${esc(d.customer.lastName)}</strong></div>
      <div class="store-meta">${esc(d.customer.email)}</div>
    </div>
    <div>
      <div class="meta-row"><span class="k">Status</span><span>${esc(d.order.status)}</span></div>
      <div class="meta-row"><span class="k">Payment</span><span>${esc(d.order.paymentStatus)}</span></div>
      ${d.order.paymentMethod ? `<div class="meta-row"><span class="k">Method</span><span>${esc(d.order.paymentMethod)}</span></div>` : ''}
      ${d.order.trackingNumber ? `<div class="meta-row"><span class="k">Tracking</span><span>${esc(d.order.trackingNumber)}</span></div>` : ''}
    </div>
  </div>

  <h2>Items</h2>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmtMoney(d.totals.subtotal)}</span></div>
    ${d.totals.discount > 0 ? `<div class="row"><span>Discount</span><span>-${fmtMoney(d.totals.discount)}</span></div>` : ''}
    <div class="row"><span>Shipping</span><span>${d.totals.shipping === 0 ? 'Free' : fmtMoney(d.totals.shipping)}</span></div>
    <div class="row"><span>Tax</span><span>${fmtMoney(d.totals.tax)}</span></div>
    <div class="row total"><span>Total</span><span>${fmtMoney(d.totals.total)}</span></div>
  </div>

  <div class="addrs">
    ${renderAddressBlock('Shipping address', d.shippingAddress)}
    ${renderAddressBlock('Billing address', d.billingAddress)}
  </div>

  ${d.order.customerNote ? `
    <h2>Note</h2>
    <p style="font-size:13px;color:#374151;">${esc(d.order.customerNote)}</p>
  ` : ''}

  <div class="footer">
    Thank you for your business. Questions? Contact ${esc(d.store.email || d.store.name)}.
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------

/**
 * Render the receipt as a PDF and return the bytes. The
 * implementation uses pdfkit's document API: pipe the document
 * into a buffer, then return the buffer.
 */
export function renderReceiptPdf(d: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header: store + receipt number on a single row
    doc.fontSize(20).text(d.store.name, { continued: true });
    doc.fontSize(10).fillColor('#6b7280').text(`   Receipt #${d.order.orderNumber}`, { align: 'right' });
    doc.moveDown(0.3);
    if (d.store.address) doc.fontSize(9).fillColor('#6b7280').text(d.store.address);
    if (d.store.email) doc.fontSize(9).fillColor('#6b7280').text(d.store.email);
    doc.moveDown();
    doc.fillColor('#111').strokeColor('#111').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();

    doc.moveDown(0.5);
    doc.fontSize(11);
    const col1 = 50;
    const col2 = 300;

    doc.fontSize(9).fillColor('#6b7280').text('BILL TO', col1, doc.y);
    doc.fontSize(11).fillColor('#111').text(`${d.customer.firstName} ${d.customer.lastName}`, col1);
    doc.fontSize(9).fillColor('#6b7280').text(d.customer.email, col1);

    const yStart = doc.y - 28;
    doc.fontSize(9).fillColor('#6b7280').text('ORDER', col2, yStart);
    doc.fontSize(11).fillColor('#111').text(d.order.orderNumber, col2);
    doc.fontSize(9).fillColor('#6b7280').text(`Date: ${fmtDate(d.order.createdAt)}`, col2);
    doc.fontSize(9).fillColor('#6b7280').text(`Status: ${d.order.status}`, col2);
    doc.fontSize(9).fillColor('#6b7280').text(`Payment: ${d.order.paymentStatus}`, col2);
    if (d.order.paymentMethod) {
      doc.fontSize(9).fillColor('#6b7280').text(`Method: ${d.order.paymentMethod}`, col2);
    }
    if (d.order.trackingNumber) {
      doc.fontSize(9).fillColor('#6b7280').text(`Tracking: ${d.order.trackingNumber}`, col2);
    }
    doc.moveDown();

    // Items table
    doc.moveDown(1);
    const tableTop = doc.y;
    const col = { item: 50, qty: 360, unit: 410, total: 480 };
    doc.fontSize(9).fillColor('#6b7280');
    doc.text('ITEM', col.item, tableTop);
    doc.text('QTY', col.qty, tableTop, { width: 45, align: 'right' });
    doc.text('UNIT', col.unit, tableTop, { width: 65, align: 'right' });
    doc.text('TOTAL', col.total, tableTop, { width: 65, align: 'right' });
    doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#e5e5e5').stroke();
    doc.moveDown(1);

    doc.fillColor('#111');
    for (const it of d.items) {
      const startY = doc.y;
      doc.fontSize(11).text(it.name, col.item, startY, { width: 300 });
      if (it.sku) {
        doc.fontSize(8).fillColor('#6b7280').text(`SKU: ${it.sku}`, col.item, doc.y);
      }
      if (it.isBackorder) {
        doc.fontSize(8).fillColor('#92400e').text('Pre-order', col.item, doc.y);
      }
      doc.fillColor('#111').fontSize(11);
      doc.text(String(it.quantity), col.qty, startY, { width: 45, align: 'right' });
      doc.text(fmtMoney(it.unitPrice), col.unit, startY, { width: 65, align: 'right' });
      doc.text(fmtMoney(it.totalPrice), col.total, startY, { width: 65, align: 'right' });
      doc.moveDown(0.6);
    }
    doc.moveDown(0.5);
    doc.moveTo(380, doc.y).lineTo(545, doc.y).strokeColor('#e5e5e5').stroke();
    doc.moveDown(0.5);

    // Totals (right-aligned)
    const tcol = { label: 380, val: 480 };
    const rightW = 65;
    const labelW = 95;
    doc.fontSize(10);
    const writeRow = (label: string, val: string, bold = false) => {
      const y = doc.y;
      doc.font('Helvetica' + (bold ? '-Bold' : ''));
      doc.text(label, tcol.label, y, { width: labelW });
      doc.text(val, tcol.val, y, { width: rightW, align: 'right' });
      doc.moveDown(0.4);
    };
    writeRow('Subtotal', fmtMoney(d.totals.subtotal));
    if (d.totals.discount > 0) writeRow('Discount', `-${fmtMoney(d.totals.discount)}`);
    writeRow('Shipping', d.totals.shipping === 0 ? 'Free' : fmtMoney(d.totals.shipping));
    writeRow('Tax', fmtMoney(d.totals.tax));
    doc.moveTo(380, doc.y).lineTo(545, doc.y).strokeColor('#111').lineWidth(1).stroke();
    doc.moveDown(0.4);
    writeRow('TOTAL', fmtMoney(d.totals.total), true);
    doc.font('Helvetica');

    doc.moveDown(2);

    // Address blocks side by side
    const addrY = doc.y;
    const renderAddr = (label: string, addr: ReceiptAddress | null, x: number) => {
      doc.fontSize(9).fillColor('#6b7280').text(label.toUpperCase(), x, addrY);
      doc.moveDown(0.3);
      if (!addr) {
        doc.fontSize(10).fillColor('#9ca3af').text('Not provided', x, doc.y);
        doc.moveDown(2);
        return;
      }
      doc.fontSize(10).fillColor('#111');
      doc.text(`${addr.firstName} ${addr.lastName}`, x, doc.y);
      doc.text(addr.addressLine1, x, doc.y);
      if (addr.addressLine2) doc.text(addr.addressLine2, x, doc.y);
      doc.text(`${addr.city}, ${addr.state} ${addr.zipCode}`, x, doc.y);
      doc.text(addr.country, x, doc.y);
      if (addr.phone) doc.fontSize(8).fillColor('#6b7280').text(`Phone: ${addr.phone}`, x, doc.y);
      doc.moveDown(1.5);
      doc.fillColor('#111');
    };
    renderAddr('Shipping address', d.shippingAddress, 50);
    doc.y = addrY;
    renderAddr('Billing address', d.billingAddress, 300);

    if (d.order.customerNote) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor('#6b7280').text('NOTE');
      doc.fontSize(10).fillColor('#111').text(d.order.customerNote, { width: 495 });
    }

    doc.end();
  });
}
