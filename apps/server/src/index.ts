// ──────────────────────────────────────────────
// Express server entry point
// ──────────────────────────────────────────────

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './lib/env';
import { logger } from './lib/logger';
import { initSocket } from './lib/socket';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth.routes';
import { chatRouter } from './routes/chat.routes';
import { userRouter } from './routes/user.routes';
import { uploadRouter } from './routes/upload.routes';

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
app.use('/api/users', userRouter);
app.use('/api/chats', chatRouter);
app.use('/api/upload', uploadRouter);

// ── Global error handler (must be last) ──

app.use(errorHandler);

// ── Start server ──

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Client URL:  ${env.CLIENT_URL}`);
});

export default app;
