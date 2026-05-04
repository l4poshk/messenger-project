import { create } from 'zustand';
import type { Message } from '@messenger/shared';

interface MessageState {
  messages: Record<string, Message[]>; // chatId -> messages[]
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  reset: () => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: {},
  setMessages: (chatId, messages) => set((state) => ({
    messages: { ...state.messages, [chatId]: messages }
  })),
  addMessage: (message) => set((state) => {
    const chatMsgs = state.messages[message.chatId] || [];
    return {
      messages: {
        ...state.messages,
        [message.chatId]: [...chatMsgs, message]
      }
    };
  }),
  reset: () => set({ messages: {} }),
}));
