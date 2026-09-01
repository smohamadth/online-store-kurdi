// ---------------------------------------------------------------------------
// Per-locale content translations API.
//
//   GET    /api/content-translations/:entityType/:entityId   public  - all
//                                                               translations
//                                                               for an entity
//   PUT    /api/content-translations/:entityType/:entityId/:locale  admin -
//                                                               upsert a
//                                                               translation
//   DELETE /api/content-translations/:entityType/:entityId/:locale  admin -
//                                                               remove it
//
// These are the writer/admin surface. The storefront read routes (products,
// categories, pages, blog) do NOT call this endpoint per request; they load
// translations in the same query where they load the row, via the helpers in
// localize.helpers.ts. This module exists so the admin editor has a place to
// persist/read a translation, and so a storefront fetch can ask for one
// entity's translations when it needs them (e.g. an admin preview).
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';
import { sanitizeRichText } from '../../utils/sanitizeRichText';
import {
  ContentEntityType,
  HTML_RENDERED_FIELDS,
  isContentEntityType,
  isSupportedContentLocale,
  filterTranslatableFields,
} from './translatableFields';

const router = Router();

function sanitizeTranslatedData(
  entityType: ContentEntityType,
  data: Record<string, unknown>
): Record<string, unknown> {
  const htmlFields = HTML_RENDERED_FIELDS[entityType] || [];
  const out: Record<string, unknown> = { ...data };
  for (const field of htmlFields) {
    const value = out[field];
    if (typeof value === 'string') {
      out[field] = sanitizeRichText(value);
    }
  }
  return out;
}

const upsertBodySchema = z.object({
  data: z.record(z.unknown()).default({}),
});

/** GET /api/content-translations/:entityType/:entityId - all locales for an entity. */
router.get('/:entityType/:entityId', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;
    if (!isContentEntityType(entityType)) {
      return res.status(400).json({ status: 'error', message: `Unknown entity type "${entityType}"` });
    }
    const rows = await prisma.contentTranslation.findMany({
      where: { entityType: entityType as ContentEntityType, entityId },
    });
    const parsed = rows.map((r: any) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(r.data || '{}');
      } catch {
        data = {};
      }
      return { locale: r.locale, data };
    });
    res.json({ status: 'success', data: parsed });
  } catch (error) {
    next(error);
  }
});

/** PUT /api/content-translations/:entityType/:entityId/:locale - upsert a translation (admin). */
router.put(
  '/:entityType/:entityId/:locale',
  authenticate,
  authorize('admin', 'manager'),
  async (req, res, next) => {
    try {
      const { entityType, entityId, locale } = req.params;
      if (!isContentEntityType(entityType)) {
        return res.status(400).json({ status: 'error', message: `Unknown entity type "${entityType}"` });
      }
      if (!isSupportedContentLocale(locale)) {
        return res.status(400).json({ status: 'error', message: `Unsupported locale "${locale}"` });
      }
      if (locale === 'en') {
        return res.status(400).json({
          status: 'error',
          message: 'The default language is edited on the entity itself, not as a translation.',
        });
      }
      const body = upsertBodySchema.parse(req.body);
      const filtered = sanitizeTranslatedData(
        entityType as ContentEntityType,
        filterTranslatableFields(entityType as ContentEntityType, body.data || {}),
      );

      const existing = await prisma.contentTranslation.findUnique({
        where: { entityType_entityId_locale: { entityType, entityId, locale } },
      });

      const row = existing
        ? await prisma.contentTranslation.update({
            where: { id: existing.id },
            data: { data: JSON.stringify(filtered) },
          })
        : await prisma.contentTranslation.create({
            data: { entityType, entityId, locale, data: JSON.stringify(filtered) },
          });

      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(row.data || '{}');
      } catch {
        data = {};
      }
      res.json({ status: 'success', data: { locale: row.locale, data } });
    } catch (error) {
      next(error);
    }
  },
);

/** DELETE /api/content-translations/:entityType/:entityId/:locale - remove a translation (admin). */
router.delete(
  '/:entityType/:entityId/:locale',
  authenticate,
  authorize('admin', 'manager'),
  async (req, res, next) => {
    try {
      const { entityType, entityId, locale } = req.params;
      if (!isContentEntityType(entityType)) {
        return res.status(400).json({ status: 'error', message: `Unknown entity type "${entityType}"` });
      }
      if (!isSupportedContentLocale(locale) || locale === 'en') {
        return res.status(400).json({ status: 'error', message: 'Invalid locale for deletion.' });
      }
      const existing = await prisma.contentTranslation.findUnique({
        where: { entityType_entityId_locale: { entityType, entityId, locale } },
      });
      if (!existing) {
        throw new NotFoundError('ContentTranslation');
      }
      await prisma.contentTranslation.delete({ where: { id: existing.id } });
      res.json({ status: 'success', message: 'Translation deleted.' });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
