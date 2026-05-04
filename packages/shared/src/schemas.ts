// ──────────────────────────────────────────────
// Shared Zod validation schemas
// ──────────────────────────────────────────────

import { z } from 'zod';

// ── Auth ──

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers and underscores'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ── User ──

export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  description: z.string().max(256).optional(),
  status: z.string().max(64).optional(),
});

export const searchUsersSchema = z.object({
  q: z.string().min(1).max(64),
});

// ── Chat ──

export const createChatSchema = z.object({
  type: z.enum(['DIRECT', 'GROUP', 'SUPERGROUP']),
  name: z.string().min(1).max(64).optional(),
  memberIds: z.array(z.string()).min(1),
  description: z.string().max(1000).optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().min(1),
});

// ── Topic ──

export const createTopicSchema = z.object({
  name: z.string().min(1).max(64),
});

// ── Message ──

export const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  topicId: z.string().optional(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE']),
  content: z.string().max(4000).optional(),
  fileUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  replyToId: z.string().optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

// ── Env validation ──

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),
  CLIENT_URL: z.string().min(1, 'CLIENT_URL is required'),
  PORT: z.coerce.number().default(4000),
});

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_SOCKET_URL: z.string().url(),
});

// ── Type inference helpers ──

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
