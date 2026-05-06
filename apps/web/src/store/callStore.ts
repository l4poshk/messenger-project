import { create } from 'zustand';

export type CallStatus = 'idle' | 'incoming' | 'outgoing' | 'active';

interface CallState {
  status: CallStatus;
  callType: 'audio' | 'video';
  chatId: string | null;
  callerId: string | null;
  callerName: string | null;
  pendingOffer: RTCSessionDescriptionInit | null;

  setIncomingCall: (chatId: string, callerId: string, callerName: string, offer: RTCSessionDescriptionInit, type: 'audio' | 'video') => void;
  setOutgoingCall: (chatId: string, type: 'audio' | 'video') => void;
  setCallType: (type: 'audio' | 'video') => void;
  acceptCall: () => void;
  endCall: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  status: 'idle',
  callType: 'video',
  chatId: null,
  callerId: null,
  callerName: null,
  pendingOffer: null,

  setIncomingCall: (chatId, callerId, callerName, offer, type) =>
    set({ status: 'incoming', chatId, callerId, callerName, pendingOffer: offer, callType: type }),

  setOutgoingCall: (chatId, type) =>
    set({ status: 'outgoing', chatId, callerId: null, callerName: null, pendingOffer: null, callType: type }),

  setCallType: (type) => set({ callType: type }),

  acceptCall: () => set({ status: 'active' }),

  endCall: () => set({ status: 'idle', chatId: null, callerId: null, callerName: null, pendingOffer: null }),
  
  resetCall: () => set({ status: 'idle', chatId: null, callerId: null, callerName: null, pendingOffer: null }),
}));
