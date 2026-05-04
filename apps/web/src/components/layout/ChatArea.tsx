'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useMessageStore } from '@/store/messageStore';
import { useSocketStore } from '@/store/socketStore';
import { useCallStore } from '@/store/callStore';
import { api } from '@/lib/api';
import TopicBar from '@/components/chat/TopicBar';
import AudioPlayer from '@/components/chat/AudioPlayer';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import ChatInfoPanel from '@/components/chat/ChatInfoPanel';
import type { Message, Topic } from '@messenger/shared';

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_TYPING: string[] = [];

export default function ChatArea() {
  const userId = useAuthStore((s) => s.user?.id);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeChat = useChatStore((s) => s.chats.find((c) => c.id === activeChatId));

  const messagesRaw = useMessageStore((s) =>
    activeChatId ? s.messages[activeChatId] : undefined
  );
  const messages = messagesRaw ?? EMPTY_MESSAGES;

  const typingRaw = useSocketStore((s) =>
    activeChatId ? s.typingUsers[activeChatId] : undefined
  );
  const typingUsers = typingRaw ?? EMPTY_TYPING;
  const socket = useSocketStore((s) => s.socket);

  const [content, setContent] = useState('');
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSupergroup = (activeChat as any)?.type === 'SUPERGROUP';
  const myMembership = (activeChat as any)?.members?.find(
    (m: any) => m.userId === userId
  );
  const canManageTopics = myMembership?.role === 'OWNER' || myMembership?.role === 'ADMIN';

  // ── Fetch topics for supergroup ──
  useEffect(() => {
    if (!activeChatId || !isSupergroup) {
      setTopics([]);
      setActiveTopicId(null);
      return;
    }
    const fetchTopics = async () => {
      const res = await api.get<Topic[]>(`/chats/${activeChatId}/topics`);
      if (res.data) setTopics(res.data);
    };
    fetchTopics();
  }, [activeChatId, isSupergroup]);

  // ── Fetch messages (with optional topicId filter) ──
  useEffect(() => {
    if (!activeChatId) return;
    let cancelled = false;

    const fetchMessages = async () => {
      const url = activeTopicId
        ? `/chats/${activeChatId}/messages?topicId=${activeTopicId}`
        : `/chats/${activeChatId}/messages`;
      const result = await api.get<Message[]>(url);
      if (result.data && !cancelled) {
        useMessageStore.getState().setMessages(activeChatId, result.data);
      }
    };
    fetchMessages();

    if (socket) {
      socket.emit('chat:join', activeChatId);
    }

    return () => { cancelled = true; };
  }, [activeChatId, activeTopicId, socket]);

  // ── Scroll to bottom ──
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const getChatDisplayName = () => {
    const chat = activeChat as any;
    if (!chat) return 'Chat';
    if (chat.type === 'DIRECT') {
      const other = chat.members?.find((m: any) => m.userId !== userId);
      return other?.user?.username || 'Chat';
    }
    return chat.name || 'Group';
  };

  const getChatStatus = () => {
    const chat = activeChat as any;
    if (!chat) return null;

    if (chat.type === 'DIRECT') {
      const other = chat.members?.find((m: any) => m.userId !== userId)?.user;
      if (!other) return null;

      const isOnline =
        other.status === 'ONLINE' ||
        (other.lastSeen && Date.now() - new Date(other.lastSeen).getTime() < 5 * 60 * 1000);

      if (isOnline) {
        return (
          <span className="flex items-center gap-1 text-accent">
            <span className="w-1 h-1 rounded-full bg-accent" />
            Online
          </span>
        );
      }

      if (other.lastSeen) {
        return `Last seen ${formatLastSeen(other.lastSeen)}`;
      }

      return 'Offline';
    }

    return `${chat.members?.length || 0} members`;
  };

  const formatLastSeen = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    // Less than 1 minute
    if (diff < 60000) return 'just now';

    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `today at ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;

    return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time}`;
  };

  // ── File selection ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Only images are supported');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImagePreview = () => {
    setImagePreview(null);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Upload image to R2 ──
  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);

      const token = useAuthStore.getState().accessToken;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/upload/image`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const json = await res.json();
      if (json.error) {
        console.error('[Upload] Error:', json.error);
        return null;
      }
      return json.data?.url || null;
    } catch (err) {
      console.error('[Upload] Failed:', err);
      return null;
    } finally {
      setUploading(false);
    }
  };

  // ── Send message ──
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasText = content.trim().length > 0;
    const hasImage = !!imageFile;

    if (!hasText && !hasImage) return;
    if (!activeChatId) {
      console.error('[Chat] No active chat selected');
      return;
    }
    if (!socket || !socket.connected) {
      console.error('[Chat] Socket not connected');
      return;
    }

    try {
      // If there's an image, upload first
      let fileUrl: string | undefined;
      if (hasImage) {
        const url = await uploadImage();
        if (url) {
          fileUrl = url;
        } else {
          console.error('[Chat] Image upload failed');
          return;
        }
      }

      const payload = {
        chatId: activeChatId,
        content: hasText ? content.trim() : (fileUrl ? '' : ''),
        type: fileUrl ? 'IMAGE' : 'TEXT',
        ...(fileUrl ? { fileUrl } : {}),
        ...(activeTopicId ? { topicId: activeTopicId } : {}),
      };

      console.log('[Chat] 📤 Sending:', payload);
      socket.emit('message:send', payload);
      setContent('');
      clearImagePreview();
      socket.emit('typing:stop', activeChatId);
    } catch (err) {
      console.error('[Chat] Failed to send:', err);
    }
  };

  const handleKeyDown = () => {
    if (!socket || !activeChatId) return;
    socket.emit('typing:start', activeChatId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', activeChatId);
    }, 3000);
  };

  // ── Empty state ──
  if (!activeChatId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center text-text-hint bg-primary">
        <div className="w-20 h-20 rounded-3xl bg-accent/5 flex items-center justify-center mb-4 text-accent/40">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-medium text-text-muted mb-1">Select a chat</h2>
        <p className="text-sm text-text-hint">Choose a conversation or start a new one</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-primary min-w-0">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 shrink-0 bg-primary/80 backdrop-blur-sm z-10">
        <div
          onClick={() => setShowInfo(!showInfo)}
          className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold uppercase">
            {getChatDisplayName().charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary text-sm truncate">{getChatDisplayName()}</h3>
            {typingUsers.length > 0 ? (
              <p className="text-[10px] text-accent animate-pulse">
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </p>
            ) : (
              <p className="text-[10px] text-text-hint">
                {getChatStatus()}
              </p>
            )}
          </div>
        </div>

        {/* Call Button (only for DIRECT chats, or just generically) */}
        {activeChat?.type === 'DIRECT' && (
          <button
            onClick={() => useCallStore.getState().setOutgoingCall(activeChatId)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 transition-colors shrink-0 ml-4"
            title="Video Call"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </button>
        )}
      </header>

      {/* Topic Bar (only for supergroups) */}
      {isSupergroup && (
        <TopicBar
          chatId={activeChatId}
          topics={topics}
          activeTopicId={activeTopicId}
          onSelectTopic={setActiveTopicId}
          onTopicCreated={(topic) => setTopics((prev) => [...prev, topic])}
          canManage={canManageTopics}
        />
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-hint text-sm">
            No messages yet. Say hello! 👋
          </div>
        )}
        {messages.map((msg, idx) => {
          const isOwn = msg.senderId === userId;
          const showAvatar = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
          const isImage = msg.type === 'IMAGE' && (msg as any).fileUrl;
          const isAudio = msg.type === 'AUDIO' && (msg as any).fileUrl;

          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              <div className={`flex gap-2 max-w-[70%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isOwn && (
                  <div className="w-8 h-8 shrink-0">
                    {showAvatar && (
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-[10px] font-bold">
                        {msg.sender?.username?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}
                <div className="group relative">
                  {/* Sender name (groups only) */}
                  {!isOwn && showAvatar && (activeChat as any)?.type !== 'DIRECT' && (
                    <p className="text-[10px] text-accent font-medium mb-0.5 ml-1">
                      {msg.sender?.username}
                    </p>
                  )}

                  {/* Audio message */}
                  {isAudio ? (
                    <AudioPlayer
                      src={(msg as any).fileUrl}
                      duration={msg.duration}
                      waveform={(msg as any).waveform}
                      isOwn={isOwn}
                    />
                  ) : isImage ? (
                    /* Image message */
                    <div className={`rounded-2xl overflow-hidden ${
                      isOwn ? 'rounded-tr-none' : 'rounded-tl-none'
                    }`}>
                      <img
                        src={(msg as any).fileUrl}
                        alt="Shared image"
                        className="max-w-sm max-h-80 object-cover rounded-2xl cursor-pointer hover:opacity-90 transition-opacity"
                        loading="lazy"
                        onClick={() => window.open((msg as any).fileUrl, '_blank')}
                      />
                      {msg.content && (
                        <div className={`px-4 py-1.5 text-sm ${
                          isOwn
                            ? 'bg-msg-outgoing text-msg-outgoing-text'
                            : 'bg-elevated text-text-primary'
                        }`}>
                          {msg.content}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Text message */
                    <div className={`px-4 py-2 rounded-2xl text-sm ${
                      isOwn
                        ? 'bg-msg-outgoing text-msg-outgoing-text rounded-tr-none'
                        : 'bg-elevated text-text-primary rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  )}

                  <div className={`text-[9px] text-text-hint mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 py-2 border-t border-border bg-secondary/50">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-20 rounded-lg object-cover"
            />
            <button
              onClick={clearImagePreview}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-primary">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-elevated transition-colors shrink-0"
            title="Attach image"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Text input */}
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeTopicId ? 'Message in #topic...' : 'Type a message...'}
            className="flex-1 bg-elevated border-0 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-hint outline-none focus:ring-1 focus:ring-accent/30"
          />

          {/* Voice recorder (shows when no text typed) */}
          {!content.trim() && !imageFile ? (
            <VoiceRecorder
              onSend={(fileUrl, dur, wf) => {
                if (!activeChatId || !socket?.connected) return;
                socket.emit('message:send', {
                  chatId: activeChatId,
                  content: '',
                  type: 'AUDIO',
                  fileUrl,
                  duration: dur,
                  waveform: wf,
                  ...(activeTopicId ? { topicId: activeTopicId } : {}),
                });
              }}
              disabled={!socket?.connected}
            />
          ) : (
            /* Send button */
            <button
              type="submit"
              disabled={(!content.trim() && !imageFile) || uploading}
              className="w-10 h-10 rounded-full bg-accent text-accent-dark flex items-center justify-center transition-all hover:bg-accent-hover disabled:opacity-50 disabled:grayscale shrink-0"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-accent-dark border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          )}
        </form>
      </div>

      {/* ── Chat Info Panel ── */}
      {showInfo && activeChat && (
        <ChatInfoPanel
          chat={activeChat}
          onClose={() => setShowInfo(false)}
        />
      )}
    </main>
  );
}
