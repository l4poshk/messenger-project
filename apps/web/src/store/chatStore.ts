import { create } from 'zustand';
import type { Chat } from '@messenger/shared';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  setChats: (chats: Chat[]) => void;
  setActiveChat: (chatId: string | null) => void;
  updateChat: (chat: Chat) => void;
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
  reset: () => set({ chats: [], activeChatId: null }),
}));
