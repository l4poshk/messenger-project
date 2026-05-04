import { create } from 'zustand';

export type CallStatus = 'idle' | 'incoming' | 'outgoing' | 'active';

interface CallState {
  status: CallStatus;
  callType: 'audio' | 'video';
  chatId: string | null;
  callerId: string | null;
  pendingOffer: RTCSessionDescriptionInit | null;

  setIncomingCall: (chatId: string, callerId: string, offer: RTCSessionDescriptionInit, type: 'audio' | 'video') => void;
  setOutgoingCall: (chatId: string, type: 'audio' | 'video') => void;
  acceptCall: () => void;
  endCall: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  status: 'idle',
  callType: 'video',
  chatId: null,
  callerId: null,
  pendingOffer: null,

  setIncomingCall: (chatId, callerId, offer, type) =>
    set({ status: 'incoming', chatId, callerId, pendingOffer: offer, callType: type }),

  setOutgoingCall: (chatId, type) =>
    set({ status: 'outgoing', chatId, callerId: null, pendingOffer: null, callType: type }),

  acceptCall: () => set({ status: 'active' }),

  endCall: () => set({ status: 'idle', chatId: null, callerId: null, pendingOffer: null }),
  
  resetCall: () => set({ status: 'idle', chatId: null, callerId: null, pendingOffer: null }),
}));
