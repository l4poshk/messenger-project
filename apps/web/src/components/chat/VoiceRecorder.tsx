'use client';

// ──────────────────────────────────────────────
// Voice Recorder — MediaRecorder API + timer UI
// Records audio, extracts real waveform, uploads to R2
// ──────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

const WAVEFORM_BARS = 40; // Number of bars to generate for Telegram-like UI

interface VoiceRecorderProps {
  onSend: (fileUrl: string, duration: number, waveform: number[]) => void;
  disabled?: boolean;
}

export default function VoiceRecorder({ onSend, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [isSilent, setIsSilent] = useState(false);
  const [volume, setVolume] = useState(0); // For live visualizer

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Audio Context & Waveform state
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const rawSamplesRef = useRef<number[]>([]);
  const lastSampleTimeRef = useRef<number>(0);

  // Timer
  useEffect(() => {
    if (isRecording) {
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const cleanupAudioContext = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(console.error);
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
  };

  // Compress any length array to exactly N bars
  const normalizeWaveform = (samples: number[], targetLength: number): number[] => {
    if (samples.length === 0) return Array(targetLength).fill(0.1);
    
    // Smooth out and chunk the array
    const chunkSize = Math.max(1, Math.floor(samples.length / targetLength));
    const result: number[] = [];
    
    let maxVal = 0.01; // Avoid divide by zero
    for (let i = 0; i < targetLength; i++) {
      const startIndex = Math.floor((i / targetLength) * samples.length);
      const endIndex = Math.floor(((i + 1) / targetLength) * samples.length);
      const chunk = samples.slice(startIndex, endIndex || startIndex + 1);
      
      const avg = chunk.reduce((sum, val) => sum + val, 0) / (chunk.length || 1);
      result.push(avg);
      if (avg > maxVal) maxVal = avg;
    }

    // Normalize so highest peak is 1.0 (with a minimum height of 0.1 for visibility)
    return result.map(val => Math.max(0.1, val / maxVal));
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (stream.getAudioTracks().length === 0) throw new Error('No audio tracks found.');
      
      streamRef.current = stream;

      const mimeType = 'audio/webm;codecs=opus';
      const finalMimeType = MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType: finalMimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      rawSamplesRef.current = [];

      // Audio Context for Waveform & Silence
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;
      
      silenceStartRef.current = Date.now();
      lastSampleTimeRef.current = Date.now();
      setIsSilent(false);

      const checkVolume = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArrayRef.current[i];
        }
        const avgVolume = sum / bufferLength;
        
        // Update live visualizer
        setVolume(Math.min(100, (avgVolume / 128) * 100));
        
        // Sample for waveform every ~50ms
        const now = Date.now();
        if (now - lastSampleTimeRef.current >= 50) {
          rawSamplesRef.current.push(avgVolume);
          lastSampleTimeRef.current = now;
        }

        // Silence detection
        if (avgVolume > 5) {
          silenceStartRef.current = null;
          setIsSilent(false);
        } else {
          if (silenceStartRef.current === null) silenceStartRef.current = now;
          else if (now - silenceStartRef.current > 3000) setIsSilent(true);
        }
        
        rafRef.current = requestAnimationFrame(checkVolume);
      };
      checkVolume();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        cleanupAudioContext();
        
        const blob = new Blob(chunksRef.current, { type: finalMimeType });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        if (blob.size === 0) return;

        // Generate final waveform
        const finalWaveform = normalizeWaveform(rawSamplesRef.current, WAVEFORM_BARS);

        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', blob, `voice-${Date.now()}.webm`);
          formData.append('duration', String(duration));

          const res = await api.post<any>('/upload/audio', formData);
          const json = res;

          if (json.data?.url) {
            onSend(json.data.url, json.data.duration || duration, finalWaveform);
          }
        } catch (err) {
          console.error('[Voice] Upload failed:', err);
        } finally {
          setUploading(false);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error('[Voice] Mic error:', err);
      alert('Microphone access is required.');
    }
  }, [duration, onSend]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    cleanupAudioContext();
    chunksRef.current = [];
    rawSamplesRef.current = [];
    setIsRecording(false);
    setIsSilent(false);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (uploading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-elevated text-text-muted text-sm">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        Uploading voice...
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-3 flex-1">
        <button
          type="button"
          onClick={cancelRecording}
          className="w-10 h-10 rounded-full flex items-center justify-center text-danger hover:bg-danger/10 transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex items-center gap-2 flex-1 px-4 py-2.5 rounded-xl bg-elevated overflow-hidden relative">
          <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse shrink-0" />
          <span className="text-sm text-danger font-medium shrink-0">
            {isSilent ? 'No sound!' : 'Recording'}
          </span>
          
          <div className="flex-1 h-2 bg-black/10 rounded-full overflow-hidden mx-2 relative opacity-50">
            <div 
              className="h-full bg-danger transition-all duration-75"
              style={{ width: `${volume}%` }}
            />
          </div>

          <span className="text-sm text-text-muted font-mono shrink-0 ml-auto">{formatTime(duration)}</span>
        </div>

        <button
          type="button"
          onClick={stopRecording}
          className="w-10 h-10 rounded-full bg-accent text-accent-dark flex items-center justify-center transition-all hover:bg-accent-hover shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-elevated transition-colors shrink-0 disabled:opacity-50"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}
