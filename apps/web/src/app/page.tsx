'use client';

// ──────────────────────────────────────────────
// Home page — 3-panel messenger layout
// Protected by Next.js middleware (redirects to /login)
// ──────────────────────────────────────────────

import { useEffect } from 'react';
import IconNav from '@/components/layout/IconNav';
import Sidebar from '@/components/layout/Sidebar';
import ChatArea from '@/components/layout/ChatArea';
import NewChatModal from '@/components/modals/NewChatModal';
import { useSocketStore } from '@/store/socketStore';

export default function HomePage() {
  useEffect(() => {
    // Connect socket on mount
    useSocketStore.getState().connect();

    return () => {
      // Disconnect on unmount (page navigation away)
      useSocketStore.getState().disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Panel 1: Icon Nav (56px) */}
      <IconNav />

      {/* Panel 2: Chat List Sidebar (280px) */}
      <Sidebar />

      {/* Panel 3: Chat Area (fills remaining) */}
      <ChatArea />

      {/* Modals */}
      <NewChatModal />
    </div>
  );
}
