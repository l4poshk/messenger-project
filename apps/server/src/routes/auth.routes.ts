// ──────────────────────────────────────────────
// Auth routes — /api/auth/*
// Thin controller layer, delegates to auth.service
// ──────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema } from '@messenger/shared';
import * as authService from '../services/auth.service';
import { logger } from '../lib/logger';

export const authRouter = Router();

const isProduction = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction, // Only true in production (requires HTTPS)
  sameSite: (isProduction ? 'none' : 'lax') as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ── POST /api/auth/register ──

authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await authService.register(input);

      logger.info(`POST /api/auth/register — success (${user.username})`);

      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
      res.status(201).json({
        data: { user, accessToken },
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
      const { user, accessToken, refreshToken } = await authService.login(input);

      logger.info(`POST /api/auth/login — success (${user.username})`);

      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
      res.status(200).json({
        data: { user, accessToken },
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
      const refreshToken = req.cookies.refreshToken;
      const { user, accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken || '');

      logger.info(`POST /api/auth/refresh — token rotated (${user.username})`);

      res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);
      res.status(200).json({
        data: { user, accessToken },
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
      const refreshToken = req.cookies.refreshToken;
      await authService.logout(refreshToken || '');

      logger.info('POST /api/auth/logout — success');

      res.clearCookie('refreshToken');
      res.status(200).json({
        data: { message: 'Logged out successfully' },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);
