import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { prisma } from './prisma';
import { env } from './env';

let ioInstance: Server;

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.io is not initialized');
  }
  return ioInstance;
}

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

  ioInstance = io;

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

        // ── Generate notifications for offline/inactive members ──
        try {
          const chatMembers = await prisma.member.findMany({
            where: { chatId: data.chatId },
            select: { userId: true },
          });

          // Get set of user IDs currently in the chat room
          const roomSockets = await io.in(`chat:${data.chatId}`).fetchSockets();
          const activeUserIds = new Set(
            roomSockets.map((s) => (s as any).userId).filter(Boolean)
          );

          for (const member of chatMembers) {
            // Skip the sender and anyone actively in the chat room
            if (member.userId === userId || activeUserIds.has(member.userId)) continue;

            const notification = await prisma.notification.create({
              data: {
                userId: member.userId,
                chatId: data.chatId,
                type: 'message',
                title: `New message from ${username}`,
                body: data.type === 'AUDIO' ? '🎤 Voice message' :
                      data.type === 'IMAGE' ? '🖼️ Photo' :
                      (data.content || '').substring(0, 100) || 'New message',
              },
            });

            io.to(`user:${member.userId}`).emit('notification:new', notification);
          }
        } catch (notifErr) {
          logger.error('Failed to generate notifications:', notifErr);
        }
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

    // ── WebRTC Signaling ──
    socket.on('call:offer', (payload: any) => {
      // Forward offer via chat room AND directly to all members' user rooms
      socket.to(`chat:${payload.chatId}`).emit('call:offer', payload);

      // Also send via user rooms for reliability (recipient may not have chat open)
      prisma.member.findMany({
        where: { chatId: payload.chatId },
        select: { userId: true },
      }).then((members) => {
        members.forEach((m) => {
          if (m.userId !== userId) {
            io.to(`user:${m.userId}`).emit('call:offer', payload);
          }
        });
      }).catch(() => {});
    });

    socket.on('call:answer', (payload: any) => {
      socket.to(`chat:${payload.chatId}`).emit('call:answer', payload);
    });

    socket.on('call:ice-candidate', (payload: any) => {
      socket.to(`chat:${payload.chatId}`).emit('call:ice-candidate', payload);
    });

    // Normal end (during active call, or manual hang-up)
    socket.on('call:end', (payload: { chatId: string }) => {
      socket.to(`chat:${payload.chatId}`).emit('call:end');
    });

    // ── Cancel / Timeout — initiator hangs up before answer ──
    socket.on('call:cancel', async (payload: { chatId: string; recipientId: string }) => {
      logger.info(`📞 Call cancelled by ${username} in chat ${payload.chatId}`);

      // Close recipient's incoming-call modal via their personal user room
      if (payload.recipientId) {
        io.to(`user:${payload.recipientId}`).emit('call:cancelled');
      }
      // Also broadcast to chat room as fallback
      socket.to(`chat:${payload.chatId}`).emit('call:cancelled');

      // Create missed-call notification
      if (payload.recipientId) {
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: payload.recipientId,
              chatId: payload.chatId,
              type: 'call',
              title: `Missed call from ${username}`,
              body: 'The caller hung up — no answer.',
            },
          });
          io.to(`user:${payload.recipientId}`).emit('notification:new', notification);
          logger.info(`📞 Missed call notification sent to ${payload.recipientId}`);
        } catch (err) {
          logger.error('Failed to create missed-call notification:', err);
        }
      }
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Socket disconnected: ${username}`);
    });
  });

  return io;
}
