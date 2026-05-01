// ──────────────────────────────────────────────
// Express server entry point
// ──────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './lib/env';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth.routes';

// ── App setup ──

const app = express();

// ── Global middleware ──

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── Request logging ──

app.use((req, _res, next) => {
  logger.debug(`→ ${req.method} ${req.path}`);
  next();
});

// ── Health check ──

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ──

app.use('/api/auth', authRouter);

// Future routes will be added here:
// app.use('/api/users', requireAuth, userRouter);
// app.use('/api/chats', requireAuth, chatRouter);
// app.use('/api/upload', requireAuth, uploadRouter);
// app.use('/api/notifications', requireAuth, notificationRouter);

// ── Global error handler (must be last) ──

app.use(errorHandler);

// ── Start server ──

app.listen(env.PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Client URL:  ${env.CLIENT_URL}`);
});

export default app;
