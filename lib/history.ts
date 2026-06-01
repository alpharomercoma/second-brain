'use client';

import type { UIMessage } from 'ai';

/**
 * Conversation history, persisted in localStorage (client-only). Each chat is
 * stored whole so it can be re-read or deleted later, like a Claude chat list.
 */
export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

const KEY = 'sb.conversations.v1';
const MAX = 100;

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

function persist(list: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota / unavailable — ignore */
  }
}

export function saveConversation(conv: Conversation): Conversation[] {
  const list = loadConversations().filter((c) => c.id !== conv.id);
  list.unshift(conv);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  persist(list);
  return list;
}

export function deleteConversation(id: string): Conversation[] {
  const list = loadConversations().filter((c) => c.id !== id);
  persist(list);
  return list;
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}

export function titleFor(messages: UIMessage[]): string {
  const u = messages.find((m) => m.role === 'user');
  const text = ((u?.parts ?? []) as any[])
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim();
  if (!text) return 'Untitled chat';
  return text.length > 52 ? text.slice(0, 52) + '…' : text;
}

export function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return `${d}d ago`;
  }
}
