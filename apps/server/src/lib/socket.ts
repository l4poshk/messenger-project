import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { prisma } from './prisma';
import { env } from './env';

export function initSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Разрешаем оба транспорта для совместимости
    transports: ['polling', 'websocket'],
    allowEIO3: true,
  });

  logger.info(`🔌 Socket.io initialized, CORS origin: ${env.CLIENT_URL}`);

  // Middleware для аутентификации сокета
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    logger.debug(`🔌 Socket auth attempt from ${socket.id}, token present: ${!!token}`);

    if (!token) {
      logger.warn(`🔌 Socket rejected: no token provided (${socket.id})`);
      return next(new Error('Authentication error: Token missing'));
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      logger.warn(`🔌 Socket rejected: invalid/expired token (${socket.id})`);
      return next(new Error('Authentication error: Invalid token'));
    }

    (socket as any).userId = payload.userId;
    (socket as any).username = payload.username;
    logger.info(`🔌 Socket authenticated: ${payload.username} (${socket.id})`);
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    const username = (socket as any).username;

    logger.info(`🔌 Socket connected: ${username} (${userId})`);

    // Присоединяемся к личной комнате пользователя (для уведомлений)
    socket.join(`user:${userId}`);

    // Присоединение к комнате чата
    socket.on('chat:join', (chatId: string) => {
      socket.join(`chat:${chatId}`);
      logger.debug(`User ${username} joined chat:${chatId}`);
    });

    // Отправка сообщения
    socket.on('message:send', async (data: {
      chatId: string;
      content: string;
      type: 'TEXT' | 'IMAGE' | 'AUDIO';
      topicId?: string;
      fileUrl?: string;
      duration?: number;
      waveform?: number[];
    }) => {
      try {
        const message = await prisma.message.create({
          data: {
            chatId: data.chatId,
            senderId: userId,
            content: data.content || '',
            type: data.type || 'TEXT',
            ...(data.topicId ? { topicId: data.topicId } : {}),
            ...(data.fileUrl ? { fileUrl: data.fileUrl } : {}),
            ...(data.duration ? { duration: Math.round(data.duration) } : {}),
            ...(data.waveform && data.waveform.length > 0 ? { waveform: data.waveform } : {}),
          },
          include: {
            sender: {
              select: { id: true, username: true, avatar: true }
            }
          }
        });

        // Рассылаем всем в комнате чата
        io.to(`chat:${data.chatId}`).emit('message:new', message);
      } catch (err) {
        logger.error('Failed to save message:', err);
      }
    });

    // Индикатор печати
    socket.on('typing:start', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing:update', {
        chatId,
        userId,
        username,
        isTyping: true
      });
    });

    socket.on('typing:stop', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing:update', {
        chatId,
        userId,
        username,
        isTyping: false
      });
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Socket disconnected: ${username}`);
    });
  });

  return io;
}
