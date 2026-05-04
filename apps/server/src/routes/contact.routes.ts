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
    await prisma.contact.deleteMany({
      where: {
        ownerId: req.user!.userId,
        contactId: req.params.contactId,
      },
    });
    res.json({ data: { success: true }, error: null });
  } catch (err) {
    next(err);
  }
});
