'use client';

// ──────────────────────────────────────────────
// New Chat Modal — поиск пользователей, создание
// DIRECT / GROUP / SUPERGROUP чатов
// ──────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chatStore';
import { useUiStore } from '@/store/uiStore';
import type { User, Chat } from '@messenger/shared';

type ChatMode = 'direct' | 'group' | 'supergroup';

export default function NewChatModal() {
  const activeModal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const setChats = useChatStore((s) => s.setChats);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const chats = useChatStore((s) => s.chats);

  const [mode, setMode] = useState<ChatMode>('direct');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const isOpen = activeModal === 'create-chat' || activeModal === 'create-group';

  // Сбрасываем при открытии
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setResults([]);
      setSelected([]);
      setGroupName('');
      setError('');
      if (activeModal === 'create-group') setMode('group');
      else setMode('direct');
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, activeModal]);

  // Поиск пользователей
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      const res = await api.get<User[]>(`/users/search?q=${encodeURIComponent(search)}`);
      if (res.data) setResults(res.data);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const toggleSelect = (user: User) => {
    if (mode === 'direct') {
      setSelected([user]);
    } else {
      setSelected((prev) =>
        prev.find((u) => u.id === user.id)
          ? prev.filter((u) => u.id !== user.id)
          : [...prev, user]
      );
    }
  };

  const handleCreate = async () => {
    if (selected.length === 0) { setError('Select at least one user'); return; }
    if (mode !== 'direct' && !groupName.trim()) { setError('Enter a group name'); return; }

    setLoading(true);
    setError('');

    const res = await api.post<any>('/chats', {
      type: mode === 'direct' ? 'DIRECT' : mode === 'group' ? 'GROUP' : 'SUPERGROUP',
      memberIds: selected.map((u) => u.id),
      name: mode === 'direct' ? undefined : groupName.trim()
    });

    setLoading(false);

    if (res.error) { setError(res.error); return; }

    if (res.data) {
      // Обновляем список чатов
      const existing = chats.find((c) => c.id === res.data.id);
      if (!existing) {
        setChats([res.data, ...chats]);
      }
      setActiveChat(res.data.id);
      closeModal();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeModal}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-secondary border border-border rounded-2xl shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">New Conversation</h2>
          <button onClick={closeModal} className="text-text-muted hover:text-text-primary transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex px-6 pt-4 gap-2">
          {(['direct', 'group', 'supergroup'] as ChatMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setSelected([]); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-accent text-accent-dark'
                  : 'bg-elevated text-text-muted hover:text-text-primary'
              }`}
            >
              {m === 'direct' ? 'Direct' : m === 'group' ? 'Group' : 'Supergroup'}
            </button>
          ))}
        </div>

        {/* Group name input */}
        {mode !== 'direct' && (
          <div className="px-6 pt-3">
            <input
              type="text"
              placeholder={mode === 'supergroup' ? 'Supergroup name...' : 'Group name...'}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="input-field"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-6 pt-3">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search users by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
          />
        </div>

        {/* Selected users pills */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 px-6 pt-3">
            {selected.map((u) => (
              <span
                key={u.id}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium"
              >
                {u.username}
                <button onClick={() => toggleSelect(u)} className="hover:text-danger">×</button>
              </span>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="px-6 pt-3 pb-4 max-h-60 overflow-y-auto no-scrollbar">
          {results.length === 0 && search.trim() && (
            <p className="text-center text-text-hint text-sm py-4">No users found</p>
          )}
          {results.map((user) => {
            const isSelected = selected.some((u) => u.id === user.id);
            return (
              <button
                key={user.id}
                onClick={() => toggleSelect(user)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-elevated'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold uppercase">
                  {user.username.charAt(0)}
                </div>
                <span className="text-sm text-text-primary font-medium">{user.username}</span>
                {isSelected && (
                  <svg className="ml-auto text-accent" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pb-2">
            <p className="text-danger text-xs animate-fade-in">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={handleCreate}
            disabled={loading || selected.length === 0}
            className="btn-primary"
          >
            {loading ? 'Creating...' : mode === 'direct' ? 'Start Chat' : `Create ${mode === 'supergroup' ? 'Supergroup' : 'Group'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
