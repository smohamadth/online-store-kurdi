// ---------------------------------------------------------------------------
// Optional S3-compatible (MinIO) object storage.
//
// This is an add-on, not the primary store: the always-available image
// pipeline is services/storage.service.ts (local /uploads directory). These
// helpers exist for deployments that want large objects in MinIO, and
// initializeMinIO() is called at boot in a try/catch that degrades to
// "file storage disabled" when MinIO is unreachable - the API never refuses
// to start because of it.
// ---------------------------------------------------------------------------
import { Client as MinioClient } from 'minio';
import { env } from './environment';
import { logger } from '../utils/logger';

// MinIO client configuration
export const minioClient = new MinioClient({
  endPoint: env.MINIO_ENDPOINT,
  port: parseInt(env.MINIO_PORT),
  useSSL: env.MINIO_USE_SSL === 'true',
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

// Bucket name
export const BUCKET_NAME = env.MINIO_BUCKET;

// Initialize MinIO bucket - idempotent: an existing bucket is left alone,
// so reboots are cheap. Throws on failure; the caller (server.ts) treats
// that as "storage disabled" rather than a fatal error.
export async function initializeMinIO(): Promise<void> {
  try {
    // Check if bucket exists
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);

    if (!bucketExists) {
      // Create bucket ('us-east-1' is a no-op region label for MinIO, which
      // ignores region on create)
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      logger.info(`✅ MinIO bucket "${BUCKET_NAME}" created successfully`);
      
      // Set bucket policy: only objects under public/ are anonymously
      // readable; everything else requires a presigned URL (see
      // getPresignedUrl below).
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/public/*`],
          },
        ],
      };
      
      await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
      logger.info('✅ MinIO bucket policy set successfully');
    } else {
      logger.info(`✅ MinIO bucket "${BUCKET_NAME}" already exists`);
    }
  } catch (error) {
    logger.error('❌ MinIO initialization failed:', error);
    throw error; // Re-throw to be handled by caller
  }
}

// Upload file to MinIO
export async function uploadFile(
  file: Buffer,
  objectName: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    const metaData = {
      'Content-Type': contentType,
      ...metadata,
    };

    await minioClient.putObject(BUCKET_NAME, objectName, file, file.length, metaData);
    
    logger.info(`✅ File uploaded successfully: ${objectName}`);
    return objectName;
  } catch (error) {
    logger.error('❌ File upload failed:', error);
    throw error;
  }
}

// Download file from MinIO
export async function downloadFile(objectName: string): Promise<Buffer> {
  try {
    const dataStream = await minioClient.getObject(BUCKET_NAME, objectName);
    
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      dataStream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      dataStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      dataStream.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    logger.error('❌ File download failed:', error);
    throw error;
  }
}

// Delete file from MinIO
export async function deleteFile(objectName: string): Promise<void> {
  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
    logger.info(`✅ File deleted successfully: ${objectName}`);
  } catch (error) {
    logger.error('❌ File deletion failed:', error);
    throw error;
  }
}

// Get presigned URL for file - the way gated objects (e.g. digital
// downloads) are served without exposing the bucket. expiry is seconds.
export async function getPresignedUrl(
  objectName: string,
  expiry: number = 3600
): Promise<string> {
  try {
    const url = await minioClient.presignedGetObject(BUCKET_NAME, objectName, expiry);
    return url;
  } catch (error) {
    logger.error('❌ Failed to generate presigned URL:', error);
    throw error;
  }
}

// Get public URL for file
export function getPublicUrl(objectName: string): string {
  const protocol = env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  return `${protocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${BUCKET_NAME}/${objectName}`;
}

// List files in bucket
export async function listFiles(prefix: string = ''): Promise<string[]> {
  try {
    const objectsList: string[] = [];
    const objectsStream = minioClient.listObjects(BUCKET_NAME, prefix, true);
    
    return new Promise((resolve, reject) => {
      objectsStream.on('data', (obj) => {
        if (obj.name) {
          objectsList.push(obj.name);
        }
      });
      
      objectsStream.on('error', (err) => {
        reject(err);
      });
      
      objectsStream.on('end', () => {
        resolve(objectsList);
      });
    });
  } catch (error) {
    logger.error('❌ Failed to list files:', error);
    throw error;
  }
}

export default minioClient;