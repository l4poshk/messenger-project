'use client';

// ──────────────────────────────────────────────
// Sidebar — switches between Chats, Contacts,
// Notifications, and Settings panels
// ──────────────────────────────────────────────

import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useUiStore } from '@/store/uiStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useContactStore } from '@/store/contactStore';
import { removeAuthCookie } from '@/lib/cookies';
import { useTheme } from 'next-themes';
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

  const getChatAvatar = useCallback((chat: any) => {
    if (chat.type === 'DIRECT') {
      const otherMember = chat.members?.find((m: any) => m.userId !== user?.id);
      return otherMember?.user?.avatar;
    }
    return chat.avatar;
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
        {activePanel === 'chats' && (
          <ChatListPanel
            chats={chats}
            activeChatId={activeChatId}
            setActiveChat={setActiveChat}
            getChatName={getChatName}
            getChatAvatar={getChatAvatar}
          />
        )}
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

function ChatListPanel({ chats, activeChatId, setActiveChat, getChatName, getChatAvatar }: {
  chats: Chat[];
  activeChatId: string | null;
  setActiveChat: (id: string) => void;
  getChatName: (chat: any) => string;
  getChatAvatar: (chat: any) => string | null;
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
            <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold overflow-hidden">
              {getChatAvatar(chat) ? (
                <img src={getChatAvatar(chat)!} alt={getChatName(chat)} className="w-full h-full object-cover" />
              ) : (
                getChatName(chat).charAt(0).toUpperCase()
              )}
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
  const { contacts, loading, fetchContacts, addContact, removeContact } = useContactStore();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced global search
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const res = await api.get<User[]>(`/users/search?q=${encodeURIComponent(search)}`);
      if (res.data) {
        // Exclude users already in contacts
        const contactIds = new Set(contacts.map((c) => c.id));
        setSearchResults(res.data.filter((u) => !contactIds.has(u.id)));
      }
      setSearching(false);
    }, 300);
    return () => { clearTimeout(timeout); setSearching(false); };
  }, [search, contacts]);

  const handleAdd = async (user: User) => {
    setAddingId(user.id);
    await addContact(user.id);
    setAddingId(null);
    // Remove from search results
    setSearchResults((prev) => prev.filter((u) => u.id !== user.id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-hint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users to add..."
            className="w-full pl-9 pr-3 py-2 bg-elevated rounded-lg text-sm text-text-primary placeholder:text-text-hint outline-none focus:ring-1 focus:ring-accent transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* Search results */}
        {search.trim() && (
          <div className="px-2 pt-2">
            <p className="text-[10px] font-semibold text-text-hint uppercase tracking-wider px-3 pb-1.5">
              Search Results
            </p>
            {searching && (
              <div className="flex items-center justify-center py-4 text-text-hint text-sm">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
                Searching...
              </div>
            )}
            {!searching && searchResults.length === 0 && (
              <p className="text-center text-text-hint text-xs py-4">No users found</p>
            )}
            {searchResults.map((user) => (
              <div key={user.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-elevated/50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold uppercase shrink-0">
                  {user.username.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{user.username}</p>
                  <p className="text-xs text-text-muted truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => handleAdd(user)}
                  disabled={addingId === user.id}
                  className="px-3 py-1.5 rounded-lg bg-accent text-accent-dark text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 shrink-0"
                >
                  {addingId === user.id ? '...' : '+ Add'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* My contacts */}
        <div className="px-2 pt-2">
          <p className="text-[10px] font-semibold text-text-hint uppercase tracking-wider px-3 pb-1.5">
            My Contacts ({contacts.length})
          </p>

          {loading && contacts.length === 0 && (
            <div className="flex items-center justify-center h-24 text-text-hint text-sm">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
              Loading...
            </div>
          )}

          {!loading && contacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-text-hint text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-accent/5 flex items-center justify-center mb-3 text-accent/40">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </div>
              <p className="text-sm font-medium text-text-muted mb-1">No contacts yet</p>
              <p className="text-xs">Search above to add people</p>
            </div>
          )}

          {contacts.map((contact) => {
            const isOnline = contact.status === 'ONLINE' ||
              (contact.lastSeen && Date.now() - new Date(contact.lastSeen).getTime() < 5 * 60 * 1000);

            return (
              <div
                key={contact.id}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-elevated/50 transition-colors"
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs uppercase">
                    {contact.username?.charAt(0) || '?'}
                  </div>
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-secondary ${
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
                <button
                  onClick={() => removeContact(contact.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-hint hover:text-danger transition-all p-1 shrink-0"
                  title="Remove contact"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>
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
  const setUser = useAuthStore((s) => s.setUser);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState(user?.status || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  // Sync when user changes
  useEffect(() => {
    setUsername(user?.username || '');
    setStatus(user?.status || '');
  }, [user?.username, user?.status]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch<User>('/users/me', {
        username: username.trim() || user?.username,
        status: status.trim(),
      });
      if (res.data) {
        setUser(res.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('[Settings] Save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post<User>('/upload/avatar', formData);
      if (res.data) {
        setUser(res.data);
      }
    } catch (err) {
      console.error('[Settings] Avatar upload failed', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopyId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken });
    }
    logout();
    removeAuthCookie();
    window.location.href = '/login';
  };

  const hasChanges = username !== (user?.username || '') || status !== (user?.status || '');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-5">
        {/* ── Profile Header ── */}
        <div className="flex flex-col items-center py-6 px-4 rounded-2xl bg-elevated">
          <div
            onClick={handleAvatarClick}
            className="group relative w-20 h-20 rounded-full cursor-pointer overflow-hidden shadow-lg mb-4"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-white text-3xl font-bold uppercase">
                {user?.username?.charAt(0) || '?'}
              </div>
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>

            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-lg font-semibold text-text-primary">{user?.username}</p>
          <p className="text-xs text-text-muted mt-0.5">{user?.email || 'No email'}</p>
          {user?.status && (
            <span className="mt-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
              {user.status}
            </span>
          )}
        </div>

        {/* ── Edit Profile ── */}
        <div className="space-y-1">
          <p className="text-[11px] text-text-hint uppercase font-semibold tracking-wider px-3">Edit Profile</p>

          <div className="px-3 pt-2 space-y-3">
            {/* Username */}
            <div>
              <label className="text-xs text-text-muted font-medium mb-1 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 bg-primary rounded-lg text-sm text-text-primary border border-border outline-none focus:ring-1 focus:ring-accent transition-all"
                placeholder="Your username"
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-text-muted font-medium mb-1 block">Status</label>
              <input
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-primary rounded-lg text-sm text-text-primary border border-border outline-none focus:ring-1 focus:ring-accent transition-all"
                placeholder="What's on your mind?"
                maxLength={100}
              />
            </div>

            {/* Save button */}
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-lg bg-accent text-accent-dark text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}
              </button>
            )}
            {saved && !hasChanges && (
              <p className="text-center text-accent text-xs font-medium animate-fade-in">✓ Profile updated</p>
            )}
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="space-y-1">
          <p className="text-[11px] text-text-hint uppercase font-semibold tracking-wider px-3">Appearance</p>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-elevated transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center text-text-muted">
                {mounted && resolvedTheme === 'dark' ? (
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
              mounted && resolvedTheme === 'dark' ? 'bg-accent' : 'bg-text-hint/30'
            }`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                mounted && resolvedTheme === 'dark' ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </div>
          </button>
        </div>

        {/* ── Account Info ── */}
        <div className="space-y-1">
          <p className="text-[11px] text-text-hint uppercase font-semibold tracking-wider px-3">Account Info</p>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">User ID</span>
              <div className="flex items-center gap-2 max-w-[160px]">
                <span className="text-text-hint font-mono truncate">{user?.id}</span>
                <button
                  onClick={handleCopyId}
                  className={`p-1 rounded transition-colors ${copied ? 'text-accent' : 'text-text-hint hover:text-text-primary hover:bg-elevated'}`}
                  title="Copy ID"
                >
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Joined</span>
              <span className="text-text-hint">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Logout (fixed at bottom) ── */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger font-medium text-sm transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </button>
      </div>
    </div>
  );
}
