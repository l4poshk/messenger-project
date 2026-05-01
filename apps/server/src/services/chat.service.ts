import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export async function getUserChats(userId: string) {
  return await prisma.chat.findMany({
    where: {
      members: {
        some: { userId }
      }
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
              status: true,
              lastSeen: true
            }
          }
        }
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          sender: {
            select: { username: true }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc' // В идеале по дате последнего сообщения, но пока так
    }
  });
}

export async function getChatMessages(chatId: string, userId: string) {
  // Проверяем, является ли пользователь участником чата
  const member = await prisma.member.findUnique({
    where: {
      chatId_userId: { chatId, userId }
    }
  });

  if (!member) {
    throw new AppError(403, 'You are not a member of this chat');
  }

  return await prisma.message.findMany({
    where: { chatId },
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          avatar: true
        }
      },
      replyTo: true
    },
    orderBy: { createdAt: 'asc' }
  });
}
