import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { prisma } from './prisma';
import { env } from './env';
import { redis } from './redis';

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
    transports: ['polling', 'websocket'],
    allowEIO3: true,
  });

  ioInstance = io;

  logger.info(`🔌 Socket.io initialized, CORS origin: ${env.CLIENT_URL}`);

  // Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: Token missing'));

    const payload = verifyAccessToken(token);
    if (!payload) return next(new Error('Authentication error: Invalid token'));

    (socket as any).userId = payload.userId;
    (socket as any).username = payload.username;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    const username = (socket as any).username;

    logger.info(`🔌 Socket connected: ${username} (${userId})`);
    socket.join(`user:${userId}`);

    // ── Status Update ──
    const updateStatus = async (status: 'ONLINE' | 'OFFLINE') => {
      try {
        const user = await prisma.user.update({
          where: { id: userId },
          data: { status, lastSeen: new Date() },
        });

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
        logger.error(`Failed to update status for ${userId}:`, err);
      }
    };

    updateStatus('ONLINE');

    // ── Chat & Messaging ──
    socket.on('chat:join', (chatId: string) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on('message:send', async (data: any) => {
      try {
        const message = await prisma.message.create({
          data: {
            chatId: data.chatId,
            senderId: userId,
            content: data.content || '',
            type: data.type || 'TEXT',
            topicId: data.topicId,
            fileUrl: data.fileUrl,
            duration: data.duration ? Math.round(data.duration) : undefined,
            waveform: data.waveform,
            isRead: false,
            isForwarded: data.isForwarded || false,
            originalSenderName: data.originalSenderName || null,
          },
          include: {
            sender: { select: { id: true, username: true, avatar: true } }
          }
        });
        io.to(`chat:${data.chatId}`).emit('message:new', message);

        // ── Notify all members individually (so unread counts update even if not in chat room) ──
        const members = await prisma.member.findMany({
          where: { chatId: data.chatId },
          select: { userId: true }
        });

        members.forEach(m => {
          // We already emitted to the chat room, but users might not be joined if chat is inactive
          if (m.userId !== userId) {
            io.to(`user:${m.userId}`).emit('message:new', message);
          }
        });

        // ── Create Notifications ──
        import('../services/notification.service').then(({ notifyChatMembers }) => {
          notifyChatMembers({
            chatId: data.chatId,
            senderId: userId,
            type: 'message',
            title: username,
            body: 
              data.type === 'TEXT' ? data.content :
              data.type === 'AUDIO' ? '🎤 Voice message' :
              data.type === 'IMAGE' ? '📷 Photo' :
              data.type === 'VIDEO' ? '🎥 Video' : '📁 File',
          });
        });
      } catch (err) {
        logger.error('Failed to save message:', err);
      }
    });

    socket.on('message:read', async ({ chatId }: { chatId: string }) => {
      try {
        await prisma.message.updateMany({
          where: {
            chatId,
            senderId: { not: userId },
            isRead: false,
          },
          data: { isRead: true },
        });

        // Notify room that messages were read
        io.to(`chat:${chatId}`).emit('messages:read', { chatId, readerId: userId });

        // Notify each member individually (for cross-device sync)
        const members = await prisma.member.findMany({
          where: { chatId },
          select: { userId: true }
        });
        members.forEach(m => {
          if (m.userId !== userId) {
            io.to(`user:${m.userId}`).emit('messages:read', { chatId, readerId: userId });
          }
        });
      } catch (err) {
        logger.error('Failed to mark messages as read:', err);
      }
    });

    socket.on('message:edit', async ({ messageId, content }: { messageId: string; content: string }) => {
      try {
        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message || message.senderId !== userId) return;

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: {
            content,
            isEdited: true,
            editedAt: new Date()
          },
          include: {
            sender: { select: { id: true, username: true, avatar: true } }
          }
        });

        io.to(`chat:${message.chatId}`).emit('message:update', updated);
      } catch (err) {
        logger.error('Failed to edit message:', err);
      }
    });

    socket.on('message:delete', async ({ messageId, type }: { messageId: string; type: 'FOR_ME' | 'FOR_EVERYONE' }) => {
      try {
        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message) return;

        if (type === 'FOR_EVERYONE') {
          // Only sender can delete for everyone
          if (message.senderId !== userId) return;

          // Soft delete: keep the record but clear content and mark as DELETED
          const updated = await prisma.message.update({
            where: { id: messageId },
            data: {
              content: 'Message deleted',
              type: 'TEXT', // or add a DELETED type if preferred
              fileUrl: null,
              fileName: null,
              fileSize: null,
              duration: null,
              waveform: [],
            },
            include: {
              sender: { select: { id: true, username: true, avatar: true } }
            }
          });
          io.to(`chat:${message.chatId}`).emit('message:update', updated);
        } else {
          // FOR_ME: add current user to hiddenFor array
          const updated = await prisma.message.update({
            where: { id: messageId },
            data: {
              hiddenFor: { push: userId }
            }
          });
          // Notify only the user themselves
          socket.emit('message:hide', { messageId });
        }
      } catch (err) {
        logger.error('Failed to delete message:', err);
      }
    });

    socket.on('chat:typing', ({ chatId, isTyping }: { chatId: string; isTyping: boolean }) => {
      socket.to(`chat:${chatId}`).emit('chat:typing', { chatId, userId, username, isTyping });
    });

    socket.on('typing:start', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('chat:typing', { chatId, userId, username, isTyping: true });
    });

    socket.on('typing:stop', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('chat:typing', { chatId, userId, username, isTyping: false });
    });

    // ── WebRTC Signaling (via Redis ZSET for Heartbeat) ──
    const joinedCalls = new Set<string>();

    const cleanupZombies = async (chatId: string) => {
      const key = `call:${chatId}:participants`;
      const now = Date.now();
      // Remove anyone who hasn't pinged in the last 30 seconds
      await redis.zremrangebyscore(key, 0, now - 30000);
    };

    socket.on('call:join', async (payload: { chatId: string }) => {
      const { chatId } = payload;
      const key = `call:${chatId}:participants`;

      await cleanupZombies(chatId);
      const participants = await redis.zrange(key, 0, -1);

      if (participants.length >= 4 && !participants.includes(userId)) {
        socket.emit('call:error', { message: 'Call is full (max 4)' });
        return;
      }

      await redis.zadd(key, Date.now(), userId);
      await redis.expire(key, 60); // Safety expiry
      joinedCalls.add(chatId);

      socket.join(`call:${chatId}`);
      const otherUsers = participants.filter(id => id !== userId);
      socket.emit('call:participants', { participants: otherUsers });
      socket.to(`call:${chatId}`).emit('call:user-joined', { userId, username });
    });

    socket.on('call:ping', async (payload: { chatId: string }) => {
      const key = `call:${payload.chatId}:participants`;
      await redis.zadd(key, Date.now(), userId);
      await redis.expire(key, 60);
    });

    socket.on('call:offer', (p: any) => {
      io.to(`user:${p.toUserId}`).emit('call:offer', {
        chatId: p.chatId,
        callerId: userId,
        offer: p.offer,
        type: p.type
      });
    });

    socket.on('call:answer', (p: any) => {
      io.to(`user:${p.toUserId}`).emit('call:answer', {
        chatId: p.chatId,
        userId: userId,
        answer: p.answer
      });
    });

    socket.on('call:ice-candidate', (p: any) => {
      io.to(`user:${p.toUserId}`).emit('call:ice-candidate', {
        chatId: p.chatId,
        userId: userId,
        candidate: p.candidate
      });
    });

    socket.on('call:leave', async (p: { chatId: string }) => {
      const key = `call:${p.chatId}:participants`;
      await redis.zrem(key, userId);
      joinedCalls.delete(p.chatId);

      socket.leave(`call:${p.chatId}`);
      socket.to(`call:${p.chatId}`).emit('call:user-left', { userId });
    });

    socket.on('call:start', async (p: any) => {
      logger.info(`📞 Call starting in chat ${p.chatId} by ${username} (${userId})`);
      const members = await prisma.member.findMany({
        where: { chatId: p.chatId },
        select: { userId: true },
      });

      logger.info(`Found ${members.length} members to notify`);
      members.forEach((m) => {
        if (m.userId !== userId) {
          logger.info(`Sending call:incoming to user ${m.userId}`);
          io.to(`user:${m.userId}`).emit('call:incoming', {
            chatId: p.chatId,
            callerId: userId,
            callerName: username,
            type: p.type
          });

          // ── Create Notification record ──
          import('../services/notification.service').then(({ createNotification }) => {
            createNotification({
              userId: m.userId,
              chatId: p.chatId,
              type: 'call',
              title: `Incoming ${p.type} call`,
              body: `${username} is calling you`,
            });
          });
        }
      });
    });

    socket.on('disconnect', async () => {
      updateStatus('OFFLINE');
      for (const chatId of joinedCalls) {
        const key = `call:${chatId}:participants`;
        await redis.zrem(key, userId);
        socket.to(`call:${chatId}`).emit('call:user-left', { userId });
      }
    });
  });

  return io;
}
