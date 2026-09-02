// ---------------------------------------------------------------------------
// Plugin routes (mounted at /api/plugins).
//
//   GET    /api/plugins                admin - list catalog (bundled + installed)
//   GET    /api/plugins/:id            admin - one plugin (+ README/manifest)
//   POST   /api/plugins/install        admin - install a plugin .zip
//   PATCH  /api/plugins/:id            admin - config / enable / disable / webhook url
//   POST   /api/plugins/:id/test       admin - fire a sample event through the pipeline
//   GET    /api/plugins/:id/log        admin - execution log (newest first)
//   DELETE /api/plugins/:id            admin - uninstall (installed only, must be disabled)
//
// Installed plugins are data-only: they never execute code on the platform;
// the only effect of an installed plugin is signed webhooks POSTed to the
// admin-configured URL. Bundled (in-repo) plugins appear in the catalog but
// are never installable/editable/uninstallable through this API.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { KNOWN_HOOKS } from './plugin.schema';
import {
  listPlugins,
  getPluginInfo,
  installPluginFromZip,
  updatePluginConfig,
  uninstallPlugin,
  testPlugin,
  readExecLog,
  readPackageDocs,
} from './plugins.service';
import type { HookName } from './plugin.schema';

const router = Router();

// Same memory-storage pattern as the theme installer; content is fully
// parsed + validated as a zip by installPluginFromZip.
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // keep in sync with MAX_ZIP_BYTES in the service
});

router.get('/', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    res.json({ status: 'success', data: await listPlugins() });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const info = await getPluginInfo(req.params.id);
    if (!info) {
      return res.status(404).json({ status: 'error', message: `Plugin "${req.params.id}" not found`, code: 'NOT_FOUND' });
    }
    const docs = await readPackageDocs(req.params.id);
    res.json({ status: 'success', data: { ...info, readme: docs.readme } });
  } catch (err) {
    next(err);
  }
});

// POST /api/plugins/install — install (or update) a plugin from a .zip.
// Validated end-to-end before anything is written; bundled ids and
// kind:"code" packages are refused.
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
          message: tooBig ? 'Plugin package exceeds 5MB' : 'Could not read the uploaded plugin package',
          code: tooBig ? 'PACKAGE_TOO_LARGE' : 'UPLOAD_ERROR',
        });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No plugin package provided', code: 'NO_FILE' });
      }
      if (!/\.zip$/i.test(req.file.originalname || '')) {
        return res.status(400).json({ status: 'error', message: 'Plugin package must be a .zip file', code: 'NOT_A_ZIP' });
      }
      const manifest = await installPluginFromZip(req.file.buffer);
      logger.info(`Plugin "${manifest.id}" v${manifest.version} installed from package ${req.file.originalname}`);
      res.status(201).json({ status: 'success', data: await getPluginInfo(manifest.id) });
    } catch (err: any) {
      res.status(400).json({ status: 'error', message: err?.message || 'Could not install plugin', code: 'INSTALL_FAILED' });
    }
  }
);

// PATCH /api/plugins/:id — enable/disable, webhook url/timeout, config.
router.patch('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const info = await updatePluginConfig(req.params.id, {
      enabled: typeof req.body.enabled === 'boolean' ? req.body.enabled : undefined,
      url: typeof req.body.url === 'string' ? req.body.url : undefined,
      timeoutMs: req.body.timeoutMs !== undefined ? Number(req.body.timeoutMs) : undefined,
      config: req.body.config !== undefined ? req.body.config : undefined,
    });
    logger.info(`Plugin "${req.params.id}" updated`);
    res.json({ status: 'success', data: info });
  } catch (err: any) {
    const notFound = /not installed/i.test(err?.message || '');
    res.status(notFound ? 404 : 400).json({
      status: 'error',
      message: err?.message || 'Could not update plugin',
      code: notFound ? 'NOT_FOUND' : 'INVALID_PLUGIN_UPDATE',
    });
  }
});

// POST /api/plugins/:id/test — fire a sample payload for one of the plugin's
// hooks through the real pipeline and return the recorded attempt.
router.post('/:id/test', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const event = String(req.body?.event ?? '');
    if (!KNOWN_HOOKS.includes(event as HookName)) {
      return res.status(400).json({
        status: 'error',
        message: `Unknown hook "${event}" — expected one of: ${KNOWN_HOOKS.join(', ')}`,
        code: 'UNKNOWN_HOOK',
      });
    }
    const result = await testPlugin(req.params.id, event as HookName);
    const latest = result.lines[0] ?? null;
    res.json({
      status: 'success',
      data: {
        event,
        delivered: latest?.ok ?? false,
        status: latest?.status ?? null,
        error: latest?.error ?? null,
        durationMs: latest?.durationMs ?? null,
        recordedAt: latest?.ts ?? null,
      },
    });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Could not run plugin test', code: 'TEST_FAILED' });
  }
});

router.get('/:id/log', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const info = await getPluginInfo(req.params.id);
    if (!info) {
      return res.status(404).json({ status: 'error', message: `Plugin "${req.params.id}" not found`, code: 'NOT_FOUND' });
    }
    res.json({ status: 'success', data: await readExecLog(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    await uninstallPlugin(req.params.id);
    logger.info(`Plugin "${req.params.id}" uninstalled`);
    res.json({ status: 'success', message: `Plugin "${req.params.id}" uninstalled.`, data: null });
  } catch (err: any) {
    const msg = err?.message || 'Could not uninstall plugin';
    const code = /bundled/i.test(msg) ? 'BUNDLED_PLUGIN' : /Disable/i.test(msg) ? 'MUST_DISABLE' : 'UNINSTALL_FAILED';
    res.status(400).json({ status: 'error', message: msg, code });
  }
});

export default router;
