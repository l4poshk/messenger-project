// ──────────────────────────────────────────────
// Chat service — CRUD чатов, группы, топики, участники
// ──────────────────────────────────────────────

import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import type { ChatType, MemberRole } from '@prisma/client';

// ── Получить все чаты пользователя ──

export async function getUserChats(userId: string) {
  return await prisma.chat.findMany({
    where: {
      members: { some: { userId } }
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, avatar: true, status: true, lastSeen: true }
          }
        }
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          sender: { select: { username: true } }
        }
      },
      topics: {
        orderBy: { createdAt: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

// ── Создать чат (DIRECT / GROUP / SUPERGROUP) ──

export async function createChat(
  userId: string,
  type: ChatType,
  memberIds: string[],
  name?: string
) {
  // Для DIRECT — проверяем, нет ли уже чата между этими двумя
  if (type === 'DIRECT') {
    if (memberIds.length !== 1) {
      throw new AppError(400, 'Direct chat requires exactly 1 other member');
    }

    const otherUserId = memberIds[0];
    if (otherUserId === userId) {
      throw new AppError(400, 'Cannot create a chat with yourself');
    }

    const existing = await prisma.chat.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: otherUserId } } }
        ]
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, avatar: true, status: true, lastSeen: true } }
          }
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        topics: true
      }
    });

    if (existing) return existing;
  }

  // Для GROUP/SUPERGROUP — нужно имя
  if ((type === 'GROUP' || type === 'SUPERGROUP') && !name) {
    throw new AppError(400, 'Group name is required');
  }

  // Создаём чат и добавляем участников атомарно
  const allMemberIds = [userId, ...memberIds.filter(id => id !== userId)];

  const chat = await prisma.chat.create({
    data: {
      type,
      name: type === 'DIRECT' ? null : name,
      members: {
        create: allMemberIds.map((id, idx) => ({
          userId: id,
          role: id === userId ? 'OWNER' : 'MEMBER'
        }))
      },
      // Для суперогрупп — создаём дефолтный топик "General"
      ...(type === 'SUPERGROUP' ? {
        topics: {
          create: { name: 'General' }
        }
      } : {})
    },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, avatar: true, status: true, lastSeen: true } }
        }
      },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      topics: true
    }
  });

  return chat;
}

// ── Получить сообщения чата ──

export async function getChatMessages(
  chatId: string,
  userId: string,
  topicId?: string
) {
  await assertMember(chatId, userId);

  return await prisma.message.findMany({
    where: {
      chatId,
      ...(topicId ? { topicId } : {})
    },
    include: {
      sender: { select: { id: true, username: true, avatar: true } },
      replyTo: {
        include: { sender: { select: { username: true } } }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}

// ── Добавить участника ──

export async function addMember(chatId: string, userId: string, targetUserId: string) {
  const requester = await assertMember(chatId, userId);

  if (requester.role === 'MEMBER') {
    throw new AppError(403, 'Only admins and owners can add members');
  }

  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type === 'DIRECT') {
    throw new AppError(400, 'Cannot add members to a direct chat');
  }

  // Проверяем, не участник ли уже
  const existing = await prisma.member.findUnique({
    where: { chatId_userId: { chatId, userId: targetUserId } }
  });
  if (existing) {
    throw new AppError(409, 'User is already a member');
  }

  return await prisma.member.create({
    data: { chatId, userId: targetUserId, role: 'MEMBER' },
    include: {
      user: { select: { id: true, username: true, avatar: true, status: true, lastSeen: true } }
    }
  });
}

// ── Удалить участника ──

export async function removeMember(chatId: string, userId: string, targetUserId: string) {
  const requester = await assertMember(chatId, userId);

  // Нельзя удалить владельца
  if (targetUserId === userId && requester.role === 'OWNER') {
    throw new AppError(400, 'Owner cannot leave. Transfer ownership first.');
  }

  // Только OWNER/ADMIN могут удалять других
  if (targetUserId !== userId && requester.role === 'MEMBER') {
    throw new AppError(403, 'Only admins and owners can remove members');
  }

  await prisma.member.delete({
    where: { chatId_userId: { chatId, userId: targetUserId } }
  });

  return { removed: true };
}

// ── Изменить роль участника ──

export async function changeRole(
  chatId: string,
  userId: string,
  targetUserId: string,
  newRole: MemberRole
) {
  const requester = await assertMember(chatId, userId);

  if (requester.role !== 'OWNER') {
    throw new AppError(403, 'Only the owner can change roles');
  }

  if (targetUserId === userId) {
    throw new AppError(400, 'Cannot change your own role');
  }

  return await prisma.member.update({
    where: { chatId_userId: { chatId, userId: targetUserId } },
    data: { role: newRole },
    include: {
      user: { select: { id: true, username: true, avatar: true } }
    }
  });
}

// ── Топики (для SUPERGROUP) ──

export async function getTopics(chatId: string, userId: string) {
  await assertMember(chatId, userId);

  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type !== 'SUPERGROUP') {
    throw new AppError(400, 'Topics are only available for supergroups');
  }

  return await prisma.topic.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' }
  });
}

export async function createTopic(chatId: string, userId: string, name: string) {
  const requester = await assertMember(chatId, userId);

  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type !== 'SUPERGROUP') {
    throw new AppError(400, 'Topics are only available for supergroups');
  }

  if (requester.role === 'MEMBER') {
    throw new AppError(403, 'Only admins and owners can create topics');
  }

  return await prisma.topic.create({
    data: { chatId, name }
  });
}

// ── Helper: проверка членства ──

async function assertMember(chatId: string, userId: string) {
  const member = await prisma.member.findUnique({
    where: { chatId_userId: { chatId, userId } }
  });
  if (!member) {
    throw new AppError(403, 'You are not a member of this chat');
  }
  return member;
}
