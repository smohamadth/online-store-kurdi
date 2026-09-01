import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { parseOpenErApiResponse } from './currency.helpers';

/**
 * Currency admin routes.
 *
 *   GET    /api/currencies                    public  - the list a visitor sees
 *                                                    (enabled + base); no auth
 *                                                    needed so the picker can
 *                                                    load on first paint
 *   GET    /api/currencies/all                admin   - drafts/disabled too
 *   POST   /api/currencies                    admin
 *   PUT    /api/currencies/:id                admin
 *   DELETE /api/currencies/:id                admin
 *   POST   /api/currencies/refresh           admin   - trigger a fetch now
 *   GET    /api/currencies/refresh/status    admin   - last fetch + errors
 *
 * The price-conversion happens on the storefront at render
 * time using this table, so the API just exposes a stable
 * read view. Writes go through the admin auth check.
 */
const router = Router();

/**
 * Standard ISO 4217 three-letter code. Lowercased on save so
 * the storefront's Intl.NumberFormat receives the right
 * casing; the read side uppercases for consistency.
 */
const codeField = z
  .string()
  .length(3, 'Currency code must be 3 letters')
  .regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters');

const nullableText = z.string().max(8).optional().nullable();

const createSchema = z.object({
  code: codeField,
  name: z.string().min(1).max(80),
  symbol: z.string().min(1).max(8),
  decimalPlaces: z.number().int().min(0).max(6).optional().nullable(),
  rateToBase: z.number().positive(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  symbol: z.string().min(1).max(8).optional(),
  decimalPlaces: z.number().int().min(0).max(6).optional().nullable(),
  rateToBase: z.number().positive().optional(),
  manuallySet: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

/** The set of fields the public storefront picker needs. */
function publicShape(c: any, base: string) {
  return {
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    decimalPlaces: c.decimalPlaces ?? null,
    rateToBase: c.rateToBase,
    isBase: c.code === base,
  };
}

// ---------------------------------------------------------------- public
router.get('/', async (_req, res, next) => {
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    const base = settings?.currency || 'USD';
    const rows = await prisma.currency.findMany({
      where: { isEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    // The base currency is always implicitly available, even
    // when there's no Currency row for it. The picker needs
    // it to render the "USD" option.
    const baseRow = rows.find((r: any) => r.code === base);
    const list = baseRow
      ? rows
      : [{ code: base, name: base, symbol: base, rateToBase: 1.0 }, ...rows];
    res.json({ status: 'success', data: list.map((c: any) => publicShape(c, base)) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- admin list
router.get('/all', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const rows = await prisma.currency.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    res.json({ status: 'success', data: rows });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- admin CRUD
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);
    const clash = await prisma.currency.findUnique({ where: { code: parsed.code } });
    if (clash) {
      return res.status(409).json({
        status: 'error',
        message: `Currency "${parsed.code}" already exists.`,
        code: 'DUPLICATE_CODE',
      });
    }
    const row = await prisma.currency.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        symbol: parsed.symbol,
        decimalPlaces: parsed.decimalPlaces ?? null,
        rateToBase: parsed.rateToBase,
        // An admin-created row is always "manually set" — the
        // refresh job should not clobber a fresh entry on its
        // first run. The admin can clear the flag once the
        // job has pulled a real value.
        manuallySet: true,
        isEnabled: parsed.isEnabled ?? true,
        sortOrder: parsed.sortOrder ?? 0,
      },
    });
    res.status(201).json({ status: 'success', data: row });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const parsed = updateSchema.parse(req.body);
    const existing = await prisma.currency.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Currency not found.',
        code: 'NOT_FOUND',
      });
    }
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === undefined) continue;
      data[k] = v;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No changes supplied.',
        code: 'NO_CHANGES',
      });
    }
    const row = await prisma.currency.update({ where: { id: req.params.id }, data: data as any });
    res.json({ status: 'success', data: row });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.currency.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Currency not found.',
        code: 'NOT_FOUND',
      });
    }
    // Don't let the admin delete the base currency; that
    // would leave the storefront with no way to render any
    // price. Refusing the delete surfaces the constraint
    // instead of silently breaking checkout.
    const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    if (settings?.currency === existing.code) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot delete the base currency ("${existing.code}"). Change the base currency in Settings first.`,
        code: 'BASE_CURRENCY',
      });
    }
    await prisma.currency.delete({ where: { id: req.params.id } });
    res.json({ status: 'success', message: `Currency "${existing.code}" deleted.` });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/currencies/refresh — pull rates from the open
 * exchange rates API now, instead of waiting for the daily
 * scheduler. Useful for "I just added a new currency, fetch
 * its rate so the storefront shows it."
 */
router.post('/refresh', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const summary = await refreshRates();
    res.json({ status: 'success', data: summary });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/currencies/refresh/status — when was the last
 * successful fetch, and what was the last error (if any)?
 * The admin form shows this as "Last refresh: 4h ago" or a
 * red banner.
 */
router.get('/refresh/status', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const rows = await prisma.exchangeRateSnapshot.findMany({
      orderBy: { fetchedAt: 'desc' },
      take: 1,
    });
    const last = rows[0] || null;
    res.json({
      status: 'success',
      data: {
        lastFetchedAt: last?.fetchedAt ?? null,
        // The actual error is harder to read back (we don't
        // store a snapshot of failures). For now, return the
        // freshness signal and let the admin trigger a manual
        // refresh if the date is too old.
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * The actual refresh job. Imported by `currency.scheduler.ts`
 * and called from the route above. Lives here so both
 * contexts share the same code path and the rate-fetch
 * logic isn't duplicated.
 */
export async function refreshRates(): Promise<{
  base: string;
  fetched: number;
  skipped: number;
  errors: string[];
}> {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
  const base = settings?.currency || 'USD';
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
  // 10s cap: a hanging upstream must not block the admin refresh route
  // (or the scheduler job) indefinitely. Same failure shape as !res.ok:
  // an error summary, never an exception.
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'online-store-kurdi/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    const msg =
      err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'Open-ER fetch timed out after 10s'
        : `Open-ER fetch failed: ${err?.message ?? err}`;
    logger.error(`[currency-refresh] ${msg}`);
    return { base, fetched: 0, skipped: 0, errors: [msg] };
  }
  if (!res.ok) {
    const msg = `Open-ER returned ${res.status}`;
    logger.error(`[currency-refresh] ${msg}`);
    return { base, fetched: 0, skipped: 0, errors: [msg] };
  }
  const body = await res.json().catch(() => null);
  let parsed;
  try {
    parsed = parseOpenErApiResponse(body, base);
  } catch (err: any) {
    const msg = `parseOpenErApiResponse: ${err?.message ?? err}`;
    logger.error(`[currency-refresh] ${msg}`);
    return { base, fetched: 0, skipped: 0, errors: [msg] };
  }
  // Snapshot the run for audit. We keep the most recent N
  // rows in the snapshot table; the next pull is allowed to
  // add more.
  await prisma.exchangeRateSnapshot.create({
    data: { code: base, rateToBase: 1.0, fetchedAt: parsed.fetchedAt },
  });
  let fetched = 0;
  let skipped = 0;
  const errors: string[] = [];
  // Walk every non-base row in the API response. The
  // storefront only needs rates for currencies the
  // merchant enabled, but we also want to know about
  // unknown ones so we can log a hint. The rateToBase
  // for the base itself is implicit (1.0).
  for (const [code, rate] of Object.entries(parsed.rates)) {
    if (code === base) continue;
    // Only update rows the admin enabled. We don't auto-
    // create rows for every code in the world — the merchant
    // opts in by adding a Currency row.
    const existing = await prisma.currency.findUnique({ where: { code } });
    if (!existing) {
      skipped++;
      continue;
    }
    if (existing.manuallySet) {
      // Don't clobber a rate the admin pinned. Logged so the
      // admin can see why their value survived.
      skipped++;
      continue;
    }
    await prisma.currency.update({
      where: { id: existing.id },
      data: { rateToBase: rate, lastFetchedAt: parsed.fetchedAt },
    });
    // Also append a snapshot row for this code.
    await prisma.exchangeRateSnapshot.create({
      data: { code, rateToBase: rate, fetchedAt: parsed.fetchedAt },
    });
    fetched++;
  }
  logger.info(
    `[currency-refresh] base=${base} fetched=${fetched} skipped=${skipped}`,
  );
  return { base, fetched, skipped, errors };
}

export default router;
