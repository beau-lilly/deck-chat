import { create } from 'zustand';

export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export interface ModelInfo {
  /** Identifier sent directly to the provider API. Also the stored
   *  value in `selectedModel`. Must be unique across all providers. */
  id: string;
  provider: ProviderId;
  name: string;
}

// Keep this in sync with each provider's model docs:
//   Anthropic: https://platform.claude.com/docs/en/docs/about-claude/models/overview
//   OpenAI:    https://platform.openai.com/docs/models
//   Gemini:    https://ai.google.dev/gemini-api/docs/models
// IDs are what gets sent to the provider's API (aliases preferred over
// dated snapshots so we auto-upgrade to latest when providers ship a
// new snapshot under the same alias).
export const AVAILABLE_MODELS: ModelInfo[] = [
  // --- Anthropic (current, per Anthropic model overview) -------------
  { id: 'claude-opus-4-7', provider: 'anthropic', name: 'Claude Opus 4.7' },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', provider: 'anthropic', name: 'Claude Haiku 4.5' },
  // Opus 4.6 kept for its 1M-token context window (the 4.7 alias is
  // capped at ~1M too but 4.6 remains the go-to for long-context work).
  { id: 'claude-opus-4-6', provider: 'anthropic', name: 'Claude Opus 4.6 (1M context)' },

  // --- OpenAI (GPT-5.x + o-series reasoning) -------------------------
  { id: 'gpt-5.4', provider: 'openai', name: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', provider: 'openai', name: 'GPT-5.4 mini' },
  { id: 'gpt-5.4-nano', provider: 'openai', name: 'GPT-5.4 nano' },
  { id: 'gpt-5.3', provider: 'openai', name: 'GPT-5.3' },
  { id: 'o3', provider: 'openai', name: 'o3 (reasoning)' },
  { id: 'o3-mini', provider: 'openai', name: 'o3 mini (reasoning)' },

  // --- Google Gemini (3.x preview + stable 2.5) ---------------------
  { id: 'gemini-3.1-pro-preview', provider: 'gemini', name: 'Gemini 3.1 Pro (preview)' },
  { id: 'gemini-3-flash-preview', provider: 'gemini', name: 'Gemini 3 Flash (preview)' },
  { id: 'gemini-3.1-flash-lite-preview', provider: 'gemini', name: 'Gemini 3.1 Flash Lite (preview)' },
  { id: 'gemini-2.5-pro', provider: 'gemini', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', provider: 'gemini', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', provider: 'gemini', name: 'Gemini 2.5 Flash Lite' },
];

const MODEL_INDEX = new Map(AVAILABLE_MODELS.map((m) => [m.id, m]));

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_INDEX.get(modelId);
}

interface SettingsState {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  selectedModel: string;
  showSettings: boolean;

  setAnthropicKey: (key: string) => void;
  setOpenAIKey: (key: string) => void;
  setGeminiKey: (key: string) => void;
  setModel: (model: string) => void;
  setShowSettings: (show: boolean) => void;
}

/** Returns the API key for the provider backing the given model id. */
export function getApiKeyFor(state: SettingsState, modelId: string): string {
  const info = getModelInfo(modelId);
  if (!info) return '';
  switch (info.provider) {
    case 'anthropic':
      return state.anthropicApiKey;
    case 'openai':
      return state.openaiApiKey;
    case 'gemini':
      return state.geminiApiKey;
  }
}

/** Convenience: does the CURRENTLY selected model have an API key? */
export function hasKeyForSelectedModel(state: SettingsState): boolean {
  return Boolean(getApiKeyFor(state, state.selectedModel));
}

const STORAGE_KEY = 'deck-chat-settings';

interface Persisted {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  selectedModel?: string;
}

function loadSettings(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore malformed localStorage */
  }
  return {};
}

function saveSettings(s: {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  selectedModel: string;
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota full / private mode — silent fail */
  }
}

const saved = loadSettings();

// Balanced default — Sonnet 4.6 is fast, cheap, and multimodal, so
// users who haven't picked a model yet get a sensible out-of-the-box
// experience.
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Fall back to default if the saved model id isn't in our registry
// (e.g. a pre-refactor value or a stale id after removing a model).
const initialModel =
  saved.selectedModel && MODEL_INDEX.has(saved.selectedModel)
    ? saved.selectedModel
    : DEFAULT_MODEL;

export const useSettingsStore = create<SettingsState>((set, get) => {
  const snapshot = () => {
    const s = get();
    return {
      anthropicApiKey: s.anthropicApiKey,
      openaiApiKey: s.openaiApiKey,
      geminiApiKey: s.geminiApiKey,
      selectedModel: s.selectedModel,
    };
  };
  return {
    anthropicApiKey: saved.anthropicApiKey || '',
    openaiApiKey: saved.openaiApiKey || '',
    geminiApiKey: saved.geminiApiKey || '',
    selectedModel: initialModel,
    showSettings: false,

    setAnthropicKey: (key) => {
      set({ anthropicApiKey: key });
      saveSettings(snapshot());
    },

    setOpenAIKey: (key) => {
      set({ openaiApiKey: key });
      saveSettings(snapshot());
    },

    setGeminiKey: (key) => {
      set({ geminiApiKey: key });
      saveSettings(snapshot());
    },

    setModel: (model) => {
      set({ selectedModel: model });
      saveSettings(snapshot());
    },

    setShowSettings: (show) => set({ showSettings: show }),
  };
});
