import { useState, useEffect } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import {
  useSettingsStore,
  AVAILABLE_MODELS,
  getModelInfo,
  type ModelInfo,
  type ProviderId,
} from '../../stores/settingsStore';

interface ProviderMeta {
  label: string;
  placeholder: string;
  docsHref: string;
  docsLabel: string;
}

const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-…',
    docsHref: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI API Key',
    placeholder: 'sk-…',
    docsHref: 'https://platform.openai.com/api-keys',
    docsLabel: 'platform.openai.com/api-keys',
  },
  gemini: {
    label: 'Google Gemini API Key',
    placeholder: 'AIza…',
    docsHref: 'https://aistudio.google.com/apikey',
    docsLabel: 'aistudio.google.com/apikey',
  },
};

export default function ApiKeySettings() {
  const anthropicApiKey = useSettingsStore((s) => s.anthropicApiKey);
  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey);
  const geminiApiKey = useSettingsStore((s) => s.geminiApiKey);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const showSettings = useSettingsStore((s) => s.showSettings);
  const setAnthropicKey = useSettingsStore((s) => s.setAnthropicKey);
  const setOpenAIKey = useSettingsStore((s) => s.setOpenAIKey);
  const setGeminiKey = useSettingsStore((s) => s.setGeminiKey);
  const setModel = useSettingsStore((s) => s.setModel);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);

  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [tempAnthropic, setTempAnthropic] = useState(anthropicApiKey);
  const [tempOpenAI, setTempOpenAI] = useState(openaiApiKey);
  const [tempGemini, setTempGemini] = useState(geminiApiKey);

  // Auto-show settings on first load only when NO keys are configured.
  // If the user has configured at least one provider we don't nag on
  // every reload.
  useEffect(() => {
    if (!anthropicApiKey && !openaiApiKey && !geminiApiKey) {
      setShowSettings(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the temp inputs in sync when the modal opens so discarded
  // edits from a previous session don't persist.
  useEffect(() => {
    if (showSettings) {
      setTempAnthropic(anthropicApiKey);
      setTempOpenAI(openaiApiKey);
      setTempGemini(geminiApiKey);
    }
  }, [showSettings, anthropicApiKey, openaiApiKey, geminiApiKey]);

  if (!showSettings) return null;

  const handleSave = () => {
    const anth = tempAnthropic.trim();
    const oai = tempOpenAI.trim();
    const gem = tempGemini.trim();
    setAnthropicKey(anth);
    setOpenAIKey(oai);
    setGeminiKey(gem);

    const keyByProvider = (p: ProviderId) =>
      p === 'anthropic' ? anth : p === 'openai' ? oai : gem;

    // If the currently selected model's provider now has no key, pick
    // the first configured model so the user lands in a usable state.
    const curInfo = getModelInfo(selectedModel);
    if (curInfo && !keyByProvider(curInfo.provider)) {
      const fallback = AVAILABLE_MODELS.find((m) => keyByProvider(m.provider));
      if (fallback) setModel(fallback.id);
    }

    setShowSettings(false);
  };

  // Group models for the picker so the dropdown reads "Anthropic: …,
  // OpenAI: …, Gemini: …" instead of one flat list.
  const modelsByProvider: Record<ProviderId, ModelInfo[]> = {
    anthropic: AVAILABLE_MODELS.filter((m) => m.provider === 'anthropic'),
    openai: AVAILABLE_MODELS.filter((m) => m.provider === 'openai'),
    gemini: AVAILABLE_MODELS.filter((m) => m.provider === 'gemini'),
  };

  const keyFor = (p: ProviderId) =>
    p === 'anthropic' ? tempAnthropic : p === 'openai' ? tempOpenAI : tempGemini;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-100">Settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <ApiKeyField
            meta={PROVIDERS.anthropic}
            value={tempAnthropic}
            onChange={setTempAnthropic}
            shown={showAnthropic}
            toggleShown={() => setShowAnthropic((v) => !v)}
          />

          <ApiKeyField
            meta={PROVIDERS.openai}
            value={tempOpenAI}
            onChange={setTempOpenAI}
            shown={showOpenAI}
            toggleShown={() => setShowOpenAI((v) => !v)}
          />

          <ApiKeyField
            meta={PROVIDERS.gemini}
            value={tempGemini}
            onChange={setTempGemini}
            shown={showGemini}
            toggleShown={() => setShowGemini((v) => !v)}
          />

          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setModel(e.target.value)}
              className="w-full appearance-none bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9"
            >
              <optgroup label="Anthropic">
                {modelsByProvider.anthropic.map((m) => (
                  <option key={m.id} value={m.id} disabled={!keyFor('anthropic')}>
                    {m.name}
                    {!keyFor('anthropic') ? ' — key needed' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="OpenAI">
                {modelsByProvider.openai.map((m) => (
                  <option key={m.id} value={m.id} disabled={!keyFor('openai')}>
                    {m.name}
                    {!keyFor('openai') ? ' — key needed' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google Gemini">
                {modelsByProvider.gemini.map((m) => (
                  <option key={m.id} value={m.id} disabled={!keyFor('gemini')}>
                    {m.name}
                    {!keyFor('gemini') ? ' — key needed' : ''}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Only models whose provider has a key are selectable. Add a
              key above to enable that provider's models.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface ApiKeyFieldProps {
  meta: ProviderMeta;
  value: string;
  onChange: (next: string) => void;
  shown: boolean;
  toggleShown: () => void;
}

function ApiKeyField({ meta, value, onChange, shown, toggleShown }: ApiKeyFieldProps) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-1.5">{meta.label}</label>
      <div className="relative">
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta.placeholder}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 pr-10"
        />
        <button
          type="button"
          onClick={toggleShown}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
        >
          {shown ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        Get your key at{' '}
        <a
          href={meta.docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300"
        >
          {meta.docsLabel}
        </a>
      </p>
    </div>
  );
}
