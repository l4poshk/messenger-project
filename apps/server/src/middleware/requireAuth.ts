// ──────────────────────────────────────────────
// requireAuth middleware
// Extracts and validates JWT from Authorization header
// Attaches user payload to req for downstream handlers
// ──────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../lib/jwt';
import { logger } from '../lib/logger';

// Extend Express Request with our user payload
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  // ── No header at all ──
  if (!authHeader) {
    logger.warn(`Auth: Missing Authorization header — ${req.method} ${req.path}`);
    res.status(401).json({
      data: null,
      error: 'Authorization header is required',
    });
    return;
  }

  // ── Must be "Bearer <token>" ──
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn(`Auth: Malformed Authorization header — ${req.method} ${req.path}`);
    res.status(401).json({
      data: null,
      error: 'Authorization header must be: Bearer <token>',
    });
    return;
  }

  const token = parts[1];
  const payload = verifyAccessToken(token);

  // ── Token invalid or expired (detailed logging happens inside verifyAccessToken) ──
  if (!payload) {
    res.status(401).json({
      data: null,
      error: 'Invalid or expired access token',
    });
    return;
  }

  // ── Attach user to request ──
  req.user = payload;
  next();
}
