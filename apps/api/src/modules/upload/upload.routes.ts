import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth';
import { uploadFile, deleteFile } from '../../services/storage.service';
import { logger } from '../../utils/logger';

const router = Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

// POST /api/upload/image - Upload single image
router.post('/image', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided',
      });
    }

    const folder = req.body.folder || 'products';
    
    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder
    );

    logger.info(`Image uploaded by user ${req.user?.id}: ${result.fileName}`);

    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/upload/images - Upload multiple images
router.post('/images', authenticate, upload.array('files', 10), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No files provided',
      });
    }

    const folder = req.body.folder || 'products';
    const results = [];

    for (const file of files) {
      const result = await uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        folder
      );
      results.push(result);
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

// DELETE /api/upload/:fileName - Delete file
router.delete('/:fileName(*)', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { fileName } = req.params;

    await deleteFile(fileName);

    logger.info(`File deleted by admin ${req.user?.id}: ${fileName}`);

    res.json({
      status: 'success',
      message: 'File deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;