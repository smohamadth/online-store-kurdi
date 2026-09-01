// ---------------------------------------------------------------------------
// Public theme catalog (mounted at /api/themes).
//
//   GET /api/themes                  - every installed theme config (bundled +
//                                      admin-installed), validated
//   GET /api/themes/:key/preview.png - preview image served from the theme dir
//
// Why public?
//   - The storefront needs the active theme's tokens/layouts at runtime so an
//     admin-installed theme renders WITHOUT a web rebuild. Bundled themes are
//     still compiled into the web bundle (static registry) as the fallback,
//     but the disk catalog is the runtime source of truth for both tiers.
//   - The admin gallery and the /preview/<key> page list installed themes
//     through the same endpoint.
//
// Theme configs are deliberately non-secret (they are the storefront's public
// look); the per-store overrides remain behind the authenticated /api/theme
// PUT. Malformed themes are listed in `invalid` rather than dropped, so an
// operator sees "this install is broken" instead of a silent fallback.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { listThemeConfigs, getThemePreviewPath } from '../themeStudio/themeStudio.service';

const router = Router();

const PREVIEW_EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

router.get('/', async (_req, res, next) => {
  try {
    const { themes, invalid } = await listThemeConfigs();
    res.json({ status: 'success', data: { themes, invalid } });
  } catch (err) {
    next(err);
  }
});

router.get('/:key/preview.:ext', async (req, res, next) => {
  try {
    const { key, ext } = req.params;
    const mime = PREVIEW_EXT_MIME[ext];
    if (!mime) {
      return res.status(404).json({ status: 'error', message: 'Preview not found', code: 'NOT_FOUND' });
    }
    const file = await getThemePreviewPath(key);
    if (!file) {
      return res.status(404).json({ status: 'error', message: `Theme "${key}" has no preview image`, code: 'NOT_FOUND' });
    }
    res.set('Content-Type', mime).set('Cache-Control', 'public, max-age=3600').sendFile(file);
  } catch (err) {
    next(err);
  }
});

export default router;
