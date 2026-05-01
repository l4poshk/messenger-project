// ──────────────────────────────────────────────
// Upload service — image/audio processing + R2 storage
// ──────────────────────────────────────────────

import sharp from 'sharp';
import crypto from 'crypto';
import { uploadToR2 } from '../lib/r2';
import { AppError } from '../middleware/errorHandler';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

interface ImageUploadResult {
  url: string;
  key: string;
  width: number;
  height: number;
  size: number;
}

interface AudioUploadResult {
  url: string;
  key: string;
  size: number;
  duration: number | null;
  mimeType: string;
}

/**
 * Process and upload a chat image (max 1920px wide, WebP output).
 */
export async function uploadChatImage(file: Express.Multer.File): Promise<ImageUploadResult> {
  validateImageFile(file);

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
export async function uploadAvatar(file: Express.Multer.File): Promise<ImageUploadResult> {
  validateImageFile(file);

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

/**
 * Upload an audio file (voice message). No re-encoding — browser already
 * encodes via MediaRecorder (webm/ogg). Duration is passed from client.
 */
export async function uploadAudio(
  file: Express.Multer.File,
  duration?: number
): Promise<AudioUploadResult> {
  validateAudioFile(file);

  // Determine extension from mimetype
  const extMap: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  };
  const ext = extMap[file.mimetype] || 'webm';
  const key = `voice/${generateKey()}.${ext}`;
  const url = await uploadToR2(key, file.buffer, file.mimetype);

  return {
    url,
    key,
    size: file.size,
    duration: duration ?? null,
    mimeType: file.mimetype,
  };
}

// ── Validators ──

function validateImageFile(file: Express.Multer.File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    throw new AppError(400, `Unsupported image type: ${file.mimetype}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`);
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new AppError(400, `Image too large. Max: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }
}

function validateAudioFile(file: Express.Multer.File) {
  if (!ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    throw new AppError(400, `Unsupported audio type: ${file.mimetype}. Allowed: ${ALLOWED_AUDIO_TYPES.join(', ')}`);
  }
  if (file.size > MAX_AUDIO_SIZE) {
    throw new AppError(400, `Audio too large. Max: ${MAX_AUDIO_SIZE / 1024 / 1024}MB`);
  }
}

function generateKey(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

