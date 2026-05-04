'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocketStore } from '@/store/socketStore';
import { useCallStore } from '@/store/callStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';

const STUN_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const getSafeMediaStream = async () => {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    console.warn('[Call] Failed to get video+audio, falling back to audio only', err);
    try {
      return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    } catch (fallbackErr) {
      console.error('[Call] Failed to get any media stream', fallbackErr);
      throw fallbackErr;
    }
  }
};

const CALL_TIMEOUT_MS = 30_000; // 30 seconds

export default function CallModal() {
  const socket = useSocketStore((state) => state.socket);
  const currentUser = useAuthStore((state) => state.user);
  const { status, chatId, callerId, pendingOffer, setIncomingCall, acceptCall, endCall, resetCall } = useCallStore();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Global socket listeners for Call events ──
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (payload: any) => {
      // Ignore offers if we're already in a call
      if (useCallStore.getState().status !== 'idle') return;
      // Ignore our own offers just in case
      if (payload.callerId === currentUser?.id) return;

      console.log('[Call] Incoming offer from', payload.callerId);
      setIncomingCall(payload.chatId, payload.callerId, payload.offer);
    };

    const handleAnswer = async (payload: any) => {
      console.log('[Call] Received answer');
      if (pcRef.current && pcRef.current.signalingState !== 'closed') {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        } catch (e) {
          console.error('[Call] Error setting remote description', e);
        }
      }
    };

    const handleIceCandidate = async (payload: any) => {
      if (pcRef.current && pcRef.current.signalingState !== 'closed') {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.error('[Call] Error adding ICE candidate', e);
        }
      }
    };

    const handleEnd = () => {
      console.log('[Call] Call ended by peer');
      cleanupCall();
    };

    const handleCancelled = () => {
      console.log('[Call] Call cancelled by caller (timeout or manual cancel)');
      cleanupCall();
    };

    socket.on('call:offer', handleOffer);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:end', handleEnd);
    socket.on('call:cancelled', handleCancelled);

    return () => {
      socket.off('call:offer', handleOffer);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:end', handleEnd);
      socket.off('call:cancelled', handleCancelled);
    };
  }, [socket, currentUser?.id, setIncomingCall]);

  // ── Attach streams to video elements ──
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, status]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, status]);

  // ── Clear timeout helper ──
  const clearCallTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // ── Cleanup function ──
  const cleanupCall = useCallback(() => {
    clearCallTimeout();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    resetCall();
  }, [localStream, resetCall, clearCallTimeout]);

  // Helper: find the other user in this chat
  const getRecipientId = useCallback(() => {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
    const recipient = (chat as any)?.members?.find(
      (m: any) => m.userId !== currentUser?.id
    );
    return recipient?.userId || '';
  }, [chatId, currentUser?.id]);

  // Handle local caller END / CANCEL
  const handleEndCall = () => {
    if (socket && chatId) {
      const currentStatus = useCallStore.getState().status;
      if (currentStatus === 'outgoing') {
        // Call not answered yet — send cancel (generates missed-call notification)
        socket.emit('call:cancel', { chatId, recipientId: getRecipientId() });
      } else {
        // Active call — normal end
        socket.emit('call:end', { chatId });
      }
    }
    cleanupCall();
  };

  // ── Accept Incoming Call ──
  const handleAccept = async () => {
    if (!socket || !chatId || !pendingOffer) return;
    acceptCall();

    try {
      const stream = await getSafeMediaStream();
      setLocalStream(stream);

      const pc = new RTCPeerConnection(STUN_SERVERS);
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote tracks
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('call:ice-candidate', { chatId, candidate: event.candidate });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:answer', { chatId, answer });
    } catch (err) {
      console.error('[Call] Failed to accept call', err);
      handleEndCall();
    }
  };

  const handleReject = () => {
    if (socket && chatId) {
      socket.emit('call:end', { chatId });
    }
    resetCall();
  };

  // ── Outgoing Call initialization + timeout ──
  useEffect(() => {
    if (status === 'outgoing' && chatId && !pcRef.current) {
      const initOutgoing = async () => {
        try {
          const stream = await getSafeMediaStream();
          setLocalStream(stream);

          const pc = new RTCPeerConnection(STUN_SERVERS);
          pcRef.current = pc;

          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket!.emit('call:ice-candidate', { chatId, candidate: event.candidate });
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket!.emit('call:offer', {
            chatId,
            callerId: currentUser?.id,
            offer,
            type: 'video',
          });

          // ── Start 30s timeout ──
          clearCallTimeout();
          timeoutRef.current = setTimeout(() => {
            console.log('[Call] Timeout — no answer after 30s');
            socket!.emit('call:cancel', { chatId, recipientId: getRecipientId() });
            cleanupCall();
            setToastMessage('No answer — call ended');
            setTimeout(() => setToastMessage(null), 4000);
          }, CALL_TIMEOUT_MS);
        } catch (err) {
          console.error('[Call] Failed to start outgoing call', err);
          cleanupCall();
        }
      };

      initOutgoing();
    }
  }, [status, chatId, socket, currentUser?.id, cleanupCall, clearCallTimeout, getRecipientId]);

  // ── Clear timeout when call status changes away from outgoing ──
  useEffect(() => {
    if (status !== 'outgoing') {
      clearCallTimeout();
    }
  }, [status, clearCallTimeout]);

  // Toast-only render (when call is idle but toast is visible)
  if (status === 'idle' && !toastMessage) return null;

  return (
    <>
      {/* ── Call Modal ── */}
      {status !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          {status === 'incoming' && (
            <div className="bg-elevated p-6 rounded-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center animate-pulse">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold">Incoming Call</h2>
                <p className="text-text-muted mt-1">Someone is calling you</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleReject}
                  className="px-6 py-3 rounded-xl bg-danger hover:bg-danger/80 text-white font-medium transition-colors flex items-center gap-2"
                >
                  Reject
                </button>
                <button
                  onClick={handleAccept}
                  className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-accent-dark font-medium transition-colors flex items-center gap-2"
                >
                  Accept
                </button>
              </div>
            </div>
          )}

          {(status === 'active' || status === 'outgoing') && (
            <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              {/* Remote Video (Full Screen) */}
              {remoteStream ? (
                <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover ${remoteStream.getVideoTracks().length === 0 ? 'hidden' : ''}`}
                  />
                  {remoteStream.getVideoTracks().length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-elevated/50">
                      <div className="w-24 h-24 bg-accent/20 rounded-full flex items-center justify-center mb-4">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                      </div>
                      <span className="text-white font-medium text-lg">Audio Call</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xl font-medium">
                  {status === 'outgoing' ? 'Calling...' : 'Waiting for video...'}
                </div>
              )}

              {/* Local Video (PiP) */}
              <div className="absolute bottom-6 right-6 w-48 aspect-video bg-elevated rounded-xl overflow-hidden shadow-lg border border-white/10 flex items-center justify-center">
                {localStream?.getVideoTracks().length === 0 ? (
                  <div className="text-white/50 flex flex-col items-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                  </div>
                ) : (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Controls */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/50 backdrop-blur-md px-6 py-3 rounded-full">
                <button
                  onClick={handleEndCall}
                  className="w-12 h-12 rounded-full bg-danger flex items-center justify-center hover:bg-danger/80 transition-colors"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                    <line x1="23" y1="1" x2="1" y2="23"></line>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] animate-slide-up">
          <div className="flex items-center gap-3 bg-elevated border border-border rounded-xl px-5 py-3 shadow-2xl">
            <div className="w-8 h-8 rounded-full bg-danger/10 flex items-center justify-center text-danger shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
            </div>
            <span className="text-sm font-medium text-text-primary">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-text-hint hover:text-text-primary transition-colors ml-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
