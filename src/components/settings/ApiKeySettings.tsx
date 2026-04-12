import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useSettingsStore, AVAILABLE_MODELS } from '../../stores/settingsStore';

export default function ApiKeySettings() {
  const { openRouterApiKey, selectedModel, showSettings, setApiKey, setModel, setShowSettings } =
    useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [tempKey, setTempKey] = useState(openRouterApiKey);

  if (!showSettings) return null;

  const handleSave = () => {
    setApiKey(tempKey.trim());
    setShowSettings(false);
  };

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
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">OpenRouter API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="sk-or-..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Get your key at openrouter.ai/keys
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
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
