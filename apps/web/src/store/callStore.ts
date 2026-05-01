import { create } from 'zustand';

export type CallStatus = 'idle' | 'incoming' | 'outgoing' | 'active';

interface CallState {
  status: CallStatus;
  chatId: string | null;
  callerId: string | null;
  pendingOffer: RTCSessionDescriptionInit | null;

  setIncomingCall: (chatId: string, callerId: string, offer: RTCSessionDescriptionInit) => void;
  setOutgoingCall: (chatId: string) => void;
  acceptCall: () => void;
  endCall: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  status: 'idle',
  chatId: null,
  callerId: null,
  pendingOffer: null,

  setIncomingCall: (chatId, callerId, offer) =>
    set({ status: 'incoming', chatId, callerId, pendingOffer: offer }),

  setOutgoingCall: (chatId) =>
    set({ status: 'outgoing', chatId, callerId: null, pendingOffer: null }),

  acceptCall: () => set({ status: 'active' }),

  endCall: () => set({ status: 'idle', chatId: null, callerId: null, pendingOffer: null }),
  
  resetCall: () => set({ status: 'idle', chatId: null, callerId: null, pendingOffer: null }),
}));
