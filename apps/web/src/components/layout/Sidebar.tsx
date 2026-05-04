'use client';

// ──────────────────────────────────────────────
// Sidebar — switches between Chats, Contacts,
// Notifications, and Settings panels
// ──────────────────────────────────────────────

import { useEffect, useCallback, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useUiStore } from '@/store/uiStore';
import { useNotificationStore } from '@/store/notificationStore';
import { api } from '@/lib/api';
import type { Chat, User } from '@messenger/shared';

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const setChats = useChatStore((s) => s.setChats);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const openModal = useUiStore((s) => s.openModal);
  const activePanel = useUiStore((s) => s.activePanel);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchChats = async () => {
      const result = await api.get<Chat[]>('/chats');
      if (result.data && !cancelled) setChats(result.data);
    };
    fetchChats();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const getChatName = useCallback((chat: any) => {
    if (chat.type === 'DIRECT') {
      const otherMember = chat.members?.find((m: any) => m.userId !== user?.id);
      return otherMember?.user?.username || 'Direct Chat';
    }
    return chat.name || 'Group Chat';
  }, [user?.id]);

  // ── Panel titles ──
  const panelTitles: Record<string, string> = {
    chats: 'Chats',
    contacts: 'Contacts',
    notifications: 'Notifications',
    settings: 'Settings',
  };

  return (
    <aside className="flex flex-col w-sidebar bg-secondary border-r border-border shrink-0">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">{panelTitles[activePanel]}</h2>
        {activePanel === 'chats' && (
          <button
            onClick={() => openModal('create-chat')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-elevated hover:text-text-primary transition-colors"
            title="New chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Search (only in chats & contacts) ── */}
      {(activePanel === 'chats' || activePanel === 'contacts') && (
        <div className="px-3 py-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-hint" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder={`Search ${activePanel}...`} className="w-full rounded-lg bg-elevated border-0 pl-9 pr-3 py-2 text-sm text-text-primary placeholder-text-hint outline-none focus:ring-1 focus:ring-accent/30" />
          </div>
        </div>
      )}

      {/* ── Panel content ── */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {activePanel === 'chats' && <ChatListPanel chats={chats} activeChatId={activeChatId} setActiveChat={setActiveChat} getChatName={getChatName} />}
        {activePanel === 'contacts' && <ContactsPanel userId={user?.id} />}
        {activePanel === 'notifications' && <NotificationsPanel />}
        {activePanel === 'settings' && <SettingsPanel />}
      </div>

      {/* ── Footer user info ── */}
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

// ════════════════════════════════════════════════
//  Panel: Chat List
// ════════════════════════════════════════════════

function ChatListPanel({ chats, activeChatId, setActiveChat, getChatName }: {
  chats: Chat[];
  activeChatId: string | null;
  setActiveChat: (id: string) => void;
  getChatName: (chat: any) => string;
}) {
  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-hint text-sm opacity-50">
        <p>No chats found</p>
      </div>
    );
  }

  return (
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
  );
}

// ════════════════════════════════════════════════
//  Panel: Contacts
// ════════════════════════════════════════════════

function ContactsPanel({ userId }: { userId?: string }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContacts = async () => {
      setLoading(true);
      try {
        const result = await api.get<any[]>('/users');
        if (result.data) {
          // Filter out self
          setContacts(result.data.filter((u: any) => u.id !== userId));
        }
      } catch (err) {
        console.error('[Contacts] Failed to load', err);
      } finally {
        setLoading(false);
      }
    };
    fetchContacts();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-text-hint text-sm">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-hint text-sm opacity-50">
        <p>No contacts found</p>
      </div>
    );
  }

  return (
    <div className="px-2 space-y-0.5">
      {contacts.map((contact) => {
        const isOnline = contact.status === 'ONLINE' ||
          (contact.lastSeen && Date.now() - new Date(contact.lastSeen).getTime() < 5 * 60 * 1000);

        return (
          <div
            key={contact.id}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-elevated/50 transition-colors"
          >
            <div className="relative shrink-0">
              <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold">
                {contact.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-secondary ${
                isOnline ? 'bg-accent' : 'bg-text-hint'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{contact.username}</p>
              <p className="text-xs text-text-muted truncate">
                {isOnline ? 'Online' : contact.lastSeen
                  ? `Last seen ${new Date(contact.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Offline'
                }
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════
//  Panel: Notifications
// ════════════════════════════════════════════════

function NotificationsPanel() {
  const { notifications, unreadCount, loading, fetchNotifications, markAllRead, markRead } =
    useNotificationStore();
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const setActivePanel = useUiStore((s) => s.setActivePanel);

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (n: import('@/store/notificationStore').Notification) => {
    // 1) Navigate to chat
    if (n.chatId) {
      setActiveChat(n.chatId);
    }
    // 2) Mark this notification as read
    if (!n.read) {
      markRead(n.id);
    }
    // 3) Switch panel back to chats
    setActivePanel('chats');
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-text-hint text-sm">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-hint px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/5 flex items-center justify-center mb-4 text-accent/40">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </div>
        <p className="text-sm font-medium text-text-muted mb-1">No notifications</p>
        <p className="text-xs text-text-hint">You're all caught up!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mark all read button */}
      {unreadCount > 0 && (
        <div className="px-3 py-2 border-b border-border shrink-0">
          <button
            onClick={markAllRead}
            className="w-full text-xs text-accent hover:text-accent-hover transition-colors py-1.5 rounded-lg hover:bg-elevated text-center font-medium"
          >
            ✓ Mark all as read ({unreadCount})
          </button>
        </div>
      )}

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-1 space-y-0.5">
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            className={`w-full text-left px-3 py-3 rounded-xl transition-colors cursor-pointer hover:bg-elevated ${
              n.read ? 'opacity-60' : 'bg-elevated/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                n.type === 'message' ? 'bg-accent/10 text-accent' :
                n.type === 'call' ? 'bg-info/10 text-info' :
                'bg-warning/10 text-warning'
              }`}>
                {n.type === 'message' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                ) : n.type === 'call' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">{n.title}</p>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                  )}
                </div>
                <p className="text-xs text-text-muted truncate mt-0.5">{n.body}</p>
                <p className="text-[10px] text-text-hint mt-1">
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
//  Panel: Settings
// ════════════════════════════════════════════════

function SettingsPanel() {
  const user = useAuthStore((s) => s.user);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="px-3 py-4 space-y-4">
      {/* Profile card */}
      <div className="flex items-center gap-4 px-3 py-4 rounded-xl bg-elevated">
        <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xl font-bold uppercase">
          {user?.username?.charAt(0) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-text-primary truncate">{user?.username}</p>
          <p className="text-xs text-text-muted truncate">{user?.email || 'No email'}</p>
          <p className="text-xs text-accent mt-0.5">{user?.status || 'Online'}</p>
        </div>
      </div>

      {/* Theme toggle */}
      <div className="space-y-1">
        <p className="text-[11px] text-text-hint uppercase font-semibold tracking-wider px-3">Appearance</p>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-elevated transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center text-text-muted">
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </div>
            <span className="text-sm text-text-primary">Dark mode</span>
          </div>
          <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${
            theme === 'dark' ? 'bg-accent' : 'bg-text-hint/30'
          }`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              theme === 'dark' ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </div>
        </button>
      </div>

      {/* Account section */}
      <div className="space-y-1">
        <p className="text-[11px] text-text-hint uppercase font-semibold tracking-wider px-3">Account</p>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-danger/10 transition-colors text-danger"
        >
          <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <span className="text-sm font-medium">Log out</span>
        </button>
      </div>
    </div>
  );
}
