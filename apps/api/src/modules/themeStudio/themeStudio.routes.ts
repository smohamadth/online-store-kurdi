// ---------------------------------------------------------------------------
// Theme studio routes (mounted at /api/theme-studio).
//
//   GET    /api/theme-studio/themes            admin - list installed theme keys
//   GET    /api/theme-studio/themes/:key       admin - read one theme config
//   PUT    /api/theme-studio/themes/:key       admin - create/overwrite (file)
//   DELETE /api/theme-studio/themes/:key       admin - delete an installed theme
//   POST   /api/theme-studio/install           admin - install a theme .zip
//
// These let the admin Appearance → Theme Studio page persist a newly designed
// theme (tokens + per-page layouts) as a theme.json file, and install a
// developer-shipped theme package at runtime (no rebuild needed: the web
// storefront reads the disk catalog via /api/themes).
// ---------------------------------------------------------------------------
import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import {
  listThemeConfigs,
  getThemeConfig,
  saveTheme,
  deleteTheme,
  installThemeFromZip,
  isBundledTheme,
} from './themeStudio.service';

const router = Router();

// Theme package upload — same memory-storage pattern as /api/upload, but the
// allowlist is the .zip extension (mimetypes for zips vary wildly across
// browsers/OSes, so the filename is the reliable signal; content is still
// parsed and validated as a zip by installThemeFromZip).
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // keep in sync with MAX_ZIP_BYTES in the service
});

router.get('/themes', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    // Full configs in one round-trip so Theme Studio does not N+1 GET each key.
    const catalog = await listThemeConfigs();
    res.json({ status: 'success', data: catalog.themes, invalid: catalog.invalid });
  } catch (err) {
    next(err);
  }
});

router.get('/themes/:key', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const cfg = await getThemeConfig(req.params.key);
    if (!cfg) {
      return res.status(404).json({ status: 'error', message: `Theme "${req.params.key}" not found`, code: 'NOT_FOUND' });
    }
    res.json({ status: 'success', data: cfg });
  } catch (err) {
    next(err);
  }
});

router.put('/themes/:key', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const cfg = await saveTheme(req.params.key, req.body);
    logger.info(`Theme "${req.params.key}" saved to disk`);
    res.json({ status: 'success', data: cfg });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid theme config', code: 'INVALID_THEME' });
  }
});

// POST /api/theme-studio/install — install (or update) a theme from a .zip.
// The package is validated end-to-end before anything is written; a bundled
// theme key can never be overwritten.
router.post(
  '/install',
  authenticate,
  authorize('admin', 'manager'),
  (req, res, next) => {
    zipUpload.single('file')(req, res, (err: any) => {
      if (err) {
        const tooBig = err?.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({
          status: 'error',
          message: tooBig ? 'Theme package exceeds 10MB' : 'Could not read the uploaded theme package',
          code: tooBig ? 'PACKAGE_TOO_LARGE' : 'UPLOAD_ERROR',
        });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No theme package provided', code: 'NO_FILE' });
      }
      if (!/\.zip$/i.test(req.file.originalname || '')) {
        return res.status(400).json({ status: 'error', message: 'Theme package must be a .zip file', code: 'NOT_A_ZIP' });
      }
      const cfg = await installThemeFromZip(req.file.buffer);
      logger.info(`Theme "${cfg.key}" v${cfg.version} installed from package ${req.file.originalname}`);
      res.status(201).json({ status: 'success', data: cfg });
    } catch (err: any) {
      res.status(400).json({ status: 'error', message: err?.message || 'Could not install theme', code: 'INSTALL_FAILED' });
    }
  }
);

router.delete('/themes/:key', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const key = req.params.key;
    // Refuse bundled themes (deleteTheme also guards, but this gives a
    // distinct message before touching anything).
    if (isBundledTheme(key)) {
      return res.status(400).json({
        status: 'error',
        message: `Theme "${key}" is a bundled platform theme and cannot be deleted`,
        code: 'BUNDLED_THEME',
      });
    }
    await deleteTheme(key);
    // Never leave the store pointing at a deleted theme: if the removed
    // theme was active, fall back to the platform default and say so.
    let fellBack = false;
    try {
      const settings = await prisma.themeSettings.findUnique({ where: { id: 'default' } });
      if (settings?.activeTheme === key) {
        await prisma.themeSettings.update({ where: { id: 'default' }, data: { activeTheme: 'default' } });
        fellBack = true;
      }
    } catch (e) {
      logger.warn(`Could not update activeTheme after deleting "${key}": ${(e as Error)?.message}`);
    }
    logger.info(`Theme "${key}" deleted`);
    res.json({
      status: 'success',
      message: fellBack
        ? `Theme "${key}" was active and has been removed — the store was switched back to the default theme.`
        : `Theme "${key}" deleted.`,
      data: { fellBackToDefault: fellBack },
    });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not delete theme', code: 'DELETE_FAILED' });
  }
});

export default router;
