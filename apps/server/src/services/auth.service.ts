// ──────────────────────────────────────────────
// Auth service — business logic for authentication
// Prisma queries, bcrypt hashing, JWT generation
// ──────────────────────────────────────────────

import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';
import type { RegisterInput, LoginInput } from '@messenger/shared';

const SALT_ROUNDS = 12;

// ── Helpers ──

/** Strip password from user object before sending to client */
function sanitizeUser(user: {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  description: string | null;
  status: string | null;
  lastSeen: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    description: user.description,
    status: user.status,
    lastSeen: user.lastSeen?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

// ── Register ──

export async function register(input: RegisterInput) {
  const { username, email, password } = input;

  // Check if user already exists
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (existing) {
    if (existing.email === email) {
      throw new AppError(409, 'Email is already registered');
    }
    throw new AppError(409, 'Username is already taken');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // Create user
  const user = await prisma.user.create({
    data: {
      username,
      email,
      password: hashedPassword,
    },
  });

  logger.info(`User registered: ${user.username} (${user.id})`);

  // Generate tokens
  const tokens = await createSession(user.id, user.username);

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

// ── Login ──

export async function login(input: LoginInput) {
  const { email, password } = input;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    logger.warn(`Login failed: email not found — ${email}`);
    throw new AppError(401, 'Invalid email or password');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    logger.warn(`Login failed: wrong password — ${email}`);
    throw new AppError(401, 'Invalid email or password');
  }

  logger.info(`User logged in: ${user.username} (${user.id})`);

  // Update lastSeen
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() },
  });

  const tokens = await createSession(user.id, user.username);

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

// ── Refresh ──

export async function refresh(refreshToken: string) {
  if (!refreshToken) {
    throw new AppError(401, 'Refresh token is required');
  }

  // Verify JWT signature + expiration
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  // Check if session still exists in DB
  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session) {
    logger.warn(`Refresh failed: session not found for token (userId: ${payload.userId})`);
    throw new AppError(401, 'Session not found — please log in again');
  }

  if (session.expiresAt < new Date()) {
    logger.warn(`Refresh failed: session expired in DB (userId: ${payload.userId})`);
    // Clean up expired session
    await prisma.session.delete({ where: { id: session.id } });
    throw new AppError(401, 'Session expired — please log in again');
  }

  // Rotate refresh token (old token is invalidated)
  await prisma.session.delete({ where: { id: session.id } });

  // Remove old Redis key
  await redis.del(`session:${session.id}`);

  logger.info(`Token refreshed for: ${session.user.username} (${session.userId})`);

  const tokens = await createSession(session.userId, session.user.username);

  return {
    user: sanitizeUser(session.user),
    ...tokens,
  };
}

// ── Logout ──

export async function logout(refreshToken: string) {
  if (!refreshToken) {
    throw new AppError(400, 'Refresh token is required');
  }

  const session = await prisma.session.findUnique({
    where: { refreshToken },
  });

  if (session) {
    await prisma.session.delete({ where: { id: session.id } });
    await redis.del(`session:${session.id}`);
    logger.info(`User logged out, session deleted: ${session.id}`);
  } else {
    logger.warn('Logout: session not found (already expired or deleted)');
  }

  return { message: 'Logged out successfully' };
}

// ── Internal: Create a new session ──

async function createSession(userId: string, username: string) {
  // Create DB session first to get sessionId
  const session = await prisma.session.create({
    data: {
      userId,
      refreshToken: 'temp', // will be updated after JWT generation
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  // Generate tokens
  const accessToken = generateAccessToken({ userId, username });
  const refreshToken = generateRefreshToken({ userId, sessionId: session.id });

  // Update session with actual refresh token
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshToken },
  });

  // Store session in Redis for fast lookups
  await redis.setex(`session:${session.id}`, REFRESH_TOKEN_TTL_SECONDS, userId);

  return { accessToken, refreshToken };
}
