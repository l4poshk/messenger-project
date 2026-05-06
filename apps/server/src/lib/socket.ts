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

    // ── Update status to ONLINE ──
    const updateStatus = async (status: 'ONLINE' | 'OFFLINE') => {
      try {
        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            status,
            lastSeen: new Date(),
          },
        });

        // Find all chats this user is in to notify others
        const userChats = await prisma.member.findMany({
          where: { userId },
          select: { chatId: true },
        });

        for (const { chatId } of userChats) {
          socket.to(`chat:${chatId}`).emit('user:status', {
            userId,
            status,
            lastSeen: user.lastSeen,
          });
        }
      } catch (err) {
        logger.error(`Failed to update status for user ${userId}:`, err);
      }
    };

    updateStatus('ONLINE');

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

    // ── Group Call State (In-memory) ──
    // chatId -> Set of userIds
    const activeCalls = new Map<string, Set<string>>();

    // ── WebRTC Signaling (Group / Mesh) ──

    socket.on('call:join', (payload: { chatId: string }) => {
      const { chatId } = payload;
      if (!activeCalls.has(chatId)) {
        activeCalls.set(chatId, new Set());
      }
      
      const participants = activeCalls.get(chatId)!;
      
      // Limit to 4 participants for mesh stability
      if (participants.size >= 4 && !participants.has(userId)) {
        socket.emit('call:error', { message: 'Call is full (max 4 participants)' });
        return;
      }

      participants.add(userId);
      socket.join(`call:${chatId}`);
      
      logger.info(`📞 User ${username} joined call in chat ${chatId}. Total: ${participants.size}`);

      // Tell the joiner who else is in the call
      const otherUsers = Array.from(participants).filter(id => id !== userId);
      socket.emit('call:participants', { participants: otherUsers });

      // Tell others that someone joined
      socket.to(`call:${chatId}`).emit('call:user-joined', { userId, username });
    });

    socket.on('call:offer', (payload: { chatId: string; toUserId: string; offer: any; type: string }) => {
      // Send offer directly to the specific user
      logger.debug(`📞 Offer from ${username} to user ${payload.toUserId}`);
      io.to(`user:${payload.toUserId}`).emit('call:offer', {
        chatId: payload.chatId,
        callerId: userId, // Current sender is the caller for this peer connection
        offer: payload.offer,
        type: payload.type
      });
    });

    socket.on('call:answer', (payload: { chatId: string; toUserId: string; answer: any }) => {
      logger.debug(`📞 Answer from ${username} to user ${payload.toUserId}`);
      io.to(`user:${payload.toUserId}`).emit('call:answer', {
        chatId: payload.chatId,
        userId: userId,
        answer: payload.answer
      });
    });

    socket.on('call:ice-candidate', (payload: { chatId: string; toUserId: string; candidate: any }) => {
      io.to(`user:${payload.toUserId}`).emit('call:ice-candidate', {
        chatId: payload.chatId,
        userId: userId,
        candidate: payload.candidate
      });
    });

    socket.on('call:leave', (payload: { chatId: string }) => {
      const participants = activeCalls.get(payload.chatId);
      if (participants) {
        participants.delete(userId);
        if (participants.size === 0) {
          activeCalls.delete(payload.chatId);
        }
      }
      socket.leave(`call:${payload.chatId}`);
      socket.to(`call:${payload.chatId}`).emit('call:user-left', { userId });
      logger.info(`📞 User ${username} left call in chat ${payload.chatId}`);
    });

    // ── Legacy / Initial signaling for incoming call notification ──
    // This is still needed to "ring" the recipients who aren't in the call yet
    socket.on('call:start', async (payload: { chatId: string; type: 'audio' | 'video' }) => {
      const members = await prisma.member.findMany({
        where: { chatId: payload.chatId },
        select: { userId: true },
      });

      members.forEach((m) => {
        if (m.userId !== userId) {
          io.to(`user:${m.userId}`).emit('call:incoming', {
            chatId: payload.chatId,
            callerId: userId,
            callerName: username,
            type: payload.type
          });
        }
      });
    });

    // ── Cancel / Timeout — initiator hangs up before answer ──
    socket.on('call:cancel', async (payload: { chatId: string; recipientId: string }) => {
      logger.info(`📞 Call cancelled by ${username} in chat ${payload.chatId}`);

      if (payload.recipientId) {
        io.to(`user:${payload.recipientId}`).emit('call:cancelled');
      } else {
        socket.to(`chat:${payload.chatId}`).emit('call:cancelled');
      }

      // Create missed-call notification
      if (payload.recipientId) {
        try {
          await prisma.notification.create({
            data: {
              userId: payload.recipientId,
              chatId: payload.chatId,
              type: 'call',
              title: `Missed call from ${username}`,
              body: 'The caller hung up — no answer.',
            },
          });
          io.to(`user:${payload.recipientId}`).emit('notification:new');
        } catch (err) {
          logger.error('Failed to create missed-call notification:', err);
        }
      }
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Socket disconnected: ${username}`);
      updateStatus('OFFLINE');
    });
  });

  return io;
}
