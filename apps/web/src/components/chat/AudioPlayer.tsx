'use client';

// ──────────────────────────────────────────────
// AudioPlayer — bulletproof voice message player
// Handles WebM duration:Infinity bug from MediaRecorder
// ──────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react';
import { API_URL } from '@/lib/api';

interface AudioPlayerProps {
  src: string;
  duration?: number | null;
  waveform?: number[] | null;
  isOwn: boolean;
}

export default function AudioPlayer({ src, duration: propDuration, waveform, isOwn }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(propDuration || 0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const animFrameRef = useRef<number | null>(null);
  // Guards against false events fired during the Infinity hack
  const isFixingRef = useRef(false);
  const resolvedDurationRef = useRef<number>(propDuration || 0);

  // ── Get best known duration ──
  const getDuration = useCallback((): number => {
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
      return audio.duration;
    }
    return resolvedDurationRef.current || propDuration || 0;
  }, [propDuration]);

  // ── Init audio element ──
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    isFixingRef.current = false;

    const isExternal = src.startsWith('http');
    const finalSrc = isExternal ? src : `${API_URL}/upload/proxy?url=${encodeURIComponent(src)}`;
    
    console.log('[Audio] init, src:', finalSrc);
    audio.src = finalSrc;

    // ── LOADED METADATA ──
    const handleLoadedMetadata = () => {
      console.log('[Audio] loadedmetadata, raw duration:', audio.duration);

      if (!isFinite(audio.duration) || audio.duration === Infinity) {
        // ── START INFINITY FIX ──
        isFixingRef.current = true;
        console.log('[Audio] ⚠ Infinity detected, starting fix...');
        audio.currentTime = 1e101;
      } else {
        // Normal file with proper metadata
        resolvedDurationRef.current = audio.duration;
        setTotalDuration(audio.duration);
        setReady(true);
        console.log('[Audio] ✅ Ready (normal), duration:', audio.duration);
      }
    };

    // ── TIME UPDATE — used ONLY to catch the Infinity hack result ──
    const handleTimeUpdate = () => {
      if (!isFixingRef.current) return; // ignore during normal playback

      // Browser has scanned the file, duration should now be finite
      const dur = audio.duration;
      console.log('[Audio] timeupdate during fix, duration now:', dur);

      if (isFinite(dur) && dur > 0) {
        resolvedDurationRef.current = dur;
        setTotalDuration(dur);
      } else if (propDuration && propDuration > 0) {
        resolvedDurationRef.current = propDuration;
        setTotalDuration(propDuration);
      }

      // Seek back to start and wait for seeked event
      audio.currentTime = 0;
    };

    // ── SEEKED — fires after currentTime=0 completes ──
    const handleSeeked = () => {
      if (!isFixingRef.current) return; // only care during fix

      // Fix complete! Player is now at 0:00 with known duration
      isFixingRef.current = false;
      setReady(true);
      console.log('[Audio] ✅ Fix complete, ready! Duration:', resolvedDurationRef.current);
    };

    // ── ENDED — ignore during fix! ──
    const handleEnded = () => {
      if (isFixingRef.current) return;
      setIsPlaying(false);
      setCurrentTime(0);
      setProgress(0);
    };

    const handleError = (e: any) => {
      console.error('[Audio] element error:', audio.error);
      setError('Format error');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audioRef.current = null;
    };
  }, [src, propDuration]);

  // ── Sync progress ──
  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(audio.currentTime);
    const dur = getDuration();
    if (dur > 0) {
      setProgress((audio.currentTime / dur) * 100);
    }
    animFrameRef.current = requestAnimationFrame(updateProgress);
  }, [getDuration]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateProgress);
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, updateProgress]);

  // ── Handlers ──
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !ready) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(err => console.error('[Audio] Play failed:', err));
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !ready) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const dur = getDuration();
    
    audio.currentTime = pct * dur;
    setCurrentTime(audio.currentTime);
    setProgress(pct * 100);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── UI UI UI ──
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl min-w-[240px] shadow-sm transition-all ${
      isOwn 
        ? 'bg-msg-outgoing text-msg-outgoing-text' 
        : 'bg-elevated text-text-primary'
    }`}>
      {/* Play/Pause Button */}
      <button 
        onClick={togglePlay}
        disabled={!ready || !!error}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
          isOwn 
            ? 'bg-white/20 hover:bg-white/30 text-white' 
            : 'bg-accent/10 hover:bg-accent/20 text-accent'
        } disabled:opacity-50`}
      >
        {isPlaying ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>

      {/* Waveform & Info */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div 
          className="h-8 flex items-center gap-[2px] cursor-pointer group"
          onClick={handleSeek}
        >
          {(waveform && waveform.length > 0 ? waveform : Array.from({length: 40}, () => 0.2 + Math.random() * 0.6)).map((h, i) => {
            const barCount = (waveform && waveform.length > 0) ? waveform.length : 40;
            const isFilled = (i / barCount) * 100 < progress;
            
            return (
              <div 
                key={i}
                className={`w-0.5 rounded-full transition-all ${
                  isFilled
                    ? (isOwn ? 'bg-white' : 'bg-accent')
                    : (isOwn ? 'bg-white/30' : 'bg-white/10')
                }`}
                style={{ height: `${Math.max(15, h * 100)}%` }}
              />
            );
          })}
        </div>
        
        <div className="flex justify-between items-center px-0.5">
          <span className="text-[10px] font-medium opacity-70">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] font-medium opacity-70">
            {formatTime(totalDuration)}
          </span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="absolute -top-6 left-0 text-[10px] text-danger animate-pulse">
          {error}
        </div>
      )}
    </div>
  );
}
