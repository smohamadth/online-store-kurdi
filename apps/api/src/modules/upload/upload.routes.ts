// ---------------------------------------------------------------------------
// Image upload endpoints (auth required; delete is admin-only).
//
// Files are parsed by multer into RAM (memoryStorage), then handed to
// storage.service which writes four resized webp variants + a capped
// original under /uploads/<folder>/<uuid>/. The /uploads/* URL is served
// statically by app.ts.
//
// Security: `folder` comes from the request body and lands in a filesystem
// path, so it is validated against the known buckets here (clean 400) AND
// re-checked inside storage.service (defence in depth for non-route
// callers). The type allowlist below is HARDCODED; the ALLOWED_FILE_TYPES
// env var in .env is not read by this file (storage.service has its own
// copy).
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { AppError } from '../../middleware/errorHandler';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth';
import {
  uploadImage,
  deleteImage,
  getImageUrl,
  assertSafeUploadPath,
} from '../../services/storage.service';
import { logger } from '../../utils/logger';

const router = Router();

// `folder` may only name one of the known storage buckets; `id` (delete
// path) must be a plain uuid/slug. Anything else is rejected before it can
// reach a filesystem path.
const ALLOWED_FOLDERS = new Set(['products', 'users', 'categories', 'temp']);
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
function validateFolderParam(folder: unknown): string {
  const f = typeof folder === 'string' ? folder : '';
  if (!ALLOWED_FOLDERS.has(f)) {
    throw new AppError('Invalid upload folder', 400);
  }
  return f;
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB - keep in sync with storage.service's MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    // Reject before the buffer is even kept in RAM.
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

// POST /api/upload/image - Upload single image (any authenticated user)
router.post('/image', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided',
      });
    }

    // Caller picks the bucket (products | users | categories | temp); the
    // upload admin passes 'categories', profile pages pass 'users', etc.
    // Anything outside the buckets is rejected here AND in storage.service.
    const folder = validateFolderParam(req.body.folder || 'products');

    const result = await uploadImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder
    );

    logger.info(`Image uploaded by user ${req.user?.id}: ${result.id}`);

    // Return all variants. The context keys (thumbnail/card/detail/zoom)
    // are the storefront's vocabulary; storage.service maps them onto its
    // size names (thumbnail/medium/large/zoom).
    res.json({
      status: 'success',
      data: {
        id: result.id,
        url: result.originalUrl,
        thumbnail: getImageUrl(result.variants, 'thumbnail'),
        medium: getImageUrl(result.variants, 'card'),
        large: getImageUrl(result.variants, 'detail'),
        zoom: getImageUrl(result.variants, 'zoom'),
        variants: result.variants,
        originalName: result.originalName,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/upload/images - Upload multiple images (up to 10 per request).
// Sequential (not Promise.all) so one bad image fails the request and the
// partial set is visible to the caller rather than silently half-applied.
router.post('/images', authenticate, upload.array('files', 10), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No files provided',
      });
    }

    const folder = validateFolderParam(req.body.folder || 'products');
    const results = [];

    for (const file of files) {
      const result = await uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
        folder
      );

      results.push({
        id: result.id,
        url: result.originalUrl,
        thumbnail: getImageUrl(result.variants, 'thumbnail'),
        medium: getImageUrl(result.variants, 'card'),
        large: getImageUrl(result.variants, 'detail'),
        variants: result.variants,
      });
    }

    logger.info(`${results.length} images uploaded by user ${req.user?.id}`);

    res.json({
      status: 'success',
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/upload/:folder/:id - Delete image (admin only).
// Removes the whole <folder>/<id> directory: original + every variant.
router.delete('/:folder/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { folder, id } = req.params;
    // Route-level guard: the delete path components land in a filesystem
    // path, so both must be validated before touching the disk. The id is
    // a uuid the API minted (optionally a slug for legacy rows).
    validateFolderParam(folder);
    if (!SAFE_ID_RE.test(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid image id' });
    }

    await deleteImage(folder, id);

    logger.info(`Image deleted by admin ${req.user?.id}: ${folder}/${id}`);

    res.json({
      status: 'success',
      message: 'Image deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
