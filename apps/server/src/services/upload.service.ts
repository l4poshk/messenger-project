// ──────────────────────────────────────────────
// Upload service — image processing + R2 storage
// ──────────────────────────────────────────────

import sharp from 'sharp';
import crypto from 'crypto';
import { uploadToR2 } from '../lib/r2';
import { AppError } from '../middleware/errorHandler';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface UploadResult {
  url: string;
  key: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Process and upload a chat image (max 1920px wide, WebP output).
 */
export async function uploadChatImage(file: Express.Multer.File): Promise<UploadResult> {
  validateFile(file);

  const processed = await sharp(file.buffer)
    .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const key = `chat/${generateKey()}.webp`;
  const url = await uploadToR2(key, processed.data, 'image/webp');

  return {
    url,
    key,
    width: processed.info.width,
    height: processed.info.height,
    size: processed.info.size,
  };
}

/**
 * Process and upload an avatar (256x256, WebP).
 */
export async function uploadAvatar(file: Express.Multer.File): Promise<UploadResult> {
  validateFile(file);

  const processed = await sharp(file.buffer)
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  const key = `avatars/${generateKey()}.webp`;
  const url = await uploadToR2(key, processed.data, 'image/webp');

  return {
    url,
    key,
    width: processed.info.width,
    height: processed.info.height,
    size: processed.info.size,
  };
}

function validateFile(file: Express.Multer.File) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError(400, `Unsupported file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new AppError(400, `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }
}

function generateKey(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}
