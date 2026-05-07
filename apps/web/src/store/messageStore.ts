import { create } from 'zustand';
import type { Message } from '@messenger/shared';

interface MessageState {
  messages: Record<string, Message[]>; // chatId -> messages[]
  typing: Record<string, Record<string, string>>; // chatId -> { userId: username }
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  hideMessage: (chatId: string, messageId: string) => void;
  markAsRead: (chatId: string) => void;
  setTyping: (chatId: string, userId: string, username: string | null) => void;
  reset: () => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: {},
  typing: {},
  setMessages: (chatId, messages) => set((state) => ({
    messages: { ...state.messages, [chatId]: messages }
  })),
  addMessage: (message) => set((state) => {
    const chatMsgs = state.messages[message.chatId] || [];
    
    // Prevent duplicates (e.g. from both HTTP response and Socket event)
    if (chatMsgs.some((m) => m.id === message.id)) {
      return state;
    }

    // Heuristic: if this is a real message, and we have a temporary optimistic one that matches, replace it
    if (!message.id.startsWith('temp-')) {
      const tempIdx = chatMsgs.findIndex(m => 
        m.id.startsWith('temp-') && 
        m.senderId === message.senderId && 
        m.content === message.content
      );
      if (tempIdx !== -1) {
        const newMsgs = [...chatMsgs];
        newMsgs[tempIdx] = message;
        return {
          messages: { ...state.messages, [message.chatId]: newMsgs }
        };
      }
    }

    return {
      messages: {
        ...state.messages,
        [message.chatId]: [...chatMsgs, message]
      }
    };
  }),
  updateMessage: (message) => set((state) => {
    const chatMsgs = state.messages[message.chatId] || [];
    return {
      messages: {
        ...state.messages,
        [message.chatId]: chatMsgs.map(m => m.id === message.id ? message : m)
      }
    };
  }),
  hideMessage: (chatId, messageId) => set((state) => {
    const chatMsgs = state.messages[chatId] || [];
    return {
      messages: {
        ...state.messages,
        [chatId]: chatMsgs.filter(m => m.id !== messageId)
      }
    };
  }),
  markAsRead: (chatId) => set((state) => {
    const chatMsgs = state.messages[chatId] || [];
    return {
      messages: {
        ...state.messages,
        [chatId]: chatMsgs.map(m => ({ ...m, isRead: true }))
      }
    };
  }),
  setTyping: (chatId, userId, username) => set((state) => {
    const chatTyping = { ...(state.typing[chatId] || {}) };
    if (username) {
      chatTyping[userId] = username;
    } else {
      delete chatTyping[userId];
    }
    return {
      typing: { ...state.typing, [chatId]: chatTyping }
    };
  }),
  reset: () => set({ messages: {}, typing: {} }),
}));
