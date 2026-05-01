// ──────────────────────────────────────────────
// Upload routes — /api/upload/*
// ──────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth';
import * as uploadService from '../services/upload.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const uploadRouter = Router();
uploadRouter.use(requireAuth);

// POST /api/upload/image — загрузка изображения для чата
uploadRouter.post('/image', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ data: null, error: 'No file provided' });
      return;
    }

    const result = await uploadService.uploadChatImage(req.file);
    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/upload/avatar — загрузка аватарки (256x256)
uploadRouter.post('/avatar', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ data: null, error: 'No file provided' });
      return;
    }

    const result = await uploadService.uploadAvatar(req.file);
    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});
