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
          },
          include: {
            sender: { select: { id: true, username: true, avatar: true } }
          }
        });
        io.to(`chat:${data.chatId}`).emit('message:new', message);
      } catch (err) {
        logger.error('Failed to save message:', err);
      }
    });

    socket.on('typing:start', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing:update', { chatId, userId, username, isTyping: true });
    });

    socket.on('typing:stop', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing:update', { chatId, userId, username, isTyping: false });
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
