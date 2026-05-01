'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useMessageStore } from '@/store/messageStore';
import { useSocketStore } from '@/store/socketStore';
import { api } from '@/lib/api';
import TopicBar from '@/components/chat/TopicBar';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      console.warn('[Chat] Empty message, ignoring');
      return;
    }
    if (!activeChatId) {
      console.error('[Chat] No active chat selected');
      return;
    }
    if (!socket) {
      console.error('[Chat] Socket is null! Is it connected?', useSocketStore.getState().isConnected);
      return;
    }
    if (!socket.connected) {
      console.error('[Chat] Socket exists but NOT connected. State:', socket.disconnected);
      return;
    }

    try {
      const payload = {
        chatId: activeChatId,
        content: content.trim(),
        type: 'TEXT' as const,
        ...(activeTopicId ? { topicId: activeTopicId } : {})
      };
      console.log('[Chat] 📤 Sending message:', payload);
      socket.emit('message:send', payload);
      setContent('');
      socket.emit('typing:stop', activeChatId);
    } catch (err) {
      console.error('[Chat] Failed to send message:', err);
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
        <div className="flex items-center gap-3 flex-1">
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
                {(activeChat as any)?.members?.length || 0} members
              </p>
            )}
          </div>
        </div>
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
                  <div className={`px-4 py-2 rounded-2xl text-sm ${
                    isOwn
                      ? 'bg-msg-outgoing text-msg-outgoing-text rounded-tr-none'
                      : 'bg-elevated text-text-primary rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                  <div className={`text-[9px] text-text-hint mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-primary">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeTopicId ? `Message in #topic...` : 'Type a message...'}
            className="flex-1 bg-elevated border-0 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-hint outline-none focus:ring-1 focus:ring-accent/30"
          />
          <button
            type="submit"
            disabled={!content.trim()}
            className="w-10 h-10 rounded-full bg-accent text-accent-dark flex items-center justify-center transition-all hover:bg-accent-hover disabled:opacity-50 disabled:grayscale"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </main>
  );
}
