// ──────────────────────────────────────────────
// Contact routes — /api/contacts/*
// ──────────────────────────────────────────────

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';

export const contactRouter = Router();
contactRouter.use(requireAuth);

// GET /api/contacts — get my contacts (with user info)
contactRouter.get('/', async (req, res, next) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { ownerId: req.user!.userId },
      include: {
        contact: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true,
            description: true,
            status: true,
            lastSeen: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Flatten: return the user object directly
    const result = contacts.map((c) => ({
      ...c.contact,
      contactRecordId: c.id,
      addedAt: c.createdAt,
    }));

    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/contacts — add a contact
contactRouter.post('/', async (req, res, next) => {
  try {
    const { contactId } = req.body as { contactId: string };
    const userId = req.user!.userId;

    if (contactId === userId) {
      res.status(400).json({ data: null, error: 'Cannot add yourself' });
      return;
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({ where: { id: contactId } });
    if (!targetUser) {
      res.status(404).json({ data: null, error: 'User not found' });
      return;
    }

    // Upsert to avoid duplicates
    const contact = await prisma.contact.upsert({
      where: {
        ownerId_contactId: { ownerId: userId, contactId },
      },
      update: {},
      create: { ownerId: userId, contactId },
      include: {
        contact: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true,
            description: true,
            status: true,
            lastSeen: true,
          },
        },
      },
    });

    res.status(201).json({
      data: {
        ...contact.contact,
        contactRecordId: contact.id,
        addedAt: contact.createdAt,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:contactId — remove a contact
contactRouter.delete('/:contactId', async (req, res, next) => {
  try {
    const ownerId = req.user!.userId;
    const contactId = req.params.contactId;

    // 1. Delete the contact record
    await prisma.contact.deleteMany({
      where: { ownerId, contactId },
    });

    // 2. Find and delete the DIRECT chat between these two users
    const directChat = await prisma.chat.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId: ownerId } } },
          { members: { some: { userId: contactId } } }
        ]
      }
    });

    if (directChat) {
      // Deleting the chat will cascade delete members and messages (based on schema)
      // Also manually delete notifications for this chat
      await prisma.notification.deleteMany({ where: { chatId: directChat.id } });
      await prisma.chat.delete({ where: { id: directChat.id } });

      // 3. Notify both users via Socket to remove the chat from their lists
      const { getIO } = require('../lib/socket');
      const io = getIO();
      if (io) {
        io.to(`user:${ownerId}`).to(`user:${contactId}`).emit('chat:deleted', { chatId: directChat.id });
      }
    }

    res.json({ data: { success: true, chatId: directChat?.id }, error: null });
  } catch (err) {
    next(err);
  }
});
