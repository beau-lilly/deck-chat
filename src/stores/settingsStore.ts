import { create } from 'zustand';

interface SettingsState {
  anthropicApiKey: string;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ anthropicApiKey: key, selectedModel: model }));
}

const saved = loadSettings();

export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-haiku-4-20250414', name: 'Claude Haiku 4' },
];

// Valid model IDs for the direct Anthropic API
const VALID_MODEL_IDS = new Set(AVAILABLE_MODELS.map((m) => m.id));

const DEFAULT_MODEL = 'claude-opus-4-20250514';

// If the saved model is from an old provider format (e.g. "anthropic/claude-sonnet-4"), reset it
const initialModel = (saved.selectedModel && VALID_MODEL_IDS.has(saved.selectedModel))
  ? saved.selectedModel
  : DEFAULT_MODEL;

export const useSettingsStore = create<SettingsState>((set) => ({
  anthropicApiKey: saved.anthropicApiKey || '',
  selectedModel: initialModel,
  showSettings: false,

  setApiKey: (key) => {
    set({ anthropicApiKey: key });
    const s = loadSettings();
    saveSettings(key, s.selectedModel || DEFAULT_MODEL);
  },

  setModel: (model) => {
    set({ selectedModel: model });
    const s = loadSettings();
    saveSettings(s.anthropicApiKey || '', model);
  },

  setShowSettings: (show) => set({ showSettings: show }),
}));
