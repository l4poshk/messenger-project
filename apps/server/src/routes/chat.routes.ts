// ──────────────────────────────────────────────
// Chat routes — /api/chats/*
// ──────────────────────────────────────────────

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { createChatSchema, createTopicSchema } from '@messenger/shared';
import * as chatService from '../services/chat.service';
import { getIO } from '../lib/socket';
import { prisma } from '../lib/prisma';

export const chatRouter = Router();
chatRouter.use(requireAuth);

// GET /api/chats — список чатов пользователя
chatRouter.get('/', async (req, res, next) => {
  try {
    const chats = await chatService.getUserChats(req.user!.userId);
    res.json({ data: chats, error: null });
  } catch (err) { next(err); }
});

// POST /api/chats — создать чат
chatRouter.post('/', async (req, res, next) => {
  try {
    const input = createChatSchema.parse(req.body);
    const chat = await chatService.createChat(
      req.user!.userId,
      input.type as any,
      input.memberIds,
      input.name,
      input.description
    );

    // Рассылаем событие всем участникам нового чата
    const io = getIO();
    if (chat.members) {
      chat.members.forEach((m: any) => {
        io.to(`user:${m.userId}`).emit('chat:new', chat);
      });
    }

    res.status(201).json({ data: chat, error: null });
  } catch (err) { next(err); }
});

// GET /api/chats/:id/messages
chatRouter.get('/:id/messages', async (req, res, next) => {
  try {
    const topicId = req.query.topicId as string | undefined;
    const messages = await chatService.getChatMessages(
      req.params.id, req.user!.userId, topicId
    );
    res.json({ data: messages, error: null });
  } catch (err) { next(err); }
});

// POST /api/chats/:id/members — добавить участника
chatRouter.post('/:id/members', async (req, res, next) => {
  try {
    const { userId } = req.body as { userId: string };
    const member = await chatService.addMember(req.params.id, req.user!.userId, userId);
    res.status(201).json({ data: member, error: null });
  } catch (err) { next(err); }
});

// DELETE /api/chats/:id/members/:userId — удалить участника
chatRouter.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const result = await chatService.removeMember(
      req.params.id, req.user!.userId, req.params.userId
    );
    res.json({ data: result, error: null });
  } catch (err) { next(err); }
});

// PATCH /api/chats/:id/members/:userId/role — изменить роль
chatRouter.patch('/:id/members/:userId/role', async (req, res, next) => {
  try {
    const { role } = req.body as { role: string };
    const member = await chatService.changeRole(
      req.params.id, req.user!.userId, req.params.userId, role as any
    );
    res.json({ data: member, error: null });
  } catch (err) { next(err); }
});

// PATCH /api/chats/:id/members/:userId/promote — назначить админом
chatRouter.patch('/:id/members/:userId/promote', async (req, res, next) => {
  try {
    const member = await chatService.promoteToAdmin(
      req.params.id, req.user!.userId, req.params.userId
    );
    res.json({ data: member, error: null });
  } catch (err) { next(err); }
});

// PATCH /api/chats/:id/members/:userId/demote — разжаловать админа
chatRouter.patch('/:id/members/:userId/demote', async (req, res, next) => {
  try {
    const member = await chatService.demoteAdmin(
      req.params.id, req.user!.userId, req.params.userId
    );
    res.json({ data: member, error: null });
  } catch (err) { next(err); }
});

// PATCH /api/chats/:id — обновить метаданные чата
chatRouter.patch('/:id', async (req, res, next) => {
  try {
    const chat = await chatService.updateChat(
      req.params.id, req.user!.userId, req.body
    );

    // Рассылаем обновление всем участникам
    getIO().to(`chat:${chat.id}`).emit('chat:update', chat);

    res.json({ data: chat, error: null });
  } catch (err) { next(err); }
});

import multer from 'multer';
import * as uploadService from '../services/upload.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// POST /api/chats/:id/messages — отправить сообщение (поддерживает файлы)
chatRouter.post('/:id/messages', upload.single('file'), async (req, res, next) => {
  try {
    const chatId = req.params.id as string;
    const content = req.body.content as string | undefined;
    const type = req.body.type as string | undefined;
    const topicId = req.body.topicId as string | undefined;

    let fileUrl: string | undefined;
    let messageType = (type as any) || 'TEXT';

    if (req.file) {
      if (messageType === 'IMAGE') {
        const result = await uploadService.uploadChatImage(req.file);
        fileUrl = result.url;
      } else if (messageType === 'VIDEO') {
        const result = await uploadService.uploadChatVideo(req.file);
        fileUrl = result.url;
      } else if (messageType === 'AUDIO') {
        const result = await uploadService.uploadAudio(req.file);
        fileUrl = result.url;
      }
    }

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: req.user!.userId,
        content: content || '',
        type: messageType,
        topicId: topicId || null,
        fileUrl,
        isForwarded: req.body.isForwarded === 'true' || req.body.isForwarded === true || false,
        originalSenderName: req.body.originalSenderName || null,
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } }
      }
    });

    getIO().to(`chat:${chatId}`).emit('message:new', message);

    res.status(201).json({ data: message, error: null });
  } catch (err) { next(err); }
});

// GET /api/chats/:id/topics — топики суперогруппы
chatRouter.get('/:id/topics', async (req, res, next) => {
  try {
    const topics = await chatService.getTopics(req.params.id, req.user!.userId);
    res.json({ data: topics, error: null });
  } catch (err) { next(err); }
});

// POST /api/chats/:id/topics — создать топик
chatRouter.post('/:id/topics', async (req, res, next) => {
  try {
    const input = createTopicSchema.parse(req.body);
    const topic = await chatService.createTopic(
      req.params.id, req.user!.userId, input.name
    );
    res.status(201).json({ data: topic, error: null });
  } catch (err) { next(err); }
});
