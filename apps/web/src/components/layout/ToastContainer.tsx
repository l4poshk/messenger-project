'use client';

import { useUiStore, Toast } from '@/store/uiStore';
import { useChatStore } from '@/store/chatStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function ToastContainer() {
  const { toasts, removeToast, setActivePanel } = useUiStore();
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const handleToastClick = (toast: Toast) => {
    if (toast.chatId) {
      setActiveChat(toast.chatId);
      setActivePanel('chats');
    }
    removeToast(toast.id);
  };

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none w-full max-w-[320px]">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            onClick={() => handleToastClick(toast)}
            className="pointer-events-auto cursor-pointer group"
          >
            <div className="bg-secondary/90 backdrop-blur-xl border border-border p-4 rounded-2xl shadow-2xl flex items-start gap-3 hover:bg-secondary hover:border-accent/50 transition-all active:scale-95">
              {/* Icon based on type */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                toast.type === 'message' ? 'bg-accent/10 text-accent' :
                toast.type === 'error' ? 'bg-danger/10 text-danger' :
                'bg-info/10 text-info'
              }`}>
                {toast.type === 'message' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                ) : toast.type === 'error' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-text-primary truncate">{toast.title}</h4>
                <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{toast.message}</p>
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="text-text-hint hover:text-text-primary p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
