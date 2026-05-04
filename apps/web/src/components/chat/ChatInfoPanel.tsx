'use client';

import { useAuthStore } from '@/store/authStore';
import type { Chat } from '@messenger/shared';

interface ChatInfoPanelProps {
  chat: Chat;
  onClose: () => void;
}

export default function ChatInfoPanel({ chat, onClose }: ChatInfoPanelProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);

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

  const handleLeaveChat = () => {
    console.log('[ChatInfo] Leaving chat:', chat.id);
    // TODO: Implement actual leave logic
  };

  return (
    <div className="absolute top-0 right-0 w-80 h-full bg-secondary border-l border-border shadow-2xl flex flex-col z-50 animate-slide-right">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-primary/50">
        <h3 className="font-semibold text-text-primary text-sm">Chat Info</h3>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-elevated hover:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-6">
        {/* Chat Overview */}
        <div className="flex flex-col items-center px-6 mb-8 text-center">
          <div className="w-24 h-24 rounded-3xl bg-accent/10 flex items-center justify-center text-accent text-3xl font-bold uppercase mb-4 shadow-sm overflow-hidden">
            {getChatAvatar() ? (
              <img src={getChatAvatar()} alt={getChatName()} className="w-full h-full object-cover" />
            ) : (
              getChatName().charAt(0)
            )}
          </div>
          <h4 className="text-lg font-semibold text-text-primary">{getChatName()}</h4>
          <p className="text-sm text-text-hint mt-1">
            {chat.type === 'DIRECT' ? 'Direct Message' : `${(chat as any).members?.length || 0} members`}
          </p>
        </div>

        {/* Participants List */}
        <div className="space-y-1">
          <p className="text-[11px] text-text-hint uppercase font-semibold tracking-wider px-6 pb-2">
            Participants
          </p>
          <div className="px-2">
            {(chat as any).members?.map((member: any) => {
              const u = member.user;
              const isOnline = u.status === 'ONLINE' || (u.lastSeen && Date.now() - new Date(u.lastSeen).getTime() < 5 * 60 * 1000);
              const isMe = u.id === currentUserId;

              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-elevated/50 transition-colors">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs uppercase overflow-hidden">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                      ) : (
                        u.username?.charAt(0) || '?'
                      )}
                    </div>
                    {!isMe && (
                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-secondary ${
                        isOnline ? 'bg-accent' : 'bg-text-hint'
                      }`} />
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
                  {member.role === 'OWNER' && (
                    <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded uppercase">Owner</span>
                  )}
                  {member.role === 'ADMIN' && (
                    <span className="text-[9px] font-bold text-info bg-info/10 px-1.5 py-0.5 rounded uppercase">Admin</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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
