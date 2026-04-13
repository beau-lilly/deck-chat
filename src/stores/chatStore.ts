import { create } from 'zustand';
import type { Chat, ChatAnchor, ContextMode, Message } from '../types';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;

  createChat: (anchor: ChatAnchor, firstMessage: string, contextMode: ContextMode) => string;
  addMessage: (chatId: string, role: 'user' | 'assistant', content: string) => void;
  updateLastAssistantMessage: (chatId: string, content: string) => void;
  markResponseStarted: (chatId: string) => void;
  setActiveChat: (chatId: string | null) => void;
  getActiveChat: () => Chat | undefined;
}

function generateId() {
  return crypto.randomUUID();
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,

  createChat: (anchor, firstMessage, contextMode) => {
    const id = generateId();
    const now = new Date();
    const title = firstMessage.length > 60 ? firstMessage.slice(0, 60) + '...' : firstMessage;
    const chat: Chat = {
      id,
      documentId: 'current',
      anchor,
      title,
      messages: [
        { id: generateId(), role: 'user', content: firstMessage, createdAt: now },
      ],
      contextMode,
      archived: false,
      needsResponse: true,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ chats: [...s.chats, chat], activeChatId: id }));
    return id;
  },

  addMessage: (chatId, role, content) => {
    const now = new Date();
    const msg: Message = { id: generateId(), role, content, createdAt: now };
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, msg], updatedAt: now }
          : c
      ),
    }));
  },

  markResponseStarted: (chatId) => {
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, needsResponse: false } : c
      ),
    }));
  },

  updateLastAssistantMessage: (chatId, content) => {
    set((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c;
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content };
        }
        return { ...c, messages: msgs, updatedAt: new Date() };
      }),
    }));
  },

  setActiveChat: (chatId) => set({ activeChatId: chatId }),

  getActiveChat: () => {
    const { chats, activeChatId } = get();
    return chats.find((c) => c.id === activeChatId);
  },
}));
