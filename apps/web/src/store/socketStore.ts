import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './authStore';
import { useMessageStore } from './messageStore';
import { useChatStore } from './chatStore';
import { useNotificationStore } from './notificationStore';
import { useUiStore } from './uiStore';
import { useCallStore } from './callStore';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  typingUsers: Record<string, string[]>;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  typingUsers: {},

  connect: () => {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) {
      console.warn('[Socket] No access token, attempting refresh...');
      // Try to refresh token before giving up
      import('@/lib/api').then(async ({ tryRefresh }) => {
        const refreshed = await tryRefresh();
        if (refreshed) {
          console.log('[Socket] Refresh successful, retrying connect');
          get().connect();
        } else {
          console.warn('[Socket] Refresh failed, skipping connect');
        }
      });
      return;
    }

    // Если уже есть сокет и он подключён — не создаём новый
    const existing = get().socket;
    if (existing?.connected) {
      console.log('[Socket] Already connected, skipping');
      return;
    }

    // Если был старый — убираем
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }

    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    console.log('[Socket] Connecting to', serverUrl, 'with token:', accessToken.substring(0, 20) + '...');

    const socket = io(serverUrl, {
      auth: { token: accessToken },
      // CRITICAL: polling first for handshake, then upgrade to websocket
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] ✅ Connected, id:', socket.id);
      set({ isConnected: true });
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] ❌ Connection error:', err.message);
      
      // If auth error, try to refresh token
      if (err.message.includes('Authentication error')) {
        console.warn('[Socket] Auth error, attempting refresh...');
        import('@/lib/api').then(async ({ tryRefresh }) => {
          const refreshed = await tryRefresh();
          if (refreshed) {
            console.log('[Socket] Refresh successful, socket will retry with new token');
            // Update the token in the socket auth object for the next attempt
            const newToken = useAuthStore.getState().accessToken;
            if (newToken) {
              socket.auth = { token: newToken };
              // socket.io handles reconnection automatically, but we can nudge it
              socket.connect();
            }
          }
        });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      set({ isConnected: false });
    });

    // ── Слушаем новые сообщения ──
    socket.on('message:new', (message) => {
      // ── Prevent duplicates (since we now emit to both chat room and user room) ──
      const chatMsgs = useMessageStore.getState().messages[message.chatId] || [];
      if (chatMsgs.some(m => m.id === message.id)) return;

      console.log('[Socket] 📩 message:new', message.id);
      useMessageStore.getState().addMessage(message);

      const { chats, updateChat, activeChatId, incrementUnread } = useChatStore.getState();
      const chat = chats.find((c) => c.id === message.chatId);
      if (chat) {
        // Update the last message in the sidebar
        updateChat({ ...chat, messages: [message] } as any);
        
        // Increment unread if not active chat and not from current user
        const userId = useAuthStore.getState().user?.id;
        if (message.chatId !== activeChatId && message.senderId !== userId) {
          incrementUnread(message.chatId);
        }
      }
    });

    // ── Слушаем статус печати ──
    socket.on('chat:typing', (data: { chatId: string; username: string; isTyping: boolean }) => {
      set((state) => {
        const currentTyping = state.typingUsers[data.chatId] || [];
        const newTyping = data.isTyping
          ? Array.from(new Set([...currentTyping, data.username]))
          : currentTyping.filter((u) => u !== data.username);
        return {
          typingUsers: { ...state.typingUsers, [data.chatId]: newTyping },
        };
      });
    });

    // ── Слушаем статус прочтения ──
    socket.on('messages:read', (data: { chatId: string; readerId: string }) => {
      console.log('[Socket] ✅ messages:read', data.chatId);
      useMessageStore.getState().markAsRead(data.chatId);
      
      // If we are the reader, reset unread count
      const userId = useAuthStore.getState().user?.id;
      if (data.readerId === userId) {
        useChatStore.getState().resetUnread(data.chatId);
      }
    });

    socket.on('message:update', (message) => {
      console.log('[Socket] 🔄 message:update', message.id);
      useMessageStore.getState().updateMessage(message);
    });

    socket.on('message:hide', (data: { messageId: string }) => {
      const activeChatId = useChatStore.getState().activeChatId;
      if (activeChatId) {
        useMessageStore.getState().hideMessage(activeChatId, data.messageId);
      }
    });

    // ── Слушаем создание новых чатов ──
    socket.on('chat:new', (newChat) => {
      console.log('[Socket] 🆕 chat:new', newChat.id);
      const { chats, setChats } = useChatStore.getState();
      // Добавляем, только если его еще нет в списке
      if (!chats.find((c) => c.id === newChat.id)) {
        setChats([newChat, ...chats]);
      }
    });

    // ── Слушаем уведомления ──
    socket.on('notification:new', (notification) => {
      console.log('[Socket] 🔔 notification:new', notification.id);
      useNotificationStore.getState().addNotification(notification);

      // ── Browser Notification ──
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          const n = new Notification(notification.title, {
            body: notification.body,
            icon: '/logo.png',
          });
          n.onclick = () => {
            window.focus();
            if (notification.chatId) {
              useChatStore.getState().setActiveChat(notification.chatId);
              useUiStore.getState().setActivePanel('chats');
            }
          };
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }
    });

    // Request notification permission initially
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // ── Слушаем статус пользователя ──
    socket.on('user:status', (data: { userId: string; status: string; lastSeen: string }) => {
      console.log('[Socket] 👤 user:status', data.userId, data.status);
      useChatStore.getState().updateUserStatus(data.userId, data.status, data.lastSeen);
    });

    // ── Слушаем обновление чата ──
    socket.on('chat:update', (updatedChat) => {
      console.log('[Socket] 🔄 chat:update', updatedChat.id);
      useChatStore.getState().updateChat(updatedChat);
    });

    // ── WebRTC Signaling: Incoming Call (Global) ──
    socket.on('call:incoming', (data: { chatId: string; callerId: string; callerName: string; type: 'audio' | 'video' }) => {
      console.log('[Socket] 📞 call:incoming', data);
      const callStatus = useCallStore.getState().status;
      if (callStatus === 'idle') {
        useCallStore.getState().setIncomingCall(
          data.chatId,
          data.callerId,
          data.callerName,
          null as any, // No offer in initial ringing
          data.type
        );
      }
    });

    socket.on('call:cancelled', () => {
      console.log('[Socket] 📞 call:cancelled');
      useCallStore.getState().resetCall();
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },
}));
