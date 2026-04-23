import { useState, useRef, useEffect } from 'react';
import { X, MessageSquare, StickyNote } from 'lucide-react';
import { useSelectionStore } from '../../stores/selectionStore';
import type { ContextMode } from '../../types';

interface SelectionPopupProps {
  onStartChat: (question: string, contextMode: ContextMode) => void;
  /** Create a note anchored to the current selection. Receives the
   *  current input text as an initial markdown body (may be empty). */
  onCreateNote: (initialBody: string) => void;
}

const CONTEXT_MODES: { value: ContextMode; label: string; hint: string }[] = [
  { value: 'selection', label: 'Selection', hint: 'Region only' },
  { value: 'slide', label: 'Slide', hint: 'Full page' },
  { value: 'document', label: 'Full Doc', hint: 'All pages' },
];

export default function SelectionPopup({ onStartChat, onCreateNote }: SelectionPopupProps) {
  const { pendingAnchor, tool, clearSelection } = useSelectionStore();
  const [question, setQuestion] = useState('');
  const [contextMode, setContextMode] = useState<ContextMode>('selection');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasTextSelection = pendingAnchor?.description && tool === 'text';

  // Refs that mirror the render-state so the document-level keydown handler
  // (registered once per popup lifetime) can read the current values
  // without being re-registered on every keystroke.
  const questionRef = useRef(question);
  questionRef.current = question;
  const contextModeRef = useRef(contextMode);
  contextModeRef.current = contextMode;
  const onStartChatRef = useRef(onStartChat);
  onStartChatRef.current = onStartChat;
  const onCreateNoteRef = useRef(onCreateNote);
  onCreateNoteRef.current = onCreateNote;

  useEffect(() => {
    if (!pendingAnchor) return;
    setQuestion('');
    setContextMode('selection');

    // Region selections: no page text selection to preserve → focus the
    // input immediately so the user can start typing.
    if (tool !== 'text') {
      const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      return () => window.clearTimeout(id);
    }

    // Text selections: we deliberately DON'T focus the input. Browsers
    // tie the Selection context to the focused element, so the moment an
    // input takes focus the page's text selection is torn down — both
    // Chrome and Safari enforce this. We want the user to be able to
    // copy (⌘C) the highlighted text, so we keep focus on the document
    // and route keystrokes into the question state manually.
    //
    // The moment the user types a printable character, they've committed
    // to writing a question — at that point we promote to real input
    // focus (selection clears, but the user is already typing so the
    // highlight is no longer needed) and everything behaves like a
    // normal input from there.
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the user has already given focus to a real editable (by
      // clicking the input, or the settings modal is open, etc.), let
      // that element handle its own keystrokes.
      const ae = document.activeElement as HTMLElement | null;
      if (
        ae instanceof HTMLInputElement ||
        ae instanceof HTMLTextAreaElement ||
        ae?.isContentEditable
      ) {
        return;
      }

      // Let the browser handle modifier shortcuts — crucially ⌘C/Ctrl+C
      // so copy still works on the live selection, plus paste, select-
      // all, Cmd+arrows, dev-tools shortcuts, etc.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter') {
        const q = questionRef.current.trim();
        if (q) {
          e.preventDefault();
          onStartChatRef.current(q, contextModeRef.current);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setQuestion((prev) => prev.slice(0, -1));
        return;
      }

      // Printable single-char keys (`.length === 1` matches a codepoint
      // like "a", " ", "!", but not "Shift", "ArrowLeft", "Dead", etc.).
      // Skip key-repeat events — the native input will handle those once
      // it gets focused below.
      if (e.key.length === 1 && !e.repeat) {
        e.preventDefault();
        const ch = e.key;
        setQuestion((prev) => prev + ch);
        // Promote to real input focus. This tears down the page
        // selection — acceptable because the user is now typing, the
        // question state has the typed char, and everything from here
        // (arrow keys, backspace with navigation, more letters) flows
        // through the normal <input>.
        inputRef.current?.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pendingAnchor, tool, clearSelection]);

  if (!pendingAnchor) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    onStartChat(q, contextMode);
  };

  const handleCreateNote = () => {
    // Notes don't require an input — clicking "Note" with an empty
    // box opens a blank editor anchored here. If the user has typed
    // something, we seed the note body with it.
    onCreateNote(question.trim());
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

        {/* Context mode selector */}
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[11px] text-slate-500 mr-1">Context:</span>
          {CONTEXT_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setContextMode(mode.value)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                contextMode === mode.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'
              }`}
              title={mode.hint}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={hasTextSelection ? "Ask about this text…" : "Ask about this area…"}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
          />
          <button
            type="button"
            onClick={handleCreateNote}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors shrink-0"
            title="Create a markdown note anchored to this selection"
          >
            <StickyNote size={13} />
            Note
          </button>
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
