// ──────────────────────────────────────────────
// Notification Store — Zustand
// ──────────────────────────────────────────────

import { create } from 'zustand';
import { api } from '@/lib/api';

export interface Notification {
  id: string;
  userId: string;
  chatId?: string | null;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;

  fetchNotifications: () => Promise<void>;
  addNotification: (n: Notification) => void;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const result = await api.get<Notification[]>('/notifications');
      if (result.data) {
        const notifs = result.data;
        set({
          notifications: notifs,
          unreadCount: notifs.filter((n) => !n.read).length,
        });
      }
    } catch (err) {
      console.error('[Notifications] Fetch failed', err);
    } finally {
      set({ loading: false });
    }
  },

  addNotification: (n) => {
    set((state) => ({
      notifications: [n, ...state.notifications],
      unreadCount: state.unreadCount + (n.read ? 0 : 1),
    }));
  },

  markAllRead: async () => {
    try {
      await api.post('/notifications/read-all', {});
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      console.error('[Notifications] Mark all read failed', err);
    }
  },

  markRead: async (id) => {
    // Optimistic update
    const wasUnread = get().notifications.find((n) => n.id === id && !n.read);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
    }));
    try {
      await api.patch(`/notifications/${id}/read`, {});
    } catch (err) {
      console.error('[Notifications] markRead failed', err);
    }
  },

  reset: () => set({ notifications: [], unreadCount: 0, loading: false }),
}));
