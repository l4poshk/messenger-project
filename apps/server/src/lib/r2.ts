// ──────────────────────────────────────────────
// Cloudflare R2 client (S3-compatible)
// Falls back gracefully if R2 is not configured.
// ──────────────────────────────────────────────

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from './env';
import { logger } from './logger';
import { AppError } from '../middleware/errorHandler';

function isR2Configured(): boolean {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME);
}

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!isR2Configured()) {
    throw new AppError(503, 'File upload is not configured. Set R2_* environment variables.');
  }

  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  return _client;
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

/**
 * Get file metadata (size, content-type) from R2.
 */
export async function headFromR2(key: string) {
  const r2 = getClient();

  const res = await r2.send(
    new HeadObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );

  return {
    contentLength: res.ContentLength || 0,
    contentType: res.ContentType || 'application/octet-stream',
  };
}

/**
 * Stream a file from R2 with optional Range support.
 * Returns the SDK response with Body as a Readable stream.
 */
/**
 * Download a file from R2 as a Buffer.
 * Uses SDK v3 transformToByteArray() for reliable consumption.
 */
export async function getBufferFromR2(key: string): Promise<{
  buffer: Buffer;
  contentType: string;
  contentLength: number;
}> {
  const r2 = getClient();

  const res = await r2.send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );

  // SDK v3: Body is SdkStream — use transformToByteArray for guaranteed result
  const bytes = await res.Body!.transformToByteArray();
  const buffer = Buffer.from(bytes);

  return {
    buffer,
    contentType: res.ContentType || 'application/octet-stream',
    contentLength: buffer.length,
  };
}

/**
 * Extract the R2 key from a public URL.
 * e.g. "https://pub-xxx.r2.dev/voice/1234.webm" → "voice/1234.webm"
 */
export function extractKeyFromUrl(url: string): string | null {
  const publicUrl = env.R2_PUBLIC_URL;
  if (!publicUrl || !url.startsWith(publicUrl)) {
    return null;
  }
  // Remove public URL prefix and leading slash
  return url.slice(publicUrl.length).replace(/^\//, '');
}

export { isR2Configured };
