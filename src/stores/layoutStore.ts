import { create } from 'zustand';

// Persisted layout preferences: sidebar widths. Kept separate from
// librarianStore and chatStore because these are cross-cutting UI concerns
// that don't belong to either feature specifically.

const STORAGE_KEY = 'deck-chat-layout';

export const SIDEBAR_DEFAULT = 256; // matches the old Tailwind w-64
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 640;

export const CHAT_PANEL_DEFAULT = 384; // matches the old Tailwind w-96
export const CHAT_PANEL_MIN = 260;
export const CHAT_PANEL_MAX = 800;

interface Persisted {
  sidebarWidth?: number;
  chatPanelWidth?: number;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore malformed storage */
  }
  return {};
}

function save(state: { sidebarWidth: number; chatPanelWidth: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota full or private-mode — silently ignore */
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface LayoutState {
  sidebarWidth: number;
  chatPanelWidth: number;
  setSidebarWidth: (w: number) => void;
  setChatPanelWidth: (w: number) => void;
}

const saved = load();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarWidth: clamp(saved.sidebarWidth ?? SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
  chatPanelWidth: clamp(saved.chatPanelWidth ?? CHAT_PANEL_DEFAULT, CHAT_PANEL_MIN, CHAT_PANEL_MAX),

  setSidebarWidth: (w) => {
    const clamped = clamp(w, SIDEBAR_MIN, SIDEBAR_MAX);
    set({ sidebarWidth: clamped });
    save({ sidebarWidth: clamped, chatPanelWidth: get().chatPanelWidth });
  },

  setChatPanelWidth: (w) => {
    const clamped = clamp(w, CHAT_PANEL_MIN, CHAT_PANEL_MAX);
    set({ chatPanelWidth: clamped });
    save({ sidebarWidth: get().sidebarWidth, chatPanelWidth: clamped });
  },
}));
