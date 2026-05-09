// ──────────────────────────────────────────────
// Chat service — CRUD чатов, группы, топики, участники
// ──────────────────────────────────────────────

import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import type { ChatType, MemberRole } from '@prisma/client';

// ── Получить все чаты пользователя ──

export async function getUserChats(userId: string) {
  const chats = await prisma.chat.findMany({
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

  // Calculate unreadCount for each chat efficiently
  return await Promise.all(chats.map(async (chat) => {
    const unreadCount = await prisma.message.count({
      where: {
        chatId: chat.id,
        senderId: { not: userId },
        isRead: false
      }
    });
    return { ...chat, unreadCount };
  }));
}

// ── Создать чат (DIRECT / GROUP / SUPERGROUP) ──

export async function createChat(
  userId: string,
  type: ChatType,
  memberIds: string[],
  name?: string,
  description?: string
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
      description: type === 'DIRECT' ? null : description,
      creatorId: userId,
      members: {
        create: allMemberIds.map((id, idx) => ({
          userId: id,
          role: id === userId ? 'CREATOR' : 'MEMBER'
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
    throw new AppError(403, 'Only admins and creators can add members');
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
  console.log(`[ChatService] 🚪 Attempting to remove member. Chat: ${chatId}, Requester: ${userId}, Target: ${targetUserId}`);
  
  const requester = await assertMember(chatId, userId);
  const target = await assertMember(chatId, targetUserId);

  console.log(`[ChatService] Roles found - Requester: ${requester.role}, Target: ${target.role}`);

  // 1. Абсолютный иммунитет: Создателя удалить невозможно (только если это не DIRECT чат, см. ниже)
  if (target.role === 'CREATOR' && targetUserId !== userId) {
    throw new AppError(403, 'Cannot kick the chat creator');
  }

  // 2. Выход из чата (самоудаление)
  if (targetUserId === userId) {
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    
    // Если Создатель хочет выйти — мы просто удаляем весь чат целиком
    if (requester.role === 'CREATOR') {
      console.log(`[ChatService] 🗑️ Creator is leaving, deleting entire chat: ${chatId} (Type: ${chat?.type})`);
      // Сначала удаляем уведомления этого чата
      await prisma.notification.deleteMany({ where: { chatId } });
      await prisma.chat.delete({ where: { id: chatId } });
      return { removed: true, chatDeleted: true };
    }

    // Если обычный участник выходит из личного чата — тоже удаляем (так как DIRECT это только 2 человека)
    if (chat?.type === 'DIRECT') {
      console.log(`[ChatService] 🗑️ Member left DIRECT chat, deleting it: ${chatId}`);
      // Сначала удаляем уведомления этого чата
      await prisma.notification.deleteMany({ where: { chatId } });
      await prisma.chat.delete({ where: { id: chatId } });
      return { removed: true, chatDeleted: true };
    }
  } else {
    // 3. Кик другого пользователя: только CREATOR или ADMIN
    if (requester.role !== 'CREATOR' && requester.role !== 'ADMIN') {
      throw new AppError(403, 'Only admins and creators can remove members');
    }

    // 4. Админ не может кикнуть другого админа (только Создатель может)
    if (requester.role === 'ADMIN' && target.role === 'ADMIN') {
      throw new AppError(403, 'Admins cannot kick other admins');
    }
  }

  await prisma.member.delete({
    where: { chatId_userId: { chatId, userId: targetUserId } }
  });

  return { removed: true };
}

// ── Назначить админом ──

export async function promoteToAdmin(chatId: string, userId: string, targetUserId: string) {
  const requester = await assertMember(chatId, userId);

  if (requester.role !== 'CREATOR') {
    throw new AppError(403, 'Only the creator can promote members to admin');
  }

  return await prisma.member.update({
    where: { chatId_userId: { chatId, userId: targetUserId } },
    data: { role: 'ADMIN' },
    include: {
      user: { select: { id: true, username: true, avatar: true } }
    }
  });
}

// ── Разжаловать админа ──

export async function demoteAdmin(chatId: string, userId: string, targetUserId: string) {
  const requester = await assertMember(chatId, userId);

  if (requester.role !== 'CREATOR') {
    throw new AppError(403, 'Only the creator can demote admins');
  }

  return await prisma.member.update({
    where: { chatId_userId: { chatId, userId: targetUserId } },
    data: { role: 'MEMBER' },
    include: {
      user: { select: { id: true, username: true, avatar: true } }
    }
  });
}

// ── Обновить данные чата ──

export async function updateChat(
  chatId: string,
  userId: string,
  data: { name?: string; description?: string; avatar?: string }
) {
  const requester = await assertMember(chatId, userId);

  if (requester.role !== 'CREATOR' && requester.role !== 'ADMIN') {
    throw new AppError(403, 'Only admins and creators can update chat info');
  }

  return await prisma.chat.update({
    where: { id: chatId },
    data,
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, avatar: true, status: true, lastSeen: true } }
        }
      }
    }
  });
}

// ── Изменить роль участника ──

export async function changeRole(
  chatId: string,
  userId: string,
  targetUserId: string,
  newRole: any
) {
  const requester = await assertMember(chatId, userId);

  if (requester.role !== 'CREATOR') {
    throw new AppError(403, 'Only the creator can change roles');
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
    throw new AppError(403, 'Only admins and creators can create topics');
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
