import { create } from 'zustand';
import type { Chat, ChatAnchor, ContextMode, Message } from '../types';
import { repo } from '../data/repo';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;

  // Replaces the in-memory chats with the chats persisted for this document.
  // Called when the user opens a PDF from the sidebar.
  loadChatsForDocument: (documentId: string) => Promise<void>;

  createChat: (
    documentId: string,
    anchor: ChatAnchor,
    firstMessage: string,
    contextMode: ContextMode,
  ) => string;
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

  loadChatsForDocument: async (documentId) => {
    const chats = await repo.listChats(documentId);
    set({ chats, activeChatId: null });
  },

  createChat: (documentId, anchor, firstMessage, contextMode) => {
    const id = generateId();
    const now = new Date();
    const title = firstMessage.length > 60 ? firstMessage.slice(0, 60) + '...' : firstMessage;
    const chat: Chat = {
      id,
      documentId,
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
    // Fire-and-forget: persist the new chat + first message.
    void repo.createChat(chat);
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
    void repo.appendMessage(chatId, msg);
  },

  markResponseStarted: (chatId) => {
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, needsResponse: false } : c
      ),
    }));
    void repo.markResponseStarted(chatId);
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
    // Throttling the persisted writes would be nice, but streaming chunks are
    // small and infrequent in practice. Fire-and-forget keeps UI snappy.
    void repo.updateLastAssistantMessage(chatId, content);
  },

  setActiveChat: (chatId) => set({ activeChatId: chatId }),

  getActiveChat: () => {
    const { chats, activeChatId } = get();
    return chats.find((c) => c.id === activeChatId);
  },
}));
