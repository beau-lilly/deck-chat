import { useState, useRef, useEffect } from 'react';
import { X, MessageSquare, StickyNote } from 'lucide-react';
import { useSelectionStore } from '../../stores/selectionStore';
import AutoGrowTextarea from '../shared/AutoGrowTextarea';
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

type Mode = 'chat' | 'note';

export default function SelectionPopup({ onStartChat, onCreateNote }: SelectionPopupProps) {
  const { pendingAnchor, tool, clearSelection } = useSelectionStore();
  const [question, setQuestion] = useState('');
  const [contextMode, setContextMode] = useState<ContextMode>('selection');
  // Drives which submit path runs (chat vs note), whether the Context
  // pills are visible (chat-only — notes don't make LLM calls so context
  // modes are irrelevant), and the accent color of the popup (indigo
  // for chat, amber for note — matching the palette used elsewhere for
  // those two primitives).
  const [mode, setMode] = useState<Mode>('chat');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasTextSelection = pendingAnchor?.description && tool === 'text';

  // Refs that mirror the render-state so the document-level keydown handler
  // (registered once per popup lifetime) can read the current values
  // without being re-registered on every keystroke.
  const questionRef = useRef(question);
  questionRef.current = question;
  const contextModeRef = useRef(contextMode);
  contextModeRef.current = contextMode;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onStartChatRef = useRef(onStartChat);
  onStartChatRef.current = onStartChat;
  const onCreateNoteRef = useRef(onCreateNote);
  onCreateNoteRef.current = onCreateNote;

  useEffect(() => {
    if (!pendingAnchor) return;
    setQuestion('');
    // Whole-slide anchors (the page-number-badge "Ask about this
    // slide" path) default to the 'slide' context mode so the LLM
    // gets the page text + screenshot without the user having to
    // flip the pill manually. Region/text selections still default
    // to 'selection' as before.
    const isWholeSlide =
      (pendingAnchor.x ?? 0) <= 0.5 &&
      (pendingAnchor.y ?? 0) <= 0.5 &&
      (pendingAnchor.width ?? 0) >= 99 &&
      (pendingAnchor.height ?? 0) >= 99;
    setContextMode(isWholeSlide ? 'slide' : 'selection');
    // Each new selection defaults back to Chat mode — the Note path is
    // opt-in via the Type pill. Keeps users who primarily ask questions
    // from accidentally creating notes after one stray click.
    setMode('chat');

    // No text selection to preserve (region drag, whole-slide click,
    // or any anchor that didn't capture page text) → focus the input
    // immediately so the user can start typing. The keydown-bridge
    // pathway below is only needed when a real `description` is
    // present, because that's the only case where the browser's text
    // selection on the page is what we're trying not to clobber.
    if (!pendingAnchor.description) {
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
        if (modeRef.current === 'chat') {
          // Chat needs a question — Enter on empty is a no-op so the
          // user can press it without accidentally spawning a chat
          // with no prompt.
          if (q) {
            e.preventDefault();
            onStartChatRef.current(q, contextModeRef.current);
          }
        } else {
          // Note mode — an empty body is fine, a blank note just opens
          // the editor ready for typing.
          e.preventDefault();
          onCreateNoteRef.current(q);
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

  // One submit path, dispatched on current mode. Shared between the
  // primary action button ("Ask" / "Create"), the textarea's Enter key
  // (via AutoGrowTextarea's onSubmit), and the document-level keydown
  // fallback that runs when the user types before focusing the input.
  const submit = () => {
    const q = question.trim();
    if (mode === 'chat') {
      if (!q) return;
      onStartChat(q, contextMode);
    } else {
      // Notes don't need content at submit time — an empty body just
      // opens a blank editor the user can fill in.
      onCreateNote(q);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
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
        // Border tints amber in Note mode so the user has an unambiguous
        // visual cue that the popup will produce a note on submit
        // — matches the amber palette used across NoteNode, NotePanel,
        // and the anchor indicator.
        className={`bg-slate-800 border rounded-xl px-4 py-3 shadow-2xl transition-colors ${
          mode === 'note' ? 'border-amber-500/60' : 'border-slate-600'
        }`}
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

        {/* Type + Context pill row. Type on the left is always visible.
            Context on the right shows only in Chat mode (notes don't
            get sent to the LLM, so context mode is meaningless there
            and would read as dead UI). */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mb-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500 mr-1">Type:</span>
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                mode === 'chat'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'
              }`}
              title="Start a chat anchored to this selection"
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMode('note')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                mode === 'note'
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'
              }`}
              title="Write a note anchored to this selection"
            >
              Note
            </button>
          </div>

          {mode === 'chat' && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500 mr-1">Context:</span>
              {CONTEXT_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setContextMode(m.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                    contextMode === m.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'
                  }`}
                  title={m.hint}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* items-end so the action buttons stick to the bottom of the
            growing textarea — matches how Slack/iMessage-style inputs
            anchor their send control while the text area expands
            upward. The icon gets a small top padding so it lines up
            with the first line of text rather than vertically centering
            against a multi-line box. */}
        <div className="flex items-end gap-2">
          {mode === 'chat' ? (
            <MessageSquare size={16} className="text-indigo-400 shrink-0 mb-2" />
          ) : (
            <StickyNote size={16} className="text-amber-400 shrink-0 mb-2" />
          )}
          <AutoGrowTextarea
            textareaRef={inputRef}
            value={question}
            onChange={setQuestion}
            onSubmit={submit}
            placeholder={
              mode === 'note'
                ? 'Start a note or press Enter for a blank one'
                : hasTextSelection
                  ? 'Ask about this text…'
                  : 'Ask about this area…'
            }
            className="flex-1 bg-transparent text-sm leading-relaxed text-slate-200 placeholder-slate-500 outline-none py-1"
          />
          {/* Primary action — mode-driven. In Chat mode it's the indigo
              "Ask" (disabled without a question). In Note mode it's the
              amber "Create", always enabled since empty notes are valid
              (the editor opens blank and the user types in the panel). */}
          <button
            type="submit"
            disabled={mode === 'chat' && !question.trim()}
            className={`px-3 py-1 text-white text-sm rounded-lg transition-colors shrink-0 disabled:opacity-40 ${
              mode === 'note'
                ? 'bg-amber-500 hover:bg-amber-400'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {mode === 'note' ? 'Create' : 'Ask'}
          </button>
          {/* h-7 (28 px) matches the primary button's text-sm + py-1
              computed height so items-end bottom-aligns both to the
              same baseline instead of leaving the icon-only X short. */}
          <button
            type="button"
            onClick={clearSelection}
            className="h-7 w-7 flex items-center justify-center hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
