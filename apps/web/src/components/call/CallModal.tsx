'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocketStore } from '@/store/socketStore';
import { useCallStore } from '@/store/callStore';
import { useAuthStore } from '@/store/authStore';

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * Task 1: Robust Media Handling
 * Tries to get video+audio, falls back to audio-only on failure.
 */
const getSafeMediaStream = async (type: 'audio' | 'video') => {
  const audioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  if (type === 'video') {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      });
    } catch (err) {
      console.warn('[Call] Video request failed, falling back to audio-only:', err);
    }
  }

  // Fallback or explicit audio request
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false
    });
  } catch (err) {
    console.error('[Call] Critical: Media acquisition failed', err);
    throw err;
  }
};

const stopAllTracks = (stream: MediaStream | null) => {
  if (!stream) return;
  stream.getTracks().forEach(track => track.stop());
};

/**
 * Task 3: Audio Visualizer Component
 */
function VolumeMeter({ stream, isOwn }: { stream: MediaStream | null, isOwn?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;
    
    // Use the shared AudioContext initialized during user interaction
    const audioContext = (window as any)._sharedAudioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
    (window as any)._sharedAudioContext = audioContext;

    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 64;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let rafId: number;
    const render = () => {
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const height = (average / 255) * canvas.height;
      
      ctx.fillStyle = isOwn ? '#68d391' : '#4299e1';
      ctx.beginPath();
      // Draw a rounded bar
      const r = 4;
      const x = 0;
      const y = canvas.height - height;
      const w = canvas.width;
      const h = height;
      
      if (h > 0) {
        ctx.roundRect(x, y, w, h, Math.min(r, h/2));
        ctx.fill();
      }
      
      rafId = requestAnimationFrame(render);
    };

    render();
    return () => {
      cancelAnimationFrame(rafId);
      // We don't close shared context here to allow others to use it
    };
  }, [stream, isOwn]);

  return <canvas ref={canvasRef} width={8} height={40} className="rounded-full bg-white/10" />;
}

