'use client';

// ──────────────────────────────────────────────
// Home page — 3-panel messenger layout
// ──────────────────────────────────────────────

import { useEffect } from 'react';
import IconNav from '@/components/layout/IconNav';
import Sidebar from '@/components/layout/Sidebar';
import ChatArea from '@/components/layout/ChatArea';
import ToastContainer from '../components/layout/ToastContainer';
import NewChatModal from '@/components/modals/NewChatModal';
import CallModal from '@/components/call/CallModal';
import { useSocketStore } from '@/store/socketStore';
import { useChatStore } from '@/store/chatStore';

export default function HomePage() {
  const activeChatId = useChatStore((s) => s.activeChatId);

  useEffect(() => {
    useSocketStore.getState().connect();
    return () => {
      useSocketStore.getState().disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-primary">
      {/* Panel 1 & 2: Icon Nav + Sidebar */}
      {/* On mobile: visible only if NO chat is selected */}
      <div className={`flex h-full shrink-0 ${activeChatId ? 'hidden md:flex' : 'flex flex-1 md:flex-none md:w-auto'}`}>
        <IconNav />
        <Sidebar />
      </div>

      {/* Panel 3: Chat Area */}
      {/* On mobile: visible only if A chat is selected */}
      <div className={`flex-1 h-full min-w-0 ${activeChatId ? 'flex' : 'hidden md:flex'}`}>
        <ChatArea />
      </div>

      {/* Global Overlays */}
      <NewChatModal />
      <CallModal />
      <ToastContainer />
    </div>
  );
}
