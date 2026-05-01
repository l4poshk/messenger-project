// ──────────────────────────────────────────────
// Cloudflare R2 client (S3-compatible)
// Falls back gracefully if R2 is not configured.
// ──────────────────────────────────────────────

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env';
import { logger } from './logger';
import { AppError } from '../middleware/errorHandler';

function isR2Configured(): boolean {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME);
}

function getClient(): S3Client {
  if (!isR2Configured()) {
    throw new AppError(503, 'File upload is not configured. Set R2_* environment variables.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload a file buffer to R2 and return its public URL.
 */
export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const r2 = getClient();

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const url = `${env.R2_PUBLIC_URL}/${key}`;
  logger.info(`📤 Uploaded to R2: ${url}`);
  return url;
}

/**
 * Delete a file from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const r2 = getClient();

  await r2.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
  logger.info(`🗑️ Deleted from R2: ${key}`);
}

export { isR2Configured };
