// ──────────────────────────────────────────────
// Contact Store — Zustand
// ──────────────────────────────────────────────

import { create } from 'zustand';
import { api } from '@/lib/api';

export interface ContactUser {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  description: string | null;
  status: string | null;
  lastSeen: string | null;
  contactRecordId: string;
  addedAt: string;
}

interface ContactState {
  contacts: ContactUser[];
  loading: boolean;

  fetchContacts: () => Promise<void>;
  addContact: (contactId: string) => Promise<ContactUser | null>;
  removeContact: (contactId: string) => Promise<void>;
  reset: () => void;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  loading: false,

  fetchContacts: async () => {
    set({ loading: true });
    try {
      const res = await api.get<ContactUser[]>('/contacts');
      if (res.data) {
        set({ contacts: res.data });
      }
    } catch (err) {
      console.error('[Contacts] Fetch failed', err);
    } finally {
      set({ loading: false });
    }
  },

  addContact: async (contactId: string) => {
    try {
      const res = await api.post<ContactUser>('/contacts', { contactId });
      if (res.data) {
        set((state) => {
          // Avoid duplicates
          const exists = state.contacts.some((c) => c.id === res.data!.id);
          return exists ? state : { contacts: [res.data!, ...state.contacts] };
        });
        return res.data;
      }
      return null;
    } catch (err) {
      console.error('[Contacts] Add failed', err);
      return null;
    }
  },

  removeContact: async (contactId: string) => {
    try {
      await api.delete(`/contacts/${contactId}`);
      set((state) => ({
        contacts: state.contacts.filter((c) => c.id !== contactId),
      }));
    } catch (err) {
      console.error('[Contacts] Remove failed', err);
    }
  },

  reset: () => set({ contacts: [], loading: false }),
}));
