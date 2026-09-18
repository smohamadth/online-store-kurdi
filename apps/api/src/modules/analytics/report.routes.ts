/**
 * Admin sales report endpoints (mounted under /api/reports).
 *
 *   GET /api/reports/sales              - JSON, drives the analytics page
 *   GET /api/reports/sales.pdf          - printable PDF
 *   GET /api/reports/sales.csv          - spreadsheet export
 *
 * All admin/manager only: these expose revenue and customer emails.
 *
 * Every endpoint accepts the same range parameters, so the download always
 * matches what is on screen:
 *   ?days=30            lookback window, or
 *   ?from=ISO&to=ISO    explicit range
 */
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { assembleSalesReport, resolveRange } from './report.service';
import { renderReportPdf, renderReportCsv } from './report.renderers';

const router = Router();

const adminOnly = [authenticate, authorize('admin', 'manager')] as const;

/** Range slug for filenames, e.g. sales-report-2024-01-01_2024-01-31.pdf */
function rangeSlug(fromIso: string, toIso: string): string {
  return `${fromIso.slice(0, 10)}_${toIso.slice(0, 10)}`;
}

router.get('/sales', ...adminOnly, async (req, res, next) => {
  try {
    const report = await assembleSalesReport(resolveRange(req.query));
    res.json({ status: 'success', data: report });
  } catch (err) {
    next(err);
  }
});

router.get('/sales.pdf', ...adminOnly, async (req, res, next) => {
  try {
    const report = await assembleSalesReport(resolveRange(req.query));
    const pdf = await renderReportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    // `inline` so a click opens the browser's PDF viewer (with its own save
    // button) rather than dropping a file the admin has to go and find.
    res.setHeader(
      'Content-Disposition',
      `inline; filename="sales-report-${rangeSlug(report.range.from, report.range.to)}.pdf"`,
    );
    res.setHeader('Content-Length', String(pdf.length));
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

router.get('/sales.csv', ...adminOnly, async (req, res, next) => {
  try {
    const report = await assembleSalesReport(resolveRange(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-report-${rangeSlug(report.range.from, report.range.to)}.csv"`,
    );
    res.send(renderReportCsv(report));
  } catch (err) {
    next(err);
  }
});

export default router;
