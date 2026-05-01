'use client';

// ──────────────────────────────────────────────
// Topic Bar — переключение между топиками в суперогруппе
// ──────────────────────────────────────────────

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Topic } from '@messenger/shared';

interface TopicBarProps {
  chatId: string;
  topics: Topic[];
  activeTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  onTopicCreated: (topic: Topic) => void;
  canManage: boolean;
}

export default function TopicBar({
  chatId,
  topics,
  activeTopicId,
  onSelectTopic,
  onTopicCreated,
  canManage
}: TopicBarProps) {
  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await api.post<Topic>(`/chats/${chatId}/topics`, { name: newName.trim() });
    if (res.data) {
      onTopicCreated(res.data);
      setNewName('');
      setShowInput(false);
    }
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-secondary/50 overflow-x-auto no-scrollbar">
      {/* "All" tab */}
      <button
        onClick={() => onSelectTopic(null)}
        className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
          activeTopicId === null
            ? 'bg-accent text-accent-dark'
            : 'bg-elevated text-text-muted hover:text-text-primary'
        }`}
      >
        All
      </button>

      {/* Topic tabs */}
      {topics.map((topic) => (
        <button
          key={topic.id}
          onClick={() => onSelectTopic(topic.id)}
          className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
            activeTopicId === topic.id
              ? 'bg-accent text-accent-dark'
              : 'bg-elevated text-text-muted hover:text-text-primary'
          }`}
        >
          # {topic.name}
        </button>
      ))}

      {/* Add topic */}
      {canManage && (
        showInput ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Topic name"
              className="w-28 px-2 py-1 rounded-lg bg-elevated text-xs text-text-primary outline-none border border-border focus:border-accent"
            />
            <button onClick={handleCreate} className="text-accent text-xs font-medium">✓</button>
            <button onClick={() => setShowInput(false)} className="text-text-hint text-xs">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-text-hint hover:bg-elevated hover:text-accent transition-colors"
            title="New topic"
          >
            +
          </button>
        )
      )}
    </div>
  );
}
