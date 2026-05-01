import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import * as chatService from '../services/chat.service';

export const chatRouter = Router();

// Все роуты чатов требуют авторизации
chatRouter.use(requireAuth);

chatRouter.get('/', async (req, res, next) => {
  try {
    const chats = await chatService.getUserChats(req.user!.userId);
    res.json({ data: chats, error: null });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/:id/messages', async (req, res, next) => {
  try {
    const messages = await chatService.getChatMessages(req.params.id, req.user!.userId);
    res.json({ data: messages, error: null });
  } catch (err) {
    next(err);
  }
});
