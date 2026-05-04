import { create } from 'zustand';
import type { Chat } from '@messenger/shared';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  setChats: (chats: Chat[]) => void;
  setActiveChat: (chatId: string | null) => void;
  updateChat: (chat: Chat) => void;
  updateUserStatus: (userId: string, status: string, lastSeen: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  activeChatId: null,
  setChats: (chats) => set({ chats }),
  setActiveChat: (activeChatId) => set({ activeChatId }),
  updateChat: (updatedChat) => set((state) => ({
    chats: state.chats.map(c => c.id === updatedChat.id ? updatedChat : c)
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
