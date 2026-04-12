import { create } from 'zustand';

interface SettingsState {
  openRouterApiKey: string;
  selectedModel: string;
  showSettings: boolean;

  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setShowSettings: (show: boolean) => void;
}

const STORAGE_KEY = 'deck-chat-settings';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveSettings(key: string, model: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ openRouterApiKey: key, selectedModel: model }));
}

const saved = loadSettings();

export const AVAILABLE_MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
  { id: 'anthropic/claude-haiku-4', name: 'Claude Haiku 4' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash' },
];

export const useSettingsStore = create<SettingsState>((set) => ({
  openRouterApiKey: saved.openRouterApiKey || '',
  selectedModel: saved.selectedModel || 'anthropic/claude-sonnet-4',
  showSettings: false,

  setApiKey: (key) => {
    set({ openRouterApiKey: key });
    const s = loadSettings();
    saveSettings(key, s.selectedModel || 'anthropic/claude-sonnet-4');
  },

  setModel: (model) => {
    set({ selectedModel: model });
    const s = loadSettings();
    saveSettings(s.openRouterApiKey || '', model);
  },

  setShowSettings: (show) => set({ showSettings: show }),
}));
