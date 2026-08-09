import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Storage configuration
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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

export interface UploadResult {
  url: string;
  fileName: string;
  originalName: string;
  size: number;
  mimeType: string;
}

// Upload file to local storage
export async function uploadFile(
  file: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = 'temp'
): Promise<UploadResult> {
  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed`);
    }

    // Validate file size
    if (file.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Generate unique filename
    const ext = path.extname(originalName) || '.jpg';
    const fileName = `${folder}/${uuidv4()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Process image (resize and optimize)
    let processedBuffer = file;
    
    if (mimeType.startsWith('image/')) {
      processedBuffer = await sharp(file)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    // Save file
    fs.writeFileSync(filePath, processedBuffer);

    // Generate URL
    const url = `/uploads/${fileName}`;

    logger.info(`File uploaded: ${fileName} (${processedBuffer.length} bytes)`);

    return {
      url,
      fileName,
      originalName,
      size: processedBuffer.length,
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    logger.error('File upload failed:', error);
    throw error;
  }
}

// Delete file from local storage
export async function deleteFile(fileName: string): Promise<void> {
  try {
    const filePath = path.join(UPLOAD_DIR, fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`File deleted: ${fileName}`);
    }
  } catch (error) {
    logger.error('File deletion failed:', error);
    throw error;
  }
}

// Get file URL
export function getFileUrl(fileName: string): string {
  return `/uploads/${fileName}`;
}

// Check if file exists
export function fileExists(fileName: string): boolean {
  const filePath = path.join(UPLOAD_DIR, fileName);
  return fs.existsSync(filePath);
}

// Get file info
export function getFileInfo(fileName: string): { size: number; created: Date } | null {
  try {
    const filePath = path.join(UPLOAD_DIR, fileName);
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
    };
  } catch {
    return null;
  }
}

export default {
  uploadFile,
  deleteFile,
  getFileUrl,
  fileExists,
  getFileInfo,
};