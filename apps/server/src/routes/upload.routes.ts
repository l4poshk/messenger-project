// ──────────────────────────────────────────────
// Upload routes — /api/upload/*
// ──────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth';
import * as uploadService from '../services/upload.service';
import { extractKeyFromUrl, getBufferFromR2, isR2Configured } from '../lib/r2';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const uploadRouter = Router();

// ══════════════════════════════════════════════
// PUBLIC: Media streaming proxy (no auth)
// ══════════════════════════════════════════════
// Downloads the file from R2 as a Buffer, then serves it
// with proper Range/206 support for <audio> seeking.
// ══════════════════════════════════════════════

uploadRouter.get('/proxy', async (req, res) => {
  try {
    const fileUrl = req.query.url as string;
    if (!fileUrl) {
      res.status(400).json({ error: 'Missing url parameter' });
      return;
    }

    if (!isR2Configured()) {
      res.status(503).json({ error: 'R2 not configured' });
      return;
    }

    const key = extractKeyFromUrl(fileUrl);
    if (!key) {
      logger.warn(`[Proxy] Cannot extract key from: ${fileUrl}`);
      res.status(400).json({ error: 'Invalid R2 URL' });
      return;
    }

    logger.debug(`[Proxy] key=${key} range=${req.headers.range || 'full'}`);

    // Download entire file as Buffer (voice messages are small, <2MB)
    const { buffer, contentType } = await getBufferFromR2(key);
    const totalSize = buffer.length;

    logger.debug(`[Proxy] Got ${totalSize} bytes, type=${contentType}`);

    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      // ── 206 Partial Content ──
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.status(416)
          .setHeader('Content-Range', `bytes */${totalSize}`)
          .end();
        return;
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        res.status(416)
          .setHeader('Content-Range', `bytes */${totalSize}`)
          .end();
        return;
      }

      const chunk = buffer.subarray(start, end + 1);

      res.status(206);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', chunk.length);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(chunk);
    } else {
      // ── 200 Full content ──
      res.status(200);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', totalSize);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(buffer);
    }
  } catch (err: any) {
    logger.error(`[Proxy] ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream media' });
    }
  }
});

// ══════════════════════════════════════════════
// PROTECTED: Upload endpoints (require auth)
// ══════════════════════════════════════════════

uploadRouter.use(requireAuth);

// POST /api/upload/image
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

// POST /api/upload/avatar
uploadRouter.post('/avatar', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ data: null, error: 'No file provided' });
      return;
    }
    const result = await uploadService.uploadAvatar(req.file);

    // ── Update User record with new avatar URL ──
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatar: result.url },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        description: true,
        status: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    res.json({ data: updatedUser, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/upload/audio
uploadRouter.post('/audio', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ data: null, error: 'No file provided' });
      return;
    }
    const duration = req.body.duration ? parseFloat(req.body.duration) : undefined;
    const result = await uploadService.uploadAudio(req.file, duration);
    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});
