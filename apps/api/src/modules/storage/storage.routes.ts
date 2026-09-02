// ---------------------------------------------------------------------------
// Generic file storage on MinIO (mounted at /api/storage).
//
// This is the S3-backed twin of modules/upload (local /uploads directory,
// image derivatives via sharp): it stores whatever file the admin
// uploads, as-is, under a uuid name, and serves gated objects through
// presigned URLs. If MinIO is not running (see config/minio.ts) these
// routes fail with AppError - the store's image pipeline does NOT depend
// on them.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authenticate, authorize } from '../../middleware/auth';
import { uploadFile, getPresignedUrl, deleteFile, getPublicUrl } from '../../config/minio';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
// Object-key extension derived from the validated mime type, never from the
// client-supplied filename (which could steer the key out of its prefix).
import { safeExtension } from '../../utils/objectKey';

const router = Router();

// Folder prefixes an upload may write under (mirrors modules/upload's
// allowlist). An unvalidated `folder` body field would let any caller
// write into arbitrary prefixes (e.g. `public/`, which the bucket policy
// serves anonymously) and is the kind of free-form input that drifts
// into path/object-key confusion.
const ALLOWED_STORAGE_FOLDERS = new Set([
  'products',
  'users',
  'categories',
  'temp',
  'public',
  'uploads',
]);

function validateStorageFolder(folder: unknown): string {
  const f = typeof folder === 'string' ? folder : '';
  if (!ALLOWED_STORAGE_FOLDERS.has(f)) {
    throw new AppError(`Invalid upload folder "${f}"`, 400);
  }
  return f;
}

/** Clamp a presigned-URL expiry request to [1 minute, 7 days] (MinIO's cap). */
function parseExpiry(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 60) return 3600;
  return Math.min(Math.floor(n), 7 * 24 * 60 * 60);
}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp,application/pdf').split(',');
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`File type ${file.mimetype} is not allowed`, 400));
    }
  },
});

// POST /api/storage/upload - Upload file
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file provided', 400);
    }

    const file = req.file;
    const folder = validateStorageFolder(req.body.folder || 'uploads');
    const userId = req.user?.id;

    // Generate unique filename. The extension comes from the validated mime
    // type, never from the client-supplied name (see safeExtension).
    const fileExtension = safeExtension(file.mimetype, file.originalname);
    const fileName = `${folder}/${userId}/${uuidv4()}.${fileExtension}`;

    // Process image if it's an image file
    let processedBuffer = file.buffer;
    let contentType = file.mimetype;

    if (file.mimetype.startsWith('image/')) {
      // Resize and optimize image
      processedBuffer = await sharp(file.buffer)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      contentType = 'image/jpeg';
    }

    // Upload to MinIO
    const objectName = await uploadFile(processedBuffer, fileName, contentType, {
      'original-name': file.originalname,
      'uploaded-by': userId || 'anonymous',
    });

    // Get public URL
    const url = getPublicUrl(objectName);

    logger.info(`File uploaded: ${objectName} by user ${userId}`);

    res.json({
      status: 'success',
      data: {
        url,
        fileName: objectName,
        originalName: file.originalname,
        size: processedBuffer.length,
        contentType,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/storage/upload/multiple - Upload multiple files
router.post('/upload/multiple', authenticate, upload.array('files', 10), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      throw new AppError('No files provided', 400);
    }

    const folder = validateStorageFolder(req.body.folder || 'uploads');
    const userId = req.user?.id;
    const uploadedFiles = [];

    for (const file of files) {
      // Generate unique filename (see safeExtension - never trust the
      // client-supplied name for the object key).
      const fileExtension = safeExtension(file.mimetype, file.originalname);
      const fileName = `${folder}/${userId}/${uuidv4()}.${fileExtension}`;

      // Process image if it's an image file
      let processedBuffer = file.buffer;
      let contentType = file.mimetype;

      if (file.mimetype.startsWith('image/')) {
        processedBuffer = await sharp(file.buffer)
          .resize(1200, 1200, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        contentType = 'image/jpeg';
      }

      // Upload to MinIO
      const objectName = await uploadFile(processedBuffer, fileName, contentType, {
        'original-name': file.originalname,
        'uploaded-by': userId || 'anonymous',
      });

      // Get public URL
      const url = getPublicUrl(objectName);

      uploadedFiles.push({
        url,
        fileName: objectName,
        originalName: file.originalname,
        size: processedBuffer.length,
        contentType,
      });
    }

    logger.info(`${uploadedFiles.length} files uploaded by user ${userId}`);

    res.json({
      status: 'success',
      data: uploadedFiles,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/storage/presigned/:fileName - Get presigned URL (admin only).
//
// The bucket policy makes everything outside `public/` private, so a
// presigned URL is the way gated objects are served. Handing this out to
// ANY authenticated user meant any logged-in customer could mint a
// (up to 7-day) presigned URL for ANY object key they knew — bypassing
// whatever gate the object was stored under. Nothing in the storefront
// calls this endpoint; it is an admin delivery tool. Expiry is clamped
// to [1 minute, 7 days] so a hostile value can neither 500 (MinIO's cap)
// nor mint an effectively permanent link.
router.get('/presigned/:fileName(*)', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { fileName } = req.params;
    const expiry = parseExpiry(req.query.expiry);

    const url = await getPresignedUrl(fileName, expiry);

    res.json({
      status: 'success',
      data: {
        url,
        expiresIn: expiry,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/storage/:fileName - Delete file (admin only)
router.delete('/:fileName(*)', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { fileName } = req.params;

    await deleteFile(fileName);

    logger.info(`File deleted: ${fileName} by admin ${req.user?.email}`);

    res.json({
      status: 'success',
      message: 'File deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;