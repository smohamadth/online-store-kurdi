// ---------------------------------------------------------------------------
// Local filesystem image storage (the "uploads/" directory served statically
// by app.ts).
//
// uploadImage() is the single entry point used by the /api/upload routes:
// it validates type+size, then re-encodes the image with sharp into four
// fixed-size webp variants (thumbnail/medium/large/zoom) plus a capped
// "original" - the store therefore never serves the raw upload, only the
// derivatives, which keeps the storefront fast regardless of what a
// customer uploads.
//
// Note: config/minio.ts is a separate, optional MinIO setup; this service is
// the always-available local implementation.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Storage configuration
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - keep in sync with the multer limit in upload.routes.ts
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Image size presets. Key names are the storage vocabulary; the storefront
// speaks a different one (thumbnail/card/detail/zoom), which getImageUrl
// translates via sizeMap.
const IMAGE_SIZES = {
  thumbnail: { width: 300, height: 300, quality: 80 },
  medium: { width: 600, height: 600, quality: 85 },
  large: { width: 1200, height: 1200, quality: 85 },
  zoom: { width: 2000, height: 2000, quality: 90 },
};

export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  size: number;
  format: string;
}

export interface UploadResult {
  id: string;
  originalUrl: string;
  variants: ImageVariant[];
  originalName: string;
  mimeType: string;
  uploadedAt: Date;
}

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  logger.info(`Created uploads directory: ${UPLOAD_DIR}`);
}

// Create subdirectories
const subdirs = ['products', 'users', 'categories', 'temp'];
subdirs.forEach(dir => {
  const dirPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Process image into multiple sizes
async function processImage(
  buffer: Buffer,
  folder: string,
  id: string
): Promise<ImageVariant[]> {
  const variants: ImageVariant[] = [];

  for (const [sizeName, config] of Object.entries(IMAGE_SIZES)) {
    try {
      // Process image. 'contain' preserves the aspect ratio and pads the
      // rest with the background colour - hence a TRANSPARENT PNG ends up
      // with a solid white background in every variant (intentional: the
      // storefront has no global alpha handling for product imagery).
      const processed = await sharp(buffer)
        .resize(config.width, config.height, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
          position: 'center',
        })
        .webp({ quality: config.quality })
        .toBuffer();

      // Save file
      const fileName = `${folder}/${id}/${sizeName}.webp`;
      const filePath = path.join(UPLOAD_DIR, fileName);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, processed);

      variants.push({
        url: `/uploads/${fileName}`,
        width: config.width,
        height: config.height,
        size: processed.length,
        format: 'webp',
      });

      logger.info(`Image variant created: ${fileName} (${processed.length} bytes)`);
    } catch (error) {
      // One failing variant is not fatal: the remaining variants still
      // serve the image, so we log and continue rather than aborting the
      // whole upload.
      logger.error(`Failed to create ${sizeName} variant:`, error);
    }
  }

  return variants;
}

// Upload file with multiple sizes
export async function uploadImage(
  file: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = 'products'
): Promise<UploadResult> {
  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed`);
    }

    // Validate file size (the multer limit usually stops this first; this is
    // the defence for callers that bypass multer).
    if (file.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Generate unique ID
    const id = uuidv4();

    // Process image into multiple sizes
    const variants = await processImage(file, folder, id);

    // Also save original (optimized). Re-encoded to JPEG at max 2000px:
    // 'inside' + withoutEnlargement never upscales small uploads, and the
    // JPEG re-encode is why the "original" of a PNG loses transparency too.
    const originalProcessed = await sharp(file)
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    const originalFileName = `${folder}/${id}/original.jpg`;
    const originalFilePath = path.join(UPLOAD_DIR, originalFileName);
    fs.writeFileSync(originalFilePath, originalProcessed);

    const result: UploadResult = {
      id,
      originalUrl: `/uploads/${originalFileName}`,
      variants,
      originalName,
      mimeType,
      uploadedAt: new Date(),
    };

    logger.info(`Image uploaded: ${id} (${variants.length} variants created)`);

    return result;
  } catch (error) {
    logger.error('Image upload failed:', error);
    throw error;
  }
}

// Get image URL (returns best variant for context)
export function getImageUrl(
  variants: ImageVariant[],
  context: 'thumbnail' | 'card' | 'detail' | 'zoom' = 'detail'
): string {
  if (!variants || variants.length === 0) {
    // No variants at all (every sharp pass failed) - the storefront renders
    // a placeholder instead of a broken image.
    return '/images/placeholder.jpg';
  }

  // Map context (storefront vocabulary) to size (storage vocabulary).
  const sizeMap: Record<string, string> = {
    thumbnail: 'thumbnail',
    card: 'medium',
    detail: 'large',
    zoom: 'zoom',
  };

  const targetSize = sizeMap[context] || 'medium';
  // Match by file name segment ("/medium.webp"), not by the whole URL, so
  // the folder/uuid path can never interfere with the lookup.
  const variant = variants.find(v => v.url.includes(`/${targetSize}.`));

  return variant?.url || variants[0]?.url || '/images/placeholder.jpg';
}

// Delete image and all variants
export async function deleteImage(folder: string, id: string): Promise<void> {
  try {
    const dirPath = path.join(UPLOAD_DIR, folder, id);

    if (fs.existsSync(dirPath)) {
      // Remove all files in directory
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        fs.unlinkSync(path.join(dirPath, file));
      }
      // Remove directory
      fs.rmdirSync(dirPath);
      logger.info(`Image deleted: ${folder}/${id}`);
    }
  } catch (error) {
    logger.error('Image deletion failed:', error);
    throw error;
  }
}

// Check if image exists
export function imageExists(folder: string, id: string): boolean {
  const dirPath = path.join(UPLOAD_DIR, folder, id);
  return fs.existsSync(dirPath);
}

// Get image info
export function getImageInfo(folder: string, id: string): any {
  try {
    const dirPath = path.join(UPLOAD_DIR, folder, id);

    if (!fs.existsSync(dirPath)) {
      return null;
    }

    const files = fs.readdirSync(dirPath);
    const variants: any[] = [];

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      const [sizeName, format] = file.split('.');

      variants.push({
        name: sizeName,
        format,
        size: stats.size,
        url: `/uploads/${folder}/${id}/${file}`,
      });
    }

    return {
      id,
      folder,
      variants,
      createdAt: fs.statSync(dirPath).birthtime,
    };
  } catch {
    return null;
  }
}

export default {
  uploadImage,
  getImageUrl,
  deleteImage,
  imageExists,
  getImageInfo,
  IMAGE_SIZES,
};
