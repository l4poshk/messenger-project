'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocketStore } from '@/store/socketStore';
import { useCallStore } from '@/store/callStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';

const STUN_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const getSafeMediaStream = async (type: 'audio' | 'video') => {
  const constraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: type === 'video'
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.error('[Call] getUserMedia failed for constraints:', constraints, err);
    // If video failed (e.g. no camera), try audio only as absolute fallback
    if (type === 'video') {
      try {
        console.warn('[Call] Falling back to audio-only');
        return await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, 
            video: false 
        });
      } catch (fallbackErr) {
        console.error('[Call] Critical: Audio fallback also failed', fallbackErr);
        throw fallbackErr;
      }
    }
    throw err;
  }
};

const stopAllTracks = (stream: MediaStream | null) => {
  if (!stream) return;
  stream.getTracks().forEach(track => {
    track.stop();
    console.log(`[Call] Track stopped: ${track.kind}`);
  });
};

const CALL_TIMEOUT_MS = 30_000;

export default function CallModal() {
  const socket = useSocketStore((state) => state.socket);
  const currentUser = useAuthStore((state) => state.user);
  const { status, callType, chatId, callerId, callerName, pendingOffer, setIncomingCall, acceptCall, endCall, resetCall } = useCallStore();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Map<string, { stream: MediaStream; username?: string }>>(new Map());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const pcRefs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializing = useRef(false);

  const cleanupPeer = useCallback((userId: string) => {
    const pc = pcRefs.current.get(userId);
    if (pc) {
      pc.close();
      pcRefs.current.delete(userId);
    }
    setRemotePeers((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const cleanupAll = useCallback(() => {
    isInitializing.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pcRefs.current.forEach((pc) => pc.close());
    pcRefs.current.clear();
    
    stopAllTracks(localStream);
    setLocalStream(null);
    setRemotePeers(new Map());
    resetCall();
  }, [localStream, resetCall]);

  // ── Stable Stream Assignment ──
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Assign remote streams using a separate effect or refs
  useEffect(() => {
    remotePeers.forEach((data, userId) => {
      const el = document.getElementById(`remote-video-${userId}`) as HTMLVideoElement;
      if (el && el.srcObject !== data.stream) {
        el.srcObject = data.stream;
      }
    });
  }, [remotePeers]);

  const createPeerConnection = useCallback((targetUserId: string, stream: MediaStream) => {
    const pc = new RTCPeerConnection(STUN_SERVERS);

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      setRemotePeers((prev) => {
        const next = new Map(prev);
        next.set(targetUserId, { stream: event.streams[0] });
        return next;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call:ice-candidate', { chatId, toUserId: targetUserId, candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        cleanupPeer(targetUserId);
      }
    };

    pcRefs.current.set(targetUserId, pc);
    return pc;
  }, [chatId, socket, cleanupPeer]);

  // ── Signaling Handlers ──

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = (payload: any) => {
      if (useCallStore.getState().status !== 'idle') return;
      // We don't have an offer yet in group calls, just an "incoming" notification
      // Wait, the user wants us to receive an offer? 
      // In Mesh, the "Joiner" sends offers to "Existing" members.
      // So if I'm "Existing", I'll get an offer.
    };

    const handleOffer = async (payload: { callerId: string; offer: any; type: 'audio' | 'video' }) => {
      console.log('[Call] Received offer from', payload.callerId);
      
      let stream = localStream;
      if (!stream) {
        try {
          stream = await getSafeMediaStream(payload.type);
          setLocalStream(stream);
          acceptCall(); // Move to active if we were idle or incoming
        } catch (err) {
          return;
        }
      }

      const pc = createPeerConnection(payload.callerId, stream);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:answer', { chatId, toUserId: payload.callerId, answer });
    };

    const handleAnswer = async (payload: { userId: string; answer: any }) => {
      console.log('[Call] Received answer from', payload.userId);
      const pc = pcRefs.current.get(payload.userId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
      }
    };

    const handleIceCandidate = async (payload: { userId: string; candidate: any }) => {
      const pc = pcRefs.current.get(payload.userId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    };

    const handleUserLeft = (payload: { userId: string }) => {
      cleanupPeer(payload.userId);
    };

    const handleCallStarted = (payload: any) => {
        // If we are in the chat, show incoming call if we are idle
        if (useCallStore.getState().status === 'idle') {
            setIncomingCall(payload.chatId, payload.callerId, payload.callerName, null as any, payload.type);
        }
    };

    socket.on('call:incoming', handleCallStarted);
    socket.on('call:offer', handleOffer);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:user-left', handleUserLeft);
    socket.on('call:cancelled', cleanupAll);
    socket.on('call:error', (p) => {
        setToastMessage(p.message);
        setTimeout(() => setToastMessage(null), 3000);
        cleanupAll();
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:offer');
      socket.off('call:answer');
      socket.off('call:ice-candidate');
      socket.off('call:user-left');
      socket.off('call:cancelled');
      socket.off('call:error');
    };
  }, [socket, localStream, acceptCall, chatId, createPeerConnection, cleanupPeer, cleanupAll, setIncomingCall]);

  // ── Actions ──

  const handleStartOrJoin = async () => {
    if (!socket || !chatId || isInitializing.current) return;
    isInitializing.current = true;
    acceptCall();

    let stream: MediaStream | null = null;
    let effectiveCallType = callType;

    try {
      try {
        // Попытка 1: Запросить основной тип (например, видео)
        stream = await getSafeMediaStream(callType);
      } catch (err) {
        if (callType === 'video') {
          console.warn('[Call] Video failed, falling back to audio');
          // Попытка 2: Резервный аудио-поток
          stream = await getSafeMediaStream('audio');
          effectiveCallType = 'audio';
          useCallStore.getState().setCallType('audio');
        } else {
          throw err;
        }
      }

      if (!stream) throw new Error('Failed to acquire any media stream');
      
      setLocalStream(stream);
      isInitializing.current = false;

      // 1. Присоединяемся к комнате звонка
      socket.emit('call:join', { chatId });

      // 2. Ждем список участников
      socket.once('call:participants', async (payload: { participants: string[] }) => {
        console.log('[Call] Joining active call with participants:', payload.participants);
        
        for (const targetId of payload.participants) {
          const pc = createPeerConnection(targetId, stream!);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:offer', { 
            chatId, 
            toUserId: targetId, 
            offer, 
            type: effectiveCallType // Используем актуальный тип
          });
        }
      });

      // Если мы — инициатор звонка
      if (status === 'outgoing') {
          socket.emit('call:start', { chatId, type: effectiveCallType });
      }

    } catch (err) {
      console.error('[Call] Critical failure during start/join:', err);
      cleanupAll();
    } finally {
      isInitializing.current = false;
    }
  };

  const handleLeave = () => {
    if (socket && chatId) {
      socket.emit('call:leave', { chatId });
    }
    cleanupAll();
  };

  // Initial trigger for outgoing/incoming acceptance
  useEffect(() => {
      if (status === 'outgoing' && !localStream) {
          handleStartOrJoin();
      }
  }, [status]);

  if (status === 'idle' && !toastMessage) return null;

  const participantsCount = remotePeers.size + 1;
  const gridCols = participantsCount <= 1 ? 'grid-cols-1' : participantsCount <= 2 ? 'grid-cols-2' : 'grid-cols-2';

  return (
    <>
      {status !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          
          {status === 'incoming' && (
            <div className="bg-elevated p-8 rounded-3xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-200 shadow-2xl border border-white/5 max-w-sm w-full">
               <div className="w-24 h-24 bg-accent/20 rounded-full flex items-center justify-center animate-pulse overflow-hidden">
                  <span className="text-accent text-3xl font-bold uppercase">{callerName?.charAt(0) || '?'}</span>
               </div>
               <div className="text-center">
                <h2 className="text-2xl font-bold text-text-primary">{callerName || 'Someone'}</h2>
                <p className="text-text-muted mt-2">is inviting you to a {callType} call</p>
              </div>
              <div className="flex gap-4 w-full">
                <button onClick={cleanupAll} className="flex-1 py-4 rounded-2xl bg-danger/10 text-danger hover:bg-danger hover:text-white font-bold transition-all">Decline</button>
                <button onClick={handleStartOrJoin} className="flex-1 py-4 rounded-2xl bg-accent text-accent-dark hover:bg-accent-hover font-bold transition-all">Join</button>
              </div>
            </div>
          )}

          {(status === 'active' || status === 'outgoing') && (
            <div className="flex flex-col w-full h-full max-w-6xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-accent/20 rounded-full text-accent text-xs font-bold uppercase tracking-wider">
                    {callType} Call
                  </div>
                  <span className="text-white/60 text-sm">{participantsCount} participants</span>
                </div>
                <button onClick={handleLeave} className="px-4 py-2 bg-danger text-white rounded-xl text-sm font-bold hover:bg-danger/80 transition-colors">
                  Leave Call
                </button>
              </div>

              {/* Grid */}
              <div className={`flex-1 grid gap-4 ${gridCols} auto-rows-fr min-h-0`}>
                {/* Local User */}
                <div className="relative bg-secondary/50 rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center">
                  <video
                    ref={localVideoRef}
                    autoPlay playsInline muted
                    className={`object-cover ${callType === 'audio' ? 'w-[1px] h-[1px] opacity-0' : 'w-full h-full'}`}
                  />
                  {callType === 'audio' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20">
                            <span className="text-accent text-2xl font-bold uppercase">{currentUser?.username?.charAt(0)}</span>
                        </div>
                        <span className="text-white/60 text-sm font-medium">You (Mic On)</span>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/40 backdrop-blur-md rounded-lg text-white text-xs font-medium">
                    You
                  </div>
                </div>

                {/* Remote Users */}
                {Array.from(remotePeers.entries()).map(([uId, data]) => (
                  <div key={uId} className="relative bg-secondary/50 rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center">
                    <video
                      id={`remote-video-${uId}`}
                      autoPlay playsInline
                      onLoadedMetadata={(e) => e.currentTarget.play().catch(console.error)}
                      className={`object-cover ${callType === 'audio' ? 'w-[1px] h-[1px] opacity-0' : 'w-full h-full'}`}
                    />
                    {callType === 'audio' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                            <span className="text-white/40 text-2xl font-bold uppercase">?</span>
                        </div>
                        <span className="text-white/60 text-sm font-medium">Participant</span>
                      </div>
                    )}
                     <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/40 backdrop-blur-md rounded-lg text-white text-xs font-medium">
                      Remote User
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] animate-slide-up">
          <div className="bg-danger text-white px-6 py-3 rounded-xl shadow-2xl font-medium">
            {toastMessage}
          </div>
        </div>
      )}
    </>
  );
}
