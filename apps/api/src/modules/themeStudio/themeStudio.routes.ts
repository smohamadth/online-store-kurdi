// ---------------------------------------------------------------------------
// Theme studio routes (mounted at /api/theme-studio).
//
//   GET    /api/theme-studio/themes            admin - list installed themes
//   GET    /api/theme-studio/themes/:key       admin - read one theme config
//   PUT    /api/theme-studio/themes/:key       admin - create/overwrite (file)
//   DELETE /api/theme-studio/themes/:key       admin - delete an admin theme
//
// These let the admin Appearance → Theme Studio page persist a newly designed
// theme (tokens + per-page layouts) as a theme.json file. The web registry
// picks the file up on the next build (the "files" model the admin chose).
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { listThemeKeys, getThemeConfig, saveTheme, deleteTheme } from './themeStudio.service';

const router = Router();

router.get('/themes', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const keys = await listThemeKeys();
    res.json({ status: 'success', data: keys });
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

router.delete('/themes/:key', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    await deleteTheme(req.params.key);
    logger.info(`Theme "${req.params.key}" deleted`);
    res.json({ status: 'success', message: `Theme "${req.params.key}" deleted.` });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not delete theme', code: 'DELETE_FAILED' });
  }
});

export default router;
