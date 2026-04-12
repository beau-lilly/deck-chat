import { useState, useRef, useEffect } from 'react';
import { X, MessageSquare } from 'lucide-react';
import { useSelectionStore } from '../../stores/selectionStore';

interface SelectionPopupProps {
  onStartChat: (question: string) => void;
}

export default function SelectionPopup({ onStartChat }: SelectionPopupProps) {
  const { pendingAnchor, tool, clearSelection } = useSelectionStore();
  const [question, setQuestion] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasTextSelection = pendingAnchor?.description && tool === 'text';

  useEffect(() => {
    if (pendingAnchor) {
      setQuestion('');
      // Don't auto-focus for text selections — it clears the highlight in Safari.
      // For region selections, auto-focus is fine.
      if (tool !== 'text') {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  }, [pendingAnchor, tool]);

  if (!pendingAnchor) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    onStartChat(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSelection();
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-full px-4" data-selection-popup>
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {hasTextSelection && (
          <div className="mb-2 px-1">
            <span className="text-xs text-slate-500">Selected text:</span>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 italic">
              "{pendingAnchor.description}"
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={hasTextSelection ? "Ask about this text..." : "Ask about this area..."}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
          />
          <button
            type="submit"
            disabled={!question.trim()}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors shrink-0"
          >
            Ask
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
