// ──────────────────────────────────────────────
// User routes — /api/users/*
// ──────────────────────────────────────────────

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';

export const userRouter = Router();
userRouter.use(requireAuth);

// GET /api/users/search?q=username
userRouter.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q) {
      res.json({ data: [], error: null });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        id: { not: req.user!.userId }
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        description: true,
        status: true,
        lastSeen: true,
        createdAt: true
      },
      take: 20
    });

    res.json({ data: users, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me
userRouter.get('/me', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        description: true,
        status: true,
        lastSeen: true,
        createdAt: true
      }
    });
    res.json({ data: user, error: null });
  } catch (err) {
    next(err);
  }
});
