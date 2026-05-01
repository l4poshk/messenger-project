// ──────────────────────────────────────────────
// Global error handler middleware
// Catches unhandled errors, returns consistent API shape
// ──────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ── Known application error ──
  if (err instanceof AppError) {
    logger.warn(`AppError [${err.statusCode}]: ${err.message}`);
    res.status(err.statusCode).json({
      data: null,
      error: err.message,
    });
    return;
  }

  // ── Zod validation error ──
  if (err instanceof ZodError) {
    const messages = err.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    logger.warn('Validation error:', messages);
    res.status(400).json({
      data: null,
      error: messages.join('; '),
    });
    return;
  }

  // ── Unexpected error ──
  logger.error(`Unhandled error [${err.name}]: ${err.message}`);
  logger.error(err.stack || 'No stack trace');

  res.status(500).json({
    data: null,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
}
