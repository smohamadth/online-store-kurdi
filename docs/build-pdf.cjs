// Generate docs/FEATURES.pdf from docs/FEATURES.md.
//
// Run with: node docs/build-pdf.cjs
//
// Uses pdfkit (no Chrome required) so it works in any sandboxed
// environment. The script is the same one used to build the PDF
// that's currently committed; re-run it after editing FEATURES.md.
const path = require('path');
const PDFDocument = require('pdfkit');
const { readFileSync, createWriteStream } = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const md = readFileSync(path.join(ROOT, 'docs/FEATURES.md'), 'utf8');
const out = createWriteStream(path.join(ROOT, 'docs/FEATURES.pdf'));
const lines = md.split('\n');

const PAGE = { size: 'A4', margin: 56 };
const COLORS = { h1:'#0a0a0a', h2:'#1f2937', h3:'#374151', body:'#111827', muted:'#6b7280', code:'#be185d', codeBg:'#f3f4f6', border:'#d1d5db', link:'#2563eb', tableHead:'#f9fafb' };
const SIZES = { h1:22, h2:16, h3:13, h4:11.5, body:10.5, code:9, small:9 };

function parse(md) {
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (i === 0 && line === '---') { i++; continue; }
    if (/^---+$/.test(line.trim())) { blocks.push({ type:'hr' }); i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type:'h', level:h[1].length, text:h[2] }); i++; continue; }
    if (/^```/.test(line)) {
      const body = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++; blocks.push({ type:'code', text: body.join('\n') }); continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { body.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push({ type:'quote', text: body.join('\n') }); continue;
    }
    if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1])) {
      const headerRow = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) { rows.push(line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())); i++; }
      blocks.push({ type:'table', header: headerRow, rows }); continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const items = []; const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
        const itemLines = [lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, '')];
        i++;
        while (i < lines.length && lines[i].trim() && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i])) {
          itemLines.push(lines[i].replace(/^\s{2,}/, '')); i++;
        }
        items.push(itemLines.join(' '));
      }
      blocks.push({ type:'list', ordered, items }); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^>\s?/.test(lines[i]) && !/^\|.*\|$/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push({ type:'p', text: para.join(' ') });
  }
  return blocks;
}

function parseInline(text) {
  const out = []; let i=0, buf='', bold=false, italic=false, code=false;
  function flush() { if (buf) out.push({ text: buf, bold, italic, code }); buf=''; }
  while (i < text.length) {
    const c = text[i];
    if (code) { if (c==='`') { flush(); code=false; i++; continue; } buf+=c; i++; continue; }
    if (c==='`') { flush(); code=true; i++; continue; }
    if (c==='*' && text[i+1]==='*') { flush(); bold=!bold; i+=2; continue; }
    if (c==='*' && text[i+1]!=='*') { flush(); italic=!italic; i++; continue; }
    if (c==='[') { const m = /^\[([^\]]+)\]\(([^)]+)\)/.exec(text.slice(i)); if (m) { flush(); out.push({ text: m[1], link: m[2] }); i += m[0].length; continue; } }
    buf += c; i++;
  }
  flush();
  return out;
}

const doc = new PDFDocument(PAGE);
doc.pipe(out);

let currentPage = 1;
function newPage() { doc.addPage(); currentPage++; }
function ensureSpace(needed) { if (doc.y + needed > doc.page.height - doc.page.margins.bottom) newPage(); }

function renderSpansWithWidth(spans, x, y, width) {
  doc.x = x; doc.y = y;
  for (const s of spans) {
    const font = s.code ? 'Courier' : s.bold ? 'Helvetica-Bold' : s.italic ? 'Helvetica-Oblique' : 'Helvetica';
    doc.font(font).fontSize(s.code ? SIZES.code : SIZES.body);
    if (s.code) {
      const w = doc.widthOfString(s.text);
      const h = doc.currentLineHeight() + 2;
      doc.save(); doc.rect(doc.x-1, doc.y-1, w+4, h).fill(COLORS.codeBg); doc.restore();
      doc.fillColor(COLORS.code).text(s.text, { continued: true, width: width - (doc.x - x) });
      doc.fillColor(COLORS.body);
    } else {
      doc.fillColor(COLORS.body).text(s.text, { continued: true, width: width - (doc.x - x) });
    }
  }
  doc.text('', { stroke: false });
  doc.fillColor(COLORS.body);
}

function renderParagraph(text) { ensureSpace(SIZES.body * 1.4); renderSpansWithWidth(parseInline(text), doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right); doc.y += 4; }

function renderHeading(level, text) {
  if (level === 1) newPage();
  ensureSpace(SIZES['h'+level] * 2);
  const spans = parseInline(text);
  renderSpansWithWidth(spans, doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right);
  if (level === 1) {
    const y = doc.y + 2;
    doc.strokeColor(COLORS.border).lineWidth(1).moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
    doc.moveDown(0.3);
  } else doc.moveDown(0.5);
  doc.fillColor(COLORS.body);
}

function renderHr() { ensureSpace(8); doc.strokeColor(COLORS.border).lineWidth(0.5).moveTo(doc.page.margins.left, doc.y + 4).lineTo(doc.page.width - doc.page.margins.right, doc.y + 4).stroke(); doc.y = doc.y + 8; }

