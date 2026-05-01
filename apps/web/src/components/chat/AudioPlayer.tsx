'use client';

// ──────────────────────────────────────────────
// AudioPlayer — bulletproof voice message player
// Handles WebM duration:Infinity bug from MediaRecorder
// ──────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react';

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

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const proxiedSrc = `${apiBase}/upload/proxy?url=${encodeURIComponent(src)}`;
    console.log('[Audio] init, proxy:', proxiedSrc);

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
      if (isFixingRef.current) {
        console.log('[Audio] 🚫 Ignoring false "ended" during fix');
        return;
      }
      console.log('[Audio] Playback ended naturally');
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };

    // ── PAUSE — ignore during fix! ──
    const handlePause = () => {
      if (isFixingRef.current) {
        console.log('[Audio] 🚫 Ignoring false "pause" during fix');
        return;
      }
      // Normal pause from user or system
    };

    // ── ERROR ──
    const handleError = () => {
      if (isFixingRef.current) {
        console.log('[Audio] 🚫 Ignoring error during fix');
        return;
      }
      const e = audio.error;
      const msg = e ? `code=${e.code} ${e.message}` : 'unknown';
      console.error('[Audio] ❌ Error:', msg);
      setError(msg);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    audio.src = proxiedSrc;
    audio.load();

    return () => {
      isFixingRef.current = false;
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      audioRef.current = null;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [src, propDuration]);

  // ── Progress animation loop ──
  useEffect(() => {
    if (!isPlaying) return;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio || isFixingRef.current) return;

      const ct = audio.currentTime;
      setCurrentTime(ct);
      const dur = getDuration();
      if (dur > 0) {
        setProgress(Math.min(100, (ct / dur) * 100));
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, getDuration]);

  // ── PLAY / PAUSE ──
  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    console.log('[Audio] 🖱️ Play/Pause clicked. ready:', ready, 'isPlaying:', isPlaying, 'fixing:', isFixingRef.current, 'audio:', !!audio);

    if (!audio) {
      console.error('[Audio] No audio element!');
      return;
    }

    if (isFixingRef.current) {
      console.warn('[Audio] Still fixing duration, please wait...');
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      console.log('[Audio] ⏸ Paused');
    } else {
      try {
        // Ensure valid position
        if (!isFinite(audio.currentTime) || audio.currentTime < 0) {
          audio.currentTime = 0;
        }
        console.log('[Audio] ▶ Calling play(), readyState:', audio.readyState, 'currentTime:', audio.currentTime);
        await audio.play();
        setIsPlaying(true);
        setError(null);
        console.log('[Audio] ▶ Playing!');
      } catch (err: any) {
        console.error('[Audio] ▶ Play failed:', err.name, err.message);
        setError(err.message);
      }
    }
  }, [isPlaying, ready]);

  // ── SEEK ──
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || isFixingRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = getDuration();

    if (dur > 0) {
      audio.currentTime = pct * dur;
      setCurrentTime(pct * dur);
      setProgress(pct * 100);
    }
  }, [getDuration]);

  // ── Format ──
  const fmt = (s: number) => {
    const sec = Math.max(0, Math.round(s));
    return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  };

  const timeLabel = isPlaying || currentTime > 0 ? fmt(currentTime) : fmt(totalDuration);
  
  // Default fallback waveform if none provided
  const fallbackBars = [0.2, 0.4, 0.6, 0.8, 0.5, 0.7, 0.4, 0.3, 0.6, 0.9, 0.4, 0.5, 0.4, 0.2, 0.5, 0.8, 0.4, 0.6];
  const activeWaveform = (waveform && waveform.length > 0) ? waveform : fallbackBars;

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl min-w-[220px] max-w-[300px] ${
      isOwn ? 'bg-msg-outgoing rounded-tr-none' : 'bg-elevated rounded-tl-none'
    }`}>
      {/* Play / Pause */}
      <button
        type="button"
        onClick={handlePlayPause}
        disabled={isFixingRef.current}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isOwn
            ? 'bg-white/20 text-msg-outgoing-text hover:bg-white/30'
            : 'bg-accent/10 text-accent hover:bg-accent/20'
        } disabled:opacity-40`}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        )}
      </button>

      {/* Waveform seekbar */}
      <div className="flex-1 min-w-0">
        <div
          onClick={handleSeek}
          className="flex items-end gap-[2px] h-6 cursor-pointer"
        >
          {activeWaveform.map((val, i) => {
            const active = (i / activeWaveform.length) * 100 < progress;
            // Height: val is 0-1, max height is 24px (h-6)
            const h = Math.max(3, val * 24); 
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-colors duration-100"
                style={{
                  height: `${h}px`,
                  minWidth: '2px',
                  backgroundColor: isOwn
                    ? active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'
                    : active ? 'var(--color-accent, #68d391)' : 'rgba(255,255,255,0.1)',
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className={`text-[10px] font-mono ${isOwn ? 'text-msg-outgoing-text/60' : 'text-text-hint'}`}>
            {timeLabel}
          </span>
          {error && <span className="text-[9px] text-danger truncate ml-1">⚠ Error</span>}
        </div>
      </div>
    </div>
  );
}
