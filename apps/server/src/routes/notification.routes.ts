// ──────────────────────────────────────────────
// Notification routes — /api/notifications/*
// ──────────────────────────────────────────────

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

// GET /api/notifications — fetch all notifications for current user
notificationRouter.get('/', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ data: notifications, error: null });
  } catch (err) { next(err); }
});

// POST /api/notifications/read-all — mark all as read
notificationRouter.post('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, read: false },
      data: { read: true },
    });
    res.json({ data: { success: true }, error: null });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read — mark single as read
notificationRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id, userId: req.user!.userId },
      data: { read: true },
    });
    res.json({ data: notification, error: null });
  } catch (err) { next(err); }
});
