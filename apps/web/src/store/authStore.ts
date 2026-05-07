// ──────────────────────────────────────────────
// Auth Store — current user, tokens, login/logout
// ──────────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@messenger/shared';
import { useChatStore } from './chatStore';
import { useMessageStore } from './messageStore';
import { useCallStore } from './callStore';
import { useNotificationStore } from './notificationStore';
import { useContactStore } from './contactStore';

interface AuthState {
  // ── State ──
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // ── Actions ──
  setAuth: (user: User, accessToken: string) => void;
  setTokens: (accessToken: string) => void;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // ── Initial state ──
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      // ── Actions ──
      setAuth: (user, accessToken) =>
        set({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
        }),

      setTokens: (accessToken) =>
        set({ accessToken }),

      setUser: (user) => set({ user }),

      setLoading: (isLoading) => set({ isLoading }),

      logout: () => {
        // Clear all other stores
        useChatStore.getState().reset();
        useMessageStore.getState().reset();
        useCallStore.getState().resetCall();
        useNotificationStore.getState().reset();
        useContactStore.getState().reset();

        // Reset auth state
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
        });

        // Redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      },
    }),
    {
      name: 'messenger-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
