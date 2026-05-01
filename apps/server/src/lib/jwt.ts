// ──────────────────────────────────────────────
// JWT helpers — access + refresh token management
// ──────────────────────────────────────────────

import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { env } from './env';
import { logger } from './logger';

// ── Token payload shape ──

export interface AccessTokenPayload {
  userId: string;
  username: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
}

// ── Constants ──

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '30d';

// How many seconds until refresh token expires (for Redis TTL)
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ── Generate tokens ──

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

// ── Verify tokens ──

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    return decoded;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      logger.warn('JWT access token expired');
    } else if (err instanceof JsonWebTokenError) {
      logger.warn(`JWT access token invalid: ${err.message}`);
    } else {
      logger.error('JWT access token verification failed:', err);
    }
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    return decoded;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      logger.warn('JWT refresh token expired');
    } else if (err instanceof JsonWebTokenError) {
      logger.warn(`JWT refresh token invalid: ${err.message}`);
    } else {
      logger.error('JWT refresh token verification failed:', err);
    }
    return null;
  }
}
