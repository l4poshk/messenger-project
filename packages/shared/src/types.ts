// ──────────────────────────────────────────────
// Shared TypeScript types (mirrors Prisma schema)
// ──────────────────────────────────────────────

export enum ChatType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
  SUPERGROUP = 'SUPERGROUP',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  FILE = 'FILE',
}

export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

// ── API Response wrapper ──

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// ── Domain types ──

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  description: string | null;
  status: string | null;
  lastSeen: string | null;
  createdAt: string;
}

export interface Chat {
  id: string;
  type: ChatType;
  name: string | null;
  avatar: string | null;
  description: string | null;
  createdAt: string;
}

export interface Topic {
  id: string;
  chatId: string;
  name: string;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  topicId: string | null;
  senderId: string;
  type: MessageType;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  duration: number | null;
  waveform: number[] | null;
  replyToId: string | null;
  isRead: boolean;
  isEdited: boolean;
  isForwarded: boolean;
  originalSenderName: string | null;
  hiddenFor: string[];
  createdAt: string;
  editedAt: string | null;
  sender?: User;
  replyTo?: Message | null;
}

export interface Member {
  id: string;
  chatId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  user?: User;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// ── Socket event payloads ──

export interface TypingPayload {
  chatId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

export interface CallOfferPayload {
  chatId: string;
  callerId: string;
  offer: any; // Using any because RTCSessionDescriptionInit is a DOM-only type
  type: 'audio' | 'video';
}

export interface CallAnswerPayload {
  chatId: string;
  answer: any;
}

export interface IceCandidatePayload {
  chatId: string;
  candidate: any;
}
