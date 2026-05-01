'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useMessageStore } from '@/store/messageStore';
import { api } from '@/lib/api';
import type { Message } from '@messenger/shared';

export default function ChatArea() {
  const user = useAuthStore((s) => s.user);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeChat = useChatStore((s) => s.chats.find(c => c.id === activeChatId));
  const messages = useMessageStore((s) => s.messages[activeChatId || ''] || []);
  const setMessages = useMessageStore((s) => s.setMessages);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeChatId) {
      const fetchMessages = async () => {
        const result = await api.get<Message[]>(`/chats/${activeChatId}/messages`);
        if (result.data) setMessages(activeChatId, result.data);
      };
      fetchMessages();
    }
  }, [activeChatId, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!activeChatId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center text-text-hint bg-primary">
        <div className="w-20 h-20 rounded-3xl bg-accent/5 flex items-center justify-center mb-4 text-accent/40">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-medium text-text-muted mb-1">Select a chat</h2>
        <p className="text-sm text-text-hint">Choose a conversation to start messaging</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-primary min-w-0">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 shrink-0 bg-primary/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
            C
          </div>
          <h3 className="font-semibold text-text-primary text-sm truncate">Chat</h3>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar">
        {messages.map((msg, idx) => {
          const isOwn = msg.senderId === user?.id;
          const showAvatar = idx === 0 || messages[idx - 1].senderId !== msg.senderId;

          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-2 max-w-[70%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isOwn && (
                  <div className="w-8 h-8 shrink-0">
                    {showAvatar ? (
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-[10px] font-bold">
                        {msg.sender?.username?.charAt(0).toUpperCase()}
                      </div>
                    ) : null}
                  </div>
                )}
                <div>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                    isOwn 
                      ? 'bg-msg-outgoing text-msg-outgoing-text rounded-tr-none' 
                      : 'bg-elevated text-text-primary rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                  <div className={`text-[10px] text-text-hint mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Placeholder */}
      <div className="px-4 py-3 border-t border-border bg-primary">
        <div className="bg-elevated rounded-xl px-4 py-3 text-sm text-text-hint">
          Socket.io messaging coming in Step 5...
        </div>
      </div>
    </main>
  );
}
