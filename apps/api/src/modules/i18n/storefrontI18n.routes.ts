/**
 * Storefront language catalogue + UI-string overlays.
 *
 * GET  /api/i18n/storefront  — public (LanguageSwitcher + i18n hook)
 * PUT  /api/i18n/storefront  — admin: enable/disable/add locales, edit texts
 *
 * In-memory with optional JSON file so tests don't need Prisma migrations.
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

export type StorefrontLang = {
  code: string;
  name: string;
  dir: 'ltr' | 'rtl';
  flag: string;
  enabled: boolean;
};

export type StorefrontI18nState = {
  languages: StorefrontLang[];
  strings: Record<string, Record<string, string>>;
};

const DEFAULT_STATE: StorefrontI18nState = {
  languages: [
    { code: 'en', name: 'English', dir: 'ltr', flag: '🇬🇧', enabled: true },
    { code: 'ku', name: 'کوردی', dir: 'rtl', flag: '🏴', enabled: true },
    { code: 'ar', name: 'العربية', dir: 'rtl', flag: '🇸🇦', enabled: true },
    { code: 'fa', name: 'فارسی', dir: 'rtl', flag: '🇮🇷', enabled: true },
    { code: 'tr', name: 'Türkçe', dir: 'ltr', flag: '🇹🇷', enabled: true },
  ],
  strings: {},
};

let state: StorefrontI18nState = structuredClone(DEFAULT_STATE);

const FILE = path.join(process.cwd(), 'data', 'storefront-i18n.json');

function loadFromDisk() {
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (parsed?.languages) state = parsed;
    }
  } catch { /* keep default */ }
}

function saveToDisk() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch { /* best-effort persist */ }
}

loadFromDisk();

/** Reset used by tests. */
export function resetStorefrontI18n() {
  state = structuredClone(DEFAULT_STATE);
}

export const langSchema = z.object({
  code: z.string().min(2).max(8).regex(/^[a-z][a-z0-9-]*$/i),
  name: z.string().min(1).max(80),
  dir: z.enum(['ltr', 'rtl']),
  flag: z.string().max(8).optional(),
  enabled: z.boolean(),
});

export const putSchema = z.object({
  languages: z.array(langSchema).min(1).max(40),
  strings: z.record(z.record(z.string().max(2000))).optional(),
});

router.get('/storefront', (_req, res) => {
  res.json({ status: 'success', data: state });
});

router.put('/storefront', authenticate, authorize('admin', 'manager'), (req, res, next) => {
  try {
    const body = putSchema.parse(req.body);
    const codes = body.languages.map((l) => l.code.toLowerCase());
    if (new Set(codes).size !== codes.length) {
      return res.status(400).json({ status: 'error', message: 'Duplicate language codes.' });
    }
    if (!body.languages.some((l) => l.enabled)) {
      return res.status(400).json({ status: 'error', message: 'At least one language must stay enabled.' });
    }
    state = {
      languages: body.languages.map((l) => ({
        code: l.code.toLowerCase(),
        name: l.name,
        dir: l.dir,
        flag: l.flag || '🏳️',
        enabled: l.enabled,
      })),
      // Omitting `strings` must not wipe existing overlays (language-only saves).
      strings: body.strings !== undefined ? body.strings : state.strings,
    };
    saveToDisk();
    res.json({ status: 'success', data: state });
  } catch (err) {
    next(err);
  }
});

export default router;
