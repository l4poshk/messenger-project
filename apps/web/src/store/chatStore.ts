import { create } from 'zustand';
import type { Chat } from '@messenger/shared';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  setChats: (chats: Chat[]) => void;
  setActiveChat: (chatId: string | null) => void;
  updateChat: (chat: Chat) => void;
  updateUserStatus: (userId: string, status: string, lastSeen: string) => void;
  incrementUnread: (chatId: string) => void;
  resetUnread: (chatId: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  activeChatId: null,
  setChats: (chats) => set({ chats }),
  setActiveChat: (activeChatId) => {
    set({ activeChatId });
    if (activeChatId) {
      set((state) => ({
        chats: state.chats.map((c: any) =>
          c.id === activeChatId ? { ...c, unreadCount: 0 } : c
        ),
      }));
    }
  },
  updateChat: (updatedChat) => set((state) => ({
    chats: state.chats.map((c: any) => c.id === updatedChat.id ? { ...c, ...updatedChat } : c)
  })),
  incrementUnread: (chatId) => set((state) => ({
    chats: state.chats.map((c: any) =>
      c.id === chatId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
    ),
  })),
  resetUnread: (chatId) => set((state) => ({
    chats: state.chats.map((c: any) =>
      c.id === chatId ? { ...c, unreadCount: 0 } : c
    ),
  })),
  updateUserStatus: (userId, status, lastSeen) => set((state) => ({
    chats: state.chats.map((chat) => ({
      ...chat,
      members: (chat as any).members?.map((m: any) =>
        m.userId === userId
          ? { ...m, user: { ...m.user, status, lastSeen } }
          : m
      ),
    })),
  })),
  reset: () => set({ chats: [], activeChatId: null }),
}));
