// ──────────────────────────────────────────────
// Auth Store — current user, tokens, login/logout
// ──────────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@messenger/shared';
import { useChatStore } from './chatStore';
import { useMessageStore } from './messageStore';
import { useCallStore } from './callStore';

interface AuthState {
  // ── State ──
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // ── Actions ──
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
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
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      // ── Actions ──
      setAuth: (user, accessToken, refreshToken) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setUser: (user) => set({ user }),

      setLoading: (isLoading) => set({ isLoading }),

      logout: () => {
        // Clear all other stores
        useChatStore.getState().reset();
        useMessageStore.getState().reset();
        useCallStore.getState().resetCall();

        // Reset auth state
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });

        // Redirect to login (optional, but good for UI)
        window.location.href = '/login';
      },
    }),
    {
      name: 'messenger-auth',
      // Only persist tokens and user, not loading state
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
