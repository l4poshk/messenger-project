'use client';

// ──────────────────────────────────────────────
// Icon Nav Bar — leftmost narrow panel (56px)
// All buttons are now wired to real functionality
// ──────────────────────────────────────────────

import { useAuthStore } from '@/store/authStore';
import { useUiStore, type ActivePanel } from '@/store/uiStore';
import { useNotificationStore } from '@/store/notificationStore';
import { removeAuthCookie } from '@/lib/cookies';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function IconNav() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const logout = useAuthStore((s) => s.logout);
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  const handleLogout = async () => {
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken });
    }
    logout();
    removeAuthCookie();
    router.push('/login');
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <nav className="flex flex-col items-center w-nav bg-tertiary border-r border-border py-4 gap-2">
      {/* ── App logo ── */}
      <button
        id="nav-home"
        onClick={() => setActivePanel('chats')}
        className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center
                   hover:bg-accent/20 transition-colors mb-4"
        title="Home"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent">
          <path
            d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── Divider ── */}
      <div className="w-8 h-px bg-border mb-2" />

      {/* ── Nav items ── */}
      <NavButton id="nav-chats" icon="chats" label="Chats" active={activePanel === 'chats'} onClick={() => setActivePanel('chats')} />
      <NavButton id="nav-contacts" icon="contacts" label="Contacts" active={activePanel === 'contacts'} onClick={() => setActivePanel('contacts')} />
      <NavButton id="nav-notifications" icon="notifications" label="Notifications" active={activePanel === 'notifications'} onClick={() => setActivePanel('notifications')} badge={unreadCount} />

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Bottom actions ── */}
      <NavButton
        id="nav-theme"
        icon={mounted && resolvedTheme === 'dark' ? 'theme' : 'moon'}
        label={`Switch to ${mounted && resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        onClick={toggleTheme}
      />
      <NavButton id="nav-settings" icon="settings" label="Settings" active={activePanel === 'settings'} onClick={() => setActivePanel('settings')} />

      {/* ── Avatar → Profile / Settings ── */}
      <button
        id="nav-user"
        onClick={() => setActivePanel('settings')}
        className={`w-9 h-9 rounded-full flex items-center justify-center
                   text-xs font-bold uppercase mt-2 transition-colors overflow-hidden ${
          activePanel === 'settings'
            ? 'bg-accent text-accent-dark ring-2 ring-accent/30'
            : 'bg-accent/20 text-accent hover:bg-accent/30'
        }`}
        title="Profile & Settings"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          user?.username?.charAt(0) || '?'
        )}
      </button>
    </nav>
  );
}

// ── Nav Button Component ──

function NavButton({
  id,
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  id: string;
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  const icons: Record<string, React.ReactNode> = {
    chats: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
    contacts: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    notifications: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
    theme: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
    moon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
      </svg>
    ),
    settings: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  };

  return (
    <button
      id={id}
      onClick={onClick}
      className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors
        ${active
          ? 'bg-elevated text-accent'
          : 'text-text-muted hover:bg-elevated hover:text-text-primary'
        }`}
      title={label}
    >
      {icons[icon]}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
