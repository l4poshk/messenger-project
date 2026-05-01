// ──────────────────────────────────────────────
// UI Store — sidebar, modals, theme
// ──────────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';
type ActiveModal =
  | null
  | 'create-chat'
  | 'create-group'
  | 'profile'
  | 'settings'
  | 'image-lightbox';

interface UiState {
  // ── State ──
  theme: Theme;
  sidebarOpen: boolean;
  activeModal: ActiveModal;
  lightboxImage: string | null;

  // ── Actions ──
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  openLightbox: (imageUrl: string) => void;
  closeLightbox: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──
      theme: 'dark',
      sidebarOpen: true,
      activeModal: null,
      lightboxImage: null,

      // ── Actions ──
      setTheme: (theme) => {
        set({ theme });
        // Update <html> class for Tailwind dark mode
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

      openModal: (activeModal) => set({ activeModal }),
      closeModal: () => set({ activeModal: null }),

      openLightbox: (lightboxImage) =>
        set({ activeModal: 'image-lightbox', lightboxImage }),
      closeLightbox: () =>
        set({ activeModal: null, lightboxImage: null }),
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
