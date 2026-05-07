// ──────────────────────────────────────────────
// Upload service — image/video processing + Cloudinary storage
// ──────────────────────────────────────────────

import sharp from 'sharp';
import crypto from 'crypto';
import { uploadToCloudinary } from '../lib/cloudinary';
import { AppError } from '../middleware/errorHandler';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'];
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

interface MediaUploadResult {
  url: string;
  publicId: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

/**
 * Process and upload a chat image.
 */
export async function uploadChatImage(file: Express.Multer.File): Promise<MediaUploadResult> {
  validateFile(file, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE);

  const processed = await sharp(file.buffer)
    .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const { url, public_id } = await uploadToCloudinary(processed.data, 'chat/images', 'image');

  return {
    url,
    publicId: public_id,
    size: processed.info.size,
    width: processed.info.width,
    height: processed.info.height,
  };
}

/**
 * Upload a chat video.
 */
export async function uploadChatVideo(file: Express.Multer.File): Promise<MediaUploadResult> {
  validateFile(file, ALLOWED_VIDEO_TYPES, MAX_VIDEO_SIZE);

  const { url, public_id, duration } = await uploadToCloudinary(file.buffer, 'chat/videos', 'video');

  return {
    url,
    publicId: public_id,
    size: file.size,
    duration,
  };
}

/**
 * Process and upload an avatar.
 */
export async function uploadAvatar(file: Express.Multer.File): Promise<MediaUploadResult> {
  validateFile(file, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE);

  const processed = await sharp(file.buffer)
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  const { url, public_id } = await uploadToCloudinary(processed.data, 'avatars', 'image');

  return {
    url,
    publicId: public_id,
    size: processed.info.size,
    width: processed.info.width,
    height: processed.info.height,
  };
}

/**
 * Upload an audio file (voice message).
 */
export async function uploadAudio(
  file: Express.Multer.File,
  duration?: number
): Promise<MediaUploadResult> {
  validateFile(file, ALLOWED_AUDIO_TYPES, MAX_AUDIO_SIZE);

  const { url, public_id, duration: detectedDuration } = await uploadToCloudinary(
    file.buffer, 
    'chat/audio', 
    'video' // Cloudinary treats audio as video resource type
  );

  return {
    url,
    publicId: public_id,
    size: file.size,
    duration: duration ?? detectedDuration,
  };
}

// ── Validators ──

function validateFile(file: Express.Multer.File, allowedTypes: string[], maxSize: number) {
  if (!allowedTypes.includes(file.mimetype)) {
    throw new AppError(400, `Unsupported file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`);
  }
  if (file.size > maxSize) {
    throw new AppError(400, `File too large. Max: ${maxSize / 1024 / 1024}MB`);
  }
}

function generateKey(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}
