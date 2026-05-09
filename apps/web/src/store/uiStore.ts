// ──────────────────────────────────────────────
// UI Store — sidebar, modals, theme, toasts
// ──────────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';
export type ActivePanel = 'chats' | 'contacts' | 'notifications' | 'settings';
type ActiveModal =
  | null
  | 'create-chat'
  | 'create-group'
  | 'profile'
  | 'settings'
  | 'image-lightbox';

export type ToastType = 'info' | 'success' | 'error' | 'message';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  chatId?: string;
}

interface UiState {
  // ── State ──
  theme: Theme;
  activePanel: ActivePanel;
  sidebarOpen: boolean;
  activeModal: ActiveModal;
  lightboxImage: string | null;
  toasts: Toast[];

  // ── Actions ──
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setActivePanel: (panel: ActivePanel) => void;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  openLightbox: (imageUrl: string) => void;
  closeLightbox: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──
      theme: 'dark',
      activePanel: 'chats' as ActivePanel,
      sidebarOpen: true,
      activeModal: null,
      lightboxImage: null,
      toasts: [],

      // ── Actions ──
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          document.documentElement.classList.toggle('light', theme === 'light');
        }
      },

      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(newTheme);
      },

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setActivePanel: (activePanel) => set({ activePanel }),
      openModal: (activeModal) => set({ activeModal }),
      closeModal: () => set({ activeModal: null }),

      openLightbox: (lightboxImage) =>
        set({ activeModal: 'image-lightbox', lightboxImage }),
      closeLightbox: () =>
        set({ activeModal: null, lightboxImage: null }),

      addToast: (toast) => {
        const id = Math.random().toString(36).substring(2, 9);
        set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
        setTimeout(() => {
          set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
        }, 5000);
      },

      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'messenger-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
