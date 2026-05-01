'use client';

// ──────────────────────────────────────────────
// Home page — 3-panel messenger layout
// Protected by Next.js middleware (redirects to /login)
// ──────────────────────────────────────────────

import IconNav from '@/components/layout/IconNav';
import Sidebar from '@/components/layout/Sidebar';
import ChatArea from '@/components/layout/ChatArea';

export default function HomePage() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Panel 1: Icon Nav (56px) */}
      <IconNav />

      {/* Panel 2: Chat List Sidebar (280px) */}
      <Sidebar />

      {/* Panel 3: Chat Area (fills remaining) */}
      <ChatArea />
    </div>
  );
}
