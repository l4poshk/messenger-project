'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message } from '@messenger/shared';
import AudioPlayer from './AudioPlayer';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  activeChatType: string;
}

export default function MessageItem({ message, isOwn, showAvatar, activeChatType }: MessageItemProps) {
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'IMAGE' | 'VIDEO' } | null>(null);

  // Helper for consistent username colors
  const getNameColor = (name: string) => {
    const colors = [
      'text-blue-500', 'text-green-500', 'text-purple-500', 
      'text-orange-500', 'text-pink-500', 'text-indigo-500', 
      'text-cyan-500', 'text-teal-500', 'text-rose-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Cloudinary optimization helper
  const getOptimizedUrl = (url: string | null | undefined, type: 'thumb' | 'full' = 'thumb') => {
    if (!url) return '';
    if (!url.includes('cloudinary.com')) return url;
    
    if (type === 'thumb') {
      return url.replace('/upload/', '/upload/q_auto,f_auto,w_400/');
    }
    return url.replace('/upload/', '/upload/q_auto,f_auto/');
  };

  const renderMedia = () => {
    const fileUrl = (message as any).fileUrl;
    if (!fileUrl) return null;

    switch (message.type) {
      case 'IMAGE':
        return (
          <div className="relative group cursor-pointer" onClick={() => setLightboxMedia({ url: fileUrl, type: 'IMAGE' })}>
            <img
              src={getOptimizedUrl(fileUrl, 'thumb')}
              alt="Shared image"
              className="max-w-sm max-h-80 w-full object-cover rounded-2xl transition-all hover:brightness-90"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-2xl">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </div>
          </div>
        );

      case 'VIDEO':
        return (
          <div 
            className="relative max-w-sm w-full rounded-2xl overflow-hidden bg-black/5 border border-white/5 cursor-pointer group"
            onClick={() => setLightboxMedia({ url: fileUrl, type: 'VIDEO' })}
          >
            <video
              src={fileUrl}
              preload="metadata"
              className="w-full h-full max-h-80 object-contain pointer-events-none"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-xl transform group-hover:scale-110 transition-transform">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        );

      case 'AUDIO':
        return (
          <AudioPlayer
            src={fileUrl}
            duration={message.duration || 0}
            waveform={(message as any).waveform}
            isOwn={isOwn}
          />
        );

      case 'FILE':
        return (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
              isOwn 
                ? 'bg-msg-outgoing/50 border-white/10 hover:bg-msg-outgoing' 
                : 'bg-elevated border-white/5 hover:bg-white/5'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-text-primary">
                {message.fileName || 'Document'}
              </p>
              <p className="text-[10px] text-text-hint">
                {message.fileSize ? `${(message.fileSize / 1024).toFixed(1)} KB` : 'File'}
              </p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-hint">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`}>
        <div className={`flex gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          {!isOwn && (
            <div className="w-8 h-8 shrink-0">
              {showAvatar && (
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-[10px] font-bold">
                  {message.sender?.username?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}
          <div className="group relative">
            {/* Sender name (groups only) */}
            {!isOwn && showAvatar && activeChatType !== 'DIRECT' && (
              <p className={`text-[11px] font-bold mb-0.5 ml-1 drop-shadow-sm ${getNameColor(message.sender?.username || '')}`}>
                {message.sender?.username}
              </p>
            )}

            <div className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
              {/* Forward Label */}
              {message.isForwarded && (
                <div className="flex items-center gap-1.5 mb-1 px-1 text-accent/80">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 10l5 5-5 5" /><path d="M4 4v7a4 4 0 0 0 4 4h11" />
                  </svg>
                  <span className="text-[11px] font-bold tracking-tight">
                    Forwarded {message.originalSenderName ? `from ${message.originalSenderName}` : ''}
                  </span>
                </div>
              )}

              {/* Media Content */}
              {renderMedia()}

              {/* Text Content */}
              {message.content && (
                <div className={`px-4 py-2 rounded-2xl text-sm relative group/bubble ${
                  isOwn
                    ? `bg-msg-outgoing text-msg-outgoing-text ${message.type === 'TEXT' ? 'rounded-tr-none' : ''}`
                    : `bg-elevated text-text-primary ${message.type === 'TEXT' ? 'rounded-tl-none' : ''}`
                }`}>
                  {message.content}
                </div>
              )}
            </div>

            <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {message.isEdited && (
                <span className="text-[9px] text-text-hint italic mr-1">edited</span>
              )}
              
              <span className="text-[9px] text-text-hint">
                {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              
              {isOwn && (
                <div className="flex items-center text-accent">
                  {message.isRead ? (
                    <div className="relative w-[15px] h-3 flex items-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-[4px]">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              )}
            </div>

            {/* Context Menu Button */}
            <div className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 ${isOwn ? '-left-8' : '-right-8'}`}>
              <div className="relative group/menu">
                <button className="w-6 h-6 rounded-full bg-elevated/80 backdrop-blur-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-elevated border border-white/5 transition-all">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
                
                <div className="absolute top-full hidden group-hover/menu:block w-36 bg-elevated border border-white/5 rounded-xl shadow-2xl overflow-hidden py-1 z-20">
                  <button 
                    onClick={() => (window as any).onMessageAction?.(message, 'forward')}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 10 20 15 15 20" /><path d="M4 4v7a4 4 0 0 0 4 4h12" />
                    </svg>
                    Forward
                  </button>
                  
                  {isOwn && message.type === 'TEXT' && message.content !== 'Message deleted' && (
                    <button 
                      onClick={() => (window as any).onMessageAction?.(message, 'edit')}
                      className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                  )}

                  <button 
                    onClick={() => (window as any).onMessageAction?.(message, 'delete_for_me')}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-red-500/10 text-danger transition-colors flex items-center gap-2"
                  >
                    Delete for me
                  </button>

                  {isOwn && message.content !== 'Message deleted' && (
                    <button 
                      onClick={() => (window as any).onMessageAction?.(message, 'delete_for_all')}
                      className="w-full px-3 py-1.5 text-xs text-left hover:bg-red-500/10 text-danger transition-colors flex items-center gap-2"
                    >
                      Delete for everyone
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxMedia(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-full max-h-full flex items-center justify-center"
            >
              {lightboxMedia.type === 'IMAGE' ? (
                <img
                  src={getOptimizedUrl(lightboxMedia.url, 'full')}
                  alt="Fullscreen"
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                />
              ) : (
                <video
                  src={lightboxMedia.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-[90vh] shadow-2xl rounded-lg"
                />
              )}
            </motion.div>

            <button
              onClick={() => setLightboxMedia(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-[110]"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
