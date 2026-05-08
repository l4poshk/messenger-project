import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { logger } from '../lib/logger';

export async function createNotification(data: {
  userId: string;
  chatId?: string;
  type: string;
  title: string;
  body: string;
}) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        chatId: data.chatId,
        type: data.type,
        title: data.title,
        body: data.body,
        read: false,
      },
    });

    // Emit to the specific user's socket room
    getIO().to(`user:${data.userId}`).emit('notification:new', notification);
    
    return notification;
  } catch (err) {
    logger.error('[NotificationService] Failed to create notification:', err);
    return null;
  }
}

/**
 * Notify all members of a chat except the sender
 */
export async function notifyChatMembers(params: {
  chatId: string;
  senderId: string;
  title: string;
  body: string;
  type: string;
}) {
  try {
    const members = await prisma.member.findMany({
      where: {
        chatId: params.chatId,
        userId: { not: params.senderId },
      },
    });

    for (const member of members) {
      await createNotification({
        userId: member.userId,
        chatId: params.chatId,
        type: params.type,
        title: params.title,
        body: params.body,
      });
    }
  } catch (err) {
    logger.error('[NotificationService] Failed to notify chat members:', err);
  }
}
