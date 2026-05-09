'use client';
import { useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useContactStore } from '@/store/contactStore';
import { api } from '@/lib/api';
import type { Chat } from '@messenger/shared';

interface ChatInfoPanelProps {
  chat: Chat;
  onClose: () => void;
}

export default function ChatInfoPanel({ chat, onClose }: ChatInfoPanelProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const updateChat = useChatStore((s) => s.updateChat);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(chat.name || '');
  const [editDescription, setEditDescription] = useState((chat as any).description || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  
  const contacts = useContactStore((s) => s.contacts);
  const fetchContacts = useContactStore((s) => s.fetchContacts);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getChatName = () => {
    if (chat.type === 'DIRECT') {
      const other = (chat as any).members?.find((m: any) => m.userId !== currentUserId);
      return other?.user?.username || 'Direct Chat';
    }
    return chat.name || 'Group Chat';
  };

  const getChatAvatar = () => {
    if (chat.type === 'DIRECT') {
      const other = (chat as any).members?.find((m: any) => m.userId !== currentUserId);
      return other?.user?.avatar;
    }
    return (chat as any).avatar;
  };

  const handleLeaveChat = async () => {
    if (!confirm('Are you sure you want to leave this chat?')) return;
    try {
      const res = await api.delete(`/chats/${chat.id}/members/${currentUserId}`);
      if (res.data) {
        onClose();
        window.location.reload();
      }
    } catch (err) {
      console.error('[ChatInfo] Failed to leave:', err);
    }
  };

  const handleKick = async (targetUserId: string) => {
    if (!confirm('Are you sure you want to kick this user?')) return;
    try {
      const res = await api.delete(`/chats/${chat.id}/members/${targetUserId}`);
      if (res.data) {
        const updatedChat = {
          ...chat,
          members: (chat as any).members.filter((m: any) => m.userId !== targetUserId),
        };
        updateChat(updatedChat as any);
      }
    } catch (err) {
      console.error('[ChatInfo] Kick failed:', err);
    }
  };

  const handlePromote = async (targetUserId: string) => {
    try {
      const res = await api.patch(`/chats/${chat.id}/members/${targetUserId}/promote`);
      if (res.data) {
        const updatedChat = {
          ...chat,
          members: (chat as any).members.map((m: any) =>
            m.userId === targetUserId ? { ...m, role: 'ADMIN' } : m
          ),
        };
        updateChat(updatedChat as any);
      }
    } catch (err) {
      console.error('[ChatInfo] Promote failed:', err);
    }
  };

  const handleDemote = async (targetUserId: string) => {
    if (!confirm('Are you sure you want to demote this admin?')) return;
    try {
      const res = await api.patch(`/chats/${chat.id}/members/${targetUserId}/demote`);
      if (res.data) {
        const updatedChat = {
          ...chat,
          members: (chat as any).members.map((m: any) =>
            m.userId === targetUserId ? { ...m, role: 'MEMBER' } : m
          ),
        };
        updateChat(updatedChat as any);
      }
    } catch (err) {
      console.error('[ChatInfo] Demote failed:', err);
    }
  };

  const handleSaveMeta = async () => {
    setSaving(true);
    try {
      const res = await api.patch<Chat>(`/chats/${chat.id}`, {
        name: editName.trim() || undefined,
        description: editDescription.trim() || null
      });
      if (res.data) {
        updateChat(res.data);
        setIsEditing(false);
      }
    } catch (err) {
      console.error('[ChatInfo] Failed to save meta:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    if ((myRole === 'CREATOR' || myRole === 'ADMIN') && isEditing) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post<Chat>(`/upload/chat-avatar/${chat.id}`, formData);
      if (res.data) {
        updateChat(res.data);
      }
    } catch (err) {
      console.error('[ChatInfo] Avatar upload failed:', err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAddMember = async (targetUserId: string) => {
    try {
      const res = await api.post(`/chats/${chat.id}/members`, { userId: targetUserId });
      if (res.data) {
        const updatedChat = {
          ...chat,
          members: [...(chat as any).members, res.data],
        };
        updateChat(updatedChat as any);
        setIsAddingMember(false);
      }
    } catch (err) {
      console.error('[ChatInfo] Add member failed:', err);
    }
  };

  const myRole = (chat as any).members?.find((m: any) => m.userId === currentUserId)?.role;
  const canModerate = myRole === 'CREATOR' || myRole === 'ADMIN';

  // Filter contacts not already in chat
  const availableContacts = contacts.filter(c => 
    !(chat as any).members?.some((m: any) => m.userId === c.id) &&
    c.username.toLowerCase().includes(searchContact.toLowerCase())
  );

  return (
    <div className="absolute top-0 right-0 w-full md:w-80 h-full bg-secondary border-l border-border shadow-2xl flex flex-col z-50 animate-slide-right">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-primary/50">
        <h3 className="font-semibold text-text-primary text-sm">
          {isAddingMember ? 'Add Members' : 'Chat Info'}
        </h3>
        <div className="flex items-center gap-1">
          {isAddingMember && (
            <button
              onClick={() => setIsAddingMember(false)}
              className="p-2 text-text-hint hover:text-text-primary transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-elevated hover:text-text-primary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-6">
        {isAddingMember ? (
          <div className="px-4 space-y-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-hint" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchContact}
                onChange={(e) => setSearchContact(e.target.value)}
                className="w-full rounded-lg bg-elevated border-0 pl-9 pr-3 py-2 text-sm text-text-primary placeholder-text-hint outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>

            <div className="space-y-1">
              {availableContacts.length === 0 ? (
                <p className="text-center py-10 text-xs text-text-hint">No contacts available to add</p>
              ) : (
                availableContacts.map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => handleAddMember(contact.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-bold uppercase overflow-hidden">
                      {contact.avatar ? (
                        <img src={contact.avatar} alt={contact.username} className="w-full h-full object-cover" />
                      ) : (
                        contact.username.charAt(0)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate text-sm">{contact.username}</p>
                      <p className="text-[10px] text-text-hint truncate">{contact.email}</p>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Chat Overview */}
            <div className="flex flex-col items-center px-6 mb-8 text-center relative group/overview">
              {canModerate && chat.type !== 'DIRECT' && (
                <button
                  onClick={() => {
                    if (isEditing) handleSaveMeta();
                    else setIsEditing(true);
                  }}
                  disabled={saving}
                  className="absolute top-0 right-6 p-2 rounded-lg bg-elevated text-text-hint hover:text-accent transition-colors"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  ) : isEditing ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  )}
                </button>
              )}

              <div
                onClick={handleAvatarClick}
                className={`w-24 h-24 rounded-3xl bg-accent/10 flex items-center justify-center text-accent text-3xl font-bold uppercase mb-4 shadow-sm overflow-hidden relative ${canModerate && isEditing ? 'cursor-pointer hover:opacity-80' : ''
                  }`}
              >
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {getChatAvatar() ? (
                  <img src={getChatAvatar()} alt={getChatName()} className="w-full h-full object-cover" />
                ) : (
                  getChatName().charAt(0)
                )}
                {canModerate && isEditing && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Change
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              {isEditing ? (
                <div className="w-full space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-elevated rounded-lg text-sm text-center font-semibold text-text-primary outline-none focus:ring-1 focus:ring-accent"
                    placeholder="Chat Name"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-elevated rounded-lg text-xs text-center text-text-muted outline-none focus:ring-1 focus:ring-accent resize-none min-h-[60px]"
                    placeholder="Description (optional)"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditName(chat.name || '');
                        setEditDescription((chat as any).description || '');
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-elevated text-text-muted text-[11px] font-medium hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveMeta}
                      disabled={saving || !editName.trim()}
                      className="flex-1 py-1.5 rounded-lg bg-accent text-accent-dark text-[11px] font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h4 className="text-lg font-semibold text-text-primary">{getChatName()}</h4>
                  <p className="text-xs text-text-muted mt-1 px-4 leading-relaxed line-clamp-3">
                    {(chat as any).description || (chat.type === 'DIRECT' ? 'Direct Message' : 'No description')}
                  </p>
                  <p className="text-[10px] text-text-hint mt-2 uppercase tracking-widest font-bold opacity-50">
                    {chat.type === 'DIRECT' ? '' : `${(chat as any).members?.length || 0} members`}
                  </p>
                </>
              )}
            </div>

            {/* Participants List */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-6 pb-2">
                <p className="text-[11px] text-text-hint uppercase font-semibold tracking-wider">
                  Participants
                </p>
                {canModerate && chat.type !== 'DIRECT' && (
                  <button
                    onClick={() => {
                      fetchContacts();
                      setIsAddingMember(true);
                    }}
                    className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    ADD
                  </button>
                )}
              </div>
              <div className="px-2">
            {(chat as any).members?.map((member: any) => {
              const u = member.user;
              const isOnline = u.status === 'ONLINE' || (u.lastSeen && Date.now() - new Date(u.lastSeen).getTime() < 5 * 60 * 1000);
              const isMe = u.id === currentUserId;

              return (
                <div key={u.id} className="group flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-elevated/50 transition-colors">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs uppercase overflow-hidden">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                      ) : (
                        u.username?.charAt(0) || '?'
                      )}
                    </div>
                    {!isMe && (
                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-secondary ${isOnline ? 'bg-accent' : 'bg-text-hint'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {u.username}
                        {isMe && <span className="text-text-hint ml-1 font-normal">(You)</span>}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted truncate">
                      {isOnline ? 'Online' : u.lastSeen ? `last seen ${new Date(u.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline'}
                    </p>
                  </div>
                  {member.role === 'CREATOR' && (
                    <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded uppercase">Creator</span>
                  )}
                  {member.role === 'ADMIN' && (
                    <span className="text-[9px] font-bold text-info bg-info/10 px-1.5 py-0.5 rounded uppercase">Admin</span>
                  )}

                  {/* Moderation Actions */}
                  {!isMe && canModerate && member.role !== 'CREATOR' && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      {myRole === 'CREATOR' && member.role === 'MEMBER' && (
                        <button
                          onClick={() => handlePromote(u.id)}
                          className="p-1.5 rounded-lg text-text-hint hover:text-info hover:bg-info/10 transition-colors"
                          title="Promote to Admin"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 19l7-7-7-7" /><path d="M5 19l7-7-7-7" />
                          </svg>
                        </button>
                      )}
                      {myRole === 'CREATOR' && member.role === 'ADMIN' && (
                        <button
                          onClick={() => handleDemote(u.id)}
                          className="p-1.5 rounded-lg text-text-hint hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Demote to Member"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" />
                          </svg>
                        </button>
                      )}
                      {(myRole === 'CREATOR' || (myRole === 'ADMIN' && member.role === 'MEMBER')) && (
                        <button
                          onClick={() => handleKick(u.id)}
                          className="p-1.5 rounded-lg text-text-hint hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Kick Member"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </>
      )}
    </div>

    {/* Footer Actions */}
      <div className="px-4 py-4 border-t border-border">
        <button
          onClick={handleLeaveChat}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger font-medium text-sm transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Leave Chat
        </button>
      </div>
    </div>
  );
}
