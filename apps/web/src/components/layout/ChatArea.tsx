'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useMessageStore } from '@/store/messageStore';
import { useSocketStore } from '@/store/socketStore';
import { useCallStore } from '@/store/callStore';
import { api } from '@/lib/api';
import MessageItem from '@/components/chat/MessageItem';
import TopicBar from '@/components/chat/TopicBar';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import ChatInfoPanel from '../chat/ChatInfoPanel';
import type { Message, Topic } from '@messenger/shared';
import { MessageType } from '@messenger/shared';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filePreview, setFilePreview] = useState<{ url: string; type: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);

  const isSupergroup = (activeChat as any)?.type === 'SUPERGROUP';
  const myMembership = (activeChat as any)?.members?.find(
    (m: any) => m.userId === userId
  );
  const canManageTopics = myMembership?.role === 'CREATOR' || myMembership?.role === 'ADMIN';

  // ── Handle Message Actions ──
  useEffect(() => {
    (window as any).onMessageAction = (message: Message, action: string) => {
      if (action === 'edit') {
        setEditingMessage(message);
        setContent(message.content || '');
      } else if (action === 'forward') {
        setForwardingMessage(message);
      } else if (action === 'delete_for_me') {
        socket?.emit('message:delete', { messageId: message.id, type: 'FOR_ME' });
      } else if (action === 'delete_for_all') {
        socket?.emit('message:delete', { messageId: message.id, type: 'FOR_EVERYONE' });
      }
    };
    return () => { delete (window as any).onMessageAction; };
  }, [socket]);

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
      socket.emit('message:read', { chatId: activeChatId });
    }

    return () => { cancelled = true; };
  }, [activeChatId, activeTopicId, socket]);

  // ── Mark as read on new message ──
  useEffect(() => {
    if (socket && activeChatId && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.senderId !== userId && !lastMsg.isRead) {
        socket.emit('message:read', { chatId: activeChatId });
      }
    }
  }, [messages.length, activeChatId, socket, userId]);

  // ── Cleanup typing when leaving/switching ──
  useEffect(() => {
    return () => {
      if (socket && activeChatId) {
        socket.emit('chat:typing', { chatId: activeChatId, isTyping: false });
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [activeChatId, socket]);

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

  const getChatAvatar = () => {
    const chat = activeChat as any;
    if (!chat) return null;
    if (chat.type === 'DIRECT') {
      const other = chat.members?.find((m: any) => m.userId !== userId);
      return other?.user?.avatar;
    }
    return chat.avatar;
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
    if (diff < 60000) return 'just now';
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `today at ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;
    return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      alert('Only images and videos are supported currently');
      return;
    }
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFilePreview({
        url: ev.target?.result as string,
        type: isImage ? 'IMAGE' : 'VIDEO'
      });
    };
    reader.readAsDataURL(file);
  };

  const clearPreview = () => {
    setFilePreview(null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = content.trim().length > 0;
    const hasFile = !!pendingFile;

    if (!hasText && !hasFile && !editingMessage) return;
    if (!activeChatId) return;

    if (editingMessage) {
      socket?.emit('message:edit', { messageId: editingMessage.id, content: content.trim() });
      setEditingMessage(null);
      setContent('');
      return;
    }

    if (hasFile) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', pendingFile!);
        formData.append('content', content.trim());
        formData.append('type', filePreview?.type || 'IMAGE');
        if (activeTopicId) formData.append('topicId', activeTopicId);

        const res = await api.post<Message>(`/chats/${activeChatId}/messages`, formData);
        if (res.data) {
          useMessageStore.getState().addMessage(res.data);
          setContent('');
          clearPreview();
        }
      } catch (err) {
        console.error('[Chat] Upload failed:', err);
      } finally {
        setUploading(false);
      }
    } else {
      const optimisticMsg: Message = {
        id: `temp-${Date.now()}`,
        chatId: activeChatId,
        senderId: userId!,
        content: content.trim(),
        type: MessageType.TEXT,
        isRead: false,
        isEdited: false,
        isForwarded: false,
        originalSenderName: null,
        hiddenFor: [],
        createdAt: new Date().toISOString(),
        editedAt: null,
        fileUrl: null,
        fileName: null,
        fileSize: null,
        duration: null,
        waveform: null,
        topicId: activeTopicId,
        replyToId: null,
        sender: useAuthStore.getState().user as any,
      };
      useMessageStore.getState().addMessage(optimisticMsg);

      if (!socket || !socket.connected) return;
      socket.emit('message:send', {
        chatId: activeChatId,
        content: content.trim(),
        type: 'TEXT',
        ...(activeTopicId ? { topicId: activeTopicId } : {}),
      });
      setContent('');
      socket.emit('chat:typing', { chatId: activeChatId, isTyping: false });
    }
  };

  const handleForward = (targetChatId: string) => {
    if (!forwardingMessage || !socket) return;
    
    socket.emit('message:send', {
      chatId: targetChatId,
      content: forwardingMessage.content,
      type: forwardingMessage.type,
      fileUrl: forwardingMessage.fileUrl,
      isForwarded: true,
      originalSenderName: forwardingMessage.isForwarded 
        ? forwardingMessage.originalSenderName 
        : forwardingMessage.sender?.username
    });
    
    setForwardingMessage(null);
  };

  const handleKeyDown = () => {
    if (!socket || !activeChatId) return;
    socket.emit('chat:typing', { chatId: activeChatId, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:typing', { chatId: activeChatId, isTyping: false });
    }, 2000);
  };

  if (!activeChatId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-primary p-8 text-center overflow-hidden">
        <div className="relative w-48 h-48 flex items-center justify-center mb-6">
          {/* Forced Center Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent/20 blur-[70px] rounded-full pointer-events-none" />
          
          <div className="relative w-28 h-28 rounded-[2.8rem] bg-elevated border border-white/10 flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.3)]">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="text-3xl font-black text-text-primary mb-3 tracking-tight">Welcome back!</h2>
          <p className="text-base text-text-muted max-w-[300px] leading-relaxed opacity-70 mx-auto">
            Select a conversation from the sidebar to start messaging your friends.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-primary min-w-0">
      <header className="h-14 border-b border-border flex items-center px-4 shrink-0 bg-primary/80 backdrop-blur-sm z-10">
        {/* Back Button (Mobile only) */}
        <button
          onClick={() => useChatStore.getState().setActiveChat(null as any)}
          className="mr-2 p-2 -ml-2 text-text-muted hover:text-text-primary md:hidden"
          title="Back to chats"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div
          onClick={() => setShowInfo(!showInfo)}
          className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold uppercase overflow-hidden">
            {getChatAvatar() ? (
              <img src={getChatAvatar()} alt={getChatDisplayName()} className="w-full h-full object-cover" />
            ) : (
              getChatDisplayName().charAt(0)
            )}
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
        <div className="flex items-center ml-4">
          <button onClick={() => useCallStore.getState().setOutgoingCall(activeChatId!, 'audio')} className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 transition-colors shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </button>
          <button onClick={() => useCallStore.getState().setOutgoingCall(activeChatId!, 'video')} className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 transition-colors shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          </button>
        </div>
      </header>

      {isSupergroup && (
        <TopicBar
          chatId={activeChatId}
          topics={topics}
          activeTopicId={activeTopicId}
          onSelectTopic={setActiveTopicId}
          onTopicCreated={(topic: Topic) => setTopics((prev) => [...prev, topic])}
          canManage={canManageTopics}
        />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-hint text-sm">
            No messages yet. Say hello! 👋
          </div>
        )}
        {messages.map((msg, idx) => (
          !msg.hiddenFor?.includes(userId || '') && (
            <MessageItem
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === userId}
              showAvatar={idx === 0 || messages[idx - 1].senderId !== msg.senderId}
              activeChatType={(activeChat as any)?.type}
            />
          )
        ))}
      </div>

      {filePreview && (
        <div className="px-4 py-2 border-t border-border bg-secondary/50">
          <div className="relative inline-block">
            {filePreview.type === 'IMAGE' ? (
              <img src={filePreview.url} alt="Preview" className="h-20 rounded-lg object-cover" />
            ) : (
              <div className="h-20 w-32 rounded-lg bg-black/40 flex items-center justify-center text-white/60">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              </div>
            )}
            <button onClick={clearPreview} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center text-xs hover:bg-red-600 transition-colors">×</button>
          </div>
        </div>
      )}

      {editingMessage && (
        <div className="px-4 py-2 bg-accent/5 border-t border-accent/10 flex items-center justify-between animate-slide-up">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-1 h-8 bg-accent rounded-full" />
            <div className="min-w-0">
              <p className="text-[10px] text-accent font-bold uppercase">Editing Message</p>
              <p className="text-xs text-text-muted truncate">{editingMessage.content}</p>
            </div>
          </div>
          <button onClick={() => { setEditingMessage(null); setContent(''); }} className="p-2 text-text-hint hover:text-danger transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      <div className="px-4 py-3 border-t border-border bg-primary">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          {!isRecordingAudio && (
            <>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-elevated transition-colors shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
              </button>
              <input type="text" value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={handleKeyDown} placeholder={activeTopicId ? 'Message in #topic...' : 'Type a message...'} className="flex-1 bg-elevated border-0 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-hint outline-none focus:ring-1 focus:ring-accent/30" />
            </>
          )}
          
          {!content.trim() && !pendingFile ? (
            <VoiceRecorder 
              onRecordingChange={setIsRecordingAudio}
              onSend={(fileUrl, dur, wf) => {
                if (!activeChatId || !socket?.connected) return;
                socket.emit('message:send', { chatId: activeChatId, content: '', type: 'AUDIO', fileUrl, duration: dur, waveform: wf, ...(activeTopicId ? { topicId: activeTopicId } : {}), });
              }} 
              disabled={!socket?.connected} 
            />
          ) : (
            <button type="submit" disabled={(!content.trim() && !pendingFile) || uploading} className="w-10 h-10 rounded-full bg-accent text-accent-dark flex items-center justify-center transition-all hover:bg-accent-hover disabled:opacity-50 disabled:grayscale shrink-0">
              {uploading ? <div className="w-4 h-4 border-2 border-accent-dark border-t-transparent rounded-full animate-spin" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>}
            </button>
          )}
        </form>
      </div>

      <AnimatePresence>
        {forwardingMessage && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-md bg-elevated border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-text-primary">Forward Message</h3>
                <button onClick={() => setForwardingMessage(null)} className="text-text-hint hover:text-text-primary">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
                {useChatStore.getState().chats.map(chat => {
                  // Resolve name for DIRECT chats
                  let displayName = chat.name || 'Chat';
                  if (chat.type === 'DIRECT') {
                    const other = (chat as any).members?.find((m: any) => m.userId !== userId);
                    displayName = other?.user?.username || 'Chat';
                  }

                  return (
                    <button key={chat.id} onClick={() => handleForward(chat.id)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary truncate">{displayName}</p>
                        <p className="text-[10px] text-text-hint">{chat.type}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showInfo && activeChat && <ChatInfoPanel chat={activeChat} onClose={() => setShowInfo(false)} />}
    </main>
  );
}
