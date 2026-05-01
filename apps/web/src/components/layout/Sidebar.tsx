'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { api } from '@/lib/api';
import type { Chat, User } from '@messenger/shared';

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const { chats, setChats, activeChatId, setActiveChat } = useChatStore();

  useEffect(() => {
    const fetchChats = async () => {
      const result = await api.get<Chat[]>('/chats');
      if (result.data) setChats(result.data);
    };
    if (user) fetchChats();
  }, [user, setChats]);

  // Хелпер для получения имени чата (если DIRECT — имя собеседника)
  const getChatName = (chat: any) => {
    if (chat.type === 'DIRECT') {
      const otherMember = chat.members.find((m: any) => m.userId !== user?.id);
      return otherMember?.user.username || 'Direct Chat';
    }
    return chat.name || 'Group Chat';
  };

  return (
    <aside className="flex flex-col w-sidebar bg-secondary border-r border-border shrink-0">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">Chats</h2>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-elevated hover:text-text-primary transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-hint" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search chats..." className="w-full rounded-lg bg-elevated border-0 pl-9 pr-3 py-2 text-sm text-text-primary placeholder-text-hint outline-none focus:ring-1 focus:ring-accent/30" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-hint text-sm opacity-50">
            <p>No chats found</p>
          </div>
        ) : (
          <div className="px-2 space-y-0.5">
            {chats.map((chat: any) => (
              <button
                key={chat.id}
                onClick={() => setActiveChat(chat.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                  activeChatId === chat.id ? 'bg-elevated' : 'hover:bg-elevated/50'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold">
                    {getChatName(chat).charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary truncate">{getChatName(chat)}</span>
                    {chat.messages?.[0] && (
                      <span className="text-[10px] text-text-hint shrink-0">
                        {new Date(chat.messages[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate">
                    {chat.messages?.[0]?.content || 'No messages yet'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold uppercase">
              {user?.username?.charAt(0)}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-2 border-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{user?.username}</p>
            <p className="text-2xs text-text-muted truncate">{user?.status || 'Online'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
