// ──────────────────────────────────────────────
// Auth routes — /api/auth/*
// Thin controller layer, delegates to auth.service
// ──────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema } from '@messenger/shared';
import * as authService from '../services/auth.service';
import { logger } from '../lib/logger';

export const authRouter = Router();

// ── POST /api/auth/register ──

authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerSchema.parse(req.body);
      const result = await authService.register(input);

      logger.info(`POST /api/auth/register — success (${result.user.username})`);

      res.status(201).json({
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/login ──

authRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = loginSchema.parse(req.body);
      const result = await authService.login(input);

      logger.info(`POST /api/auth/login — success (${result.user.username})`);

      res.status(200).json({
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/refresh ──

authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      const result = await authService.refresh(refreshToken || '');

      logger.info(`POST /api/auth/refresh — token rotated (${result.user.username})`);

      res.status(200).json({
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/logout ──

authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      const result = await authService.logout(refreshToken || '');

      logger.info('POST /api/auth/logout — success');

      res.status(200).json({
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);