function renderCode(text) {
  const lns = text.split('\n');
  const bh = lns.length * SIZES.code * 1.4 + 12;
  ensureSpace(bh);
  const sx = doc.page.margins.left;
  doc.save();
  doc.rect(sx-2, doc.y-2, doc.page.width - sx - doc.page.margins.right + 4, bh).fill(COLORS.codeBg);
  doc.restore();
  doc.font('Courier').fontSize(SIZES.code).fillColor(COLORS.body);
  doc.x = sx + 4;
  for (const ln of lns) doc.text(ln || ' ', { lineGap: 0 });
  doc.y += 6;
  doc.x = sx;
}

function renderQuote(text) {
  ensureSpace(SIZES.body * 2);
  const left = doc.page.margins.left;
  doc.save();
  doc.rect(left-4, doc.y, 3, doc.currentLineHeight() * 2).fill('#d1d5db');
  doc.restore();
  doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(SIZES.body);
  doc.x = left + 8;
  doc.text(text, { width: doc.page.width - doc.page.margins.right - doc.x, lineGap: 1 });
  doc.x = left;
  doc.fillColor(COLORS.body);
  doc.moveDown(0.5);
}

function renderList(ordered, items) {
  ensureSpace(SIZES.body * Math.max(1, items.length));
  const left = doc.page.margins.left;
  const indent = 18;
  const listWidth = doc.page.width - left - doc.page.margins.right - indent;
  for (let i = 0; i < items.length; i++) {
    const marker = ordered ? (i + 1) + '.' : '-';
    const startY = doc.y;
    doc.font('Helvetica-Bold').fontSize(SIZES.body).fillColor(COLORS.body);
    const markerWidth = doc.widthOfString(marker) + 6;
    doc.text(marker, left, startY, { width: markerWidth, lineBreak: false });
    const spans = parseInline(items[i]);
    renderSpansWithWidth(spans, left + markerWidth, startY, listWidth - markerWidth);
    if (doc.y === startY) doc.y = startY + SIZES.body * 1.4;
  }
  doc.moveDown(0.3);
}

function renderTable(header, rows) {
  if (!header || !header.length) return;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('Helvetica').fontSize(SIZES.small);
  const naturalWidths = header.map((h, i) => {
    const headerW = doc.widthOfString(h) + 12;
    const cellMax = rows.reduce((m, r) => Math.max(m, doc.widthOfString(r[i] || '') + 12), 0);
    return Math.max(headerW, cellMax);
  });
  let totalW = naturalWidths.reduce((a, b) => a + b, 0);
  let scale = totalW > usableWidth ? usableWidth / totalW : 1;
  const colWidths = naturalWidths.map((w) => w * scale);
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = doc.page.margins.left;
  const rowHeight = SIZES.small * 1.5;
  const headHeight = rowHeight;
  function drawRow(cells, y, isHeader) {
    let x = startX;
    if (isHeader) { doc.save(); doc.rect(startX, y, tableWidth, headHeight).fill(COLORS.tableHead); doc.restore(); }
    doc.font('Helvetica-Bold').fontSize(SIZES.small).fillColor(COLORS.body);
    for (let i = 0; i < cells.length; i++) {
      doc.text(String(cells[i] || ''), x + 4, y + 3, { width: colWidths[i] - 8, height: rowHeight - 4, ellipsis: true, lineBreak: false });
      x += colWidths[i];
    }
    doc.strokeColor(COLORS.border).lineWidth(0.3).moveTo(startX, y + rowHeight).lineTo(startX + tableWidth, y + rowHeight).stroke();
  }
  ensureSpace(headHeight + 4);
  let y = doc.y;
  if (y + headHeight > doc.page.height - doc.page.margins.bottom) { newPage(); y = doc.y; }
  drawRow(header, y, true); y += headHeight;
  for (const r of rows) { if (y + rowHeight > doc.page.height - doc.page.margins.bottom) { newPage(); y = doc.y; } drawRow(r, y, false); y += rowHeight; }
  doc.strokeColor(COLORS.border).lineWidth(0.5).rect(startX, y - rows.length * rowHeight - headHeight, tableWidth, headHeight + rows.length * rowHeight).stroke();
  doc.y = y + 4;
}

// Title page.
doc.font('Helvetica-Bold').fontSize(28).fillColor(COLORS.h1);
doc.text('Online Store Kurdi', { align: 'left' });
doc.moveDown(0.3);
doc.font('Helvetica').fontSize(14).fillColor(COLORS.muted);
doc.text('Features Roadmap', { align: 'left' });
doc.moveDown(0.2);
doc.fontSize(10).fillColor(COLORS.muted);
const today = new Date().toISOString().slice(0, 10);
doc.text('Generated ' + today + ' from FEATURES.md');
doc.moveDown(1);

const blocks = parse(md);
for (const b of blocks) {
  if (b.type === 'h') renderHeading(b.level, b.text);
  else if (b.type === 'p') renderParagraph(b.text);
  else if (b.type === 'hr') renderHr();
  else if (b.type === 'code') renderCode(b.text);
  else if (b.type === 'quote') renderQuote(b.text);
  else if (b.type === 'list') renderList(b.ordered, b.items);
  else if (b.type === 'table') renderTable(b.header, b.rows);
}

doc.end();
console.log('Wrote docs/FEATURES.pdf -', currentPage, 'pages');