export default function CallModal() {
  const socket = useSocketStore((state) => state.socket);
  const currentUser = useAuthStore((state) => state.user);
  const { status, callType, chatId, callerName, acceptCall, resetCall } = useCallStore();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Map<string, { stream: MediaStream; username?: string }>>(new Map());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const pcRefs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const isInitializing = useRef(false);

  // Audio Context Helper
  const resumeAudio = useCallback(async () => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    
    if (!(window as any)._sharedAudioContext) {
      (window as any)._sharedAudioContext = new AudioCtx();
    }
    const ctx = (window as any)._sharedAudioContext;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }, []);

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
    pcRefs.current.forEach((pc) => pc.close());
    pcRefs.current.clear();
    stopAllTracks(localStream);
    setLocalStream(null);
    setRemotePeers(new Map());
    resetCall();
  }, [localStream, resetCall]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Heartbeat (ping)
  useEffect(() => {
    if (status !== 'active' || !socket || !chatId) return;
    
    const interval = setInterval(() => {
      socket.emit('call:ping', { chatId });
    }, 10000); // 10s heartbeat for 30s TTL
    
    return () => clearInterval(interval);
  }, [status, socket, chatId]);

  // Task 2: WebRTC Signaling logic
  const createPeerConnection = useCallback((targetUserId: string, stream: MediaStream) => {
    const pc = new RTCPeerConnection(STUN_SERVERS);
    pcRefs.current.set(targetUserId, pc);

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

    return pc;
  }, [chatId, socket]);

  useEffect(() => {
    if (!socket || status === 'idle') return;

    socket.on('call:offer', async (p) => {
      console.log('[Call] Offer from', p.callerId);
      const stream = localStream || await getSafeMediaStream(p.type);
      if (!localStream) setLocalStream(stream);
      
      const pc = createPeerConnection(p.callerId, stream);
      await pc.setRemoteDescription(new RTCSessionDescription(p.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { chatId, toUserId: p.callerId, answer });
    });

    socket.on('call:answer', async (p) => {
      const pc = pcRefs.current.get(p.userId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(p.answer));
    });

    socket.on('call:ice-candidate', async (p) => {
      const pc = pcRefs.current.get(p.userId);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(p.candidate));
    });

    socket.on('call:user-joined', async (p) => {
      console.log('[Call] User joined:', p.username);
    });

    socket.on('call:user-left', (p) => cleanupPeer(p.userId));
    socket.on('call:error', (p) => {
      setToastMessage(p.message);
      setTimeout(() => setToastMessage(null), 3000);
      cleanupAll();
    });

    return () => {
      socket.off('call:offer');
      socket.off('call:answer');
      socket.off('call:ice-candidate');
      socket.off('call:user-joined');
      socket.off('call:user-left');
      socket.off('call:error');
    };
  }, [socket, status, localStream, chatId, createPeerConnection, cleanupPeer, cleanupAll]);

  const handleJoin = async () => {
    if (!socket || !chatId || isInitializing.current) return;
    isInitializing.current = true;
    
    // Check if we are starting a call or answering one
    const isInitiator = useCallStore.getState().status === 'outgoing';

    // Resuming AudioContext during user activation
    await resumeAudio();
    acceptCall(); // Status becomes 'active'

    try {
      const stream = await getSafeMediaStream(callType);
      setLocalStream(stream);

      // If we were the initiator, we must tell others to ring
      if (isInitiator) {
        console.log('[Call] 📞 Initiating call:start for', chatId);
        socket.emit('call:start', { chatId, type: callType });
      }

      socket.emit('call:join', { chatId });
      socket.once('call:participants', async (p: { participants: string[] }) => {
        for (const targetId of p.participants) {
          const pc = createPeerConnection(targetId, stream);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:offer', { chatId, toUserId: targetId, offer, type: callType });
        }
      });
    } catch (err) {
      cleanupAll();
    } finally {
      isInitializing.current = false;
    }
  };

  useEffect(() => {
    if (status === 'outgoing' && !localStream) handleJoin();
  }, [status]);

  if (status === 'idle' && !toastMessage) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 overflow-hidden">
      {status === 'incoming' && (
        <div className="bg-secondary p-8 rounded-3xl flex flex-col items-center gap-6 shadow-2xl border border-white/5 max-w-sm w-full">
          <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-accent text-3xl font-bold uppercase">{callerName?.charAt(0)}</span>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">{callerName}</h2>
            <p className="text-white/60 mt-1">Incoming {callType} call</p>
          </div>
          <div className="flex gap-4 w-full">
            <button onClick={async () => { await resumeAudio(); cleanupAll(); }} className="flex-1 py-3 rounded-xl bg-danger/20 text-danger hover:bg-danger hover:text-white transition-all">Decline</button>
            <button onClick={handleJoin} className="flex-1 py-3 rounded-xl bg-accent text-accent-dark hover:bg-accent-hover font-bold transition-all">Join</button>
          </div>
        </div>
      )}

      {(status === 'active' || status === 'outgoing') && (
        <div className="flex flex-col w-full h-full max-w-5xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="px-4 py-1.5 bg-accent/10 border border-accent/20 rounded-full text-accent text-xs font-bold uppercase">
                Live {callType}
              </div>
              <span className="text-white/40 text-sm">{remotePeers.size + 1} connected</span>
            </div>
            <button onClick={() => { socket?.emit('call:leave', { chatId }); cleanupAll(); }} className="px-6 py-2 bg-danger text-white rounded-xl font-bold hover:brightness-110 transition-all">
              End Call
            </button>
          </div>

          <div className="flex-1 grid gap-4 grid-cols-1 md:grid-cols-2 auto-rows-fr">
            {/* Local Video */}
            <div className="relative bg-white/5 rounded-3xl overflow-hidden border border-white/10 group">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mb-4">
                   <span className="text-accent text-xl font-bold">{currentUser?.username?.charAt(0)}</span>
                </div>
                <VolumeMeter stream={localStream} isOwn />
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-3 px-3 py-1.5 bg-black/60 rounded-xl">
                 <VolumeMeter stream={localStream} isOwn />
                 <span className="text-white text-xs font-medium">You</span>
              </div>
            </div>

            {/* Remote Videos */}
            {Array.from(remotePeers.entries()).map(([id, data]) => (
              <div key={id} className="relative bg-white/5 rounded-3xl overflow-hidden border border-white/10">
                <video
                  ref={(el) => { if (el) el.srcObject = data.stream; }}
                  autoPlay playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 flex items-center gap-3 px-3 py-1.5 bg-black/60 rounded-xl">
                   <VolumeMeter stream={data.stream} />
                   <span className="text-white text-xs font-medium">Remote Participant</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-10 px-6 py-3 bg-danger text-white rounded-2xl shadow-2xl animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
