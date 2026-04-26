import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNoteStore } from '../../stores/noteStore';
import LiveMarkdownEditor from './LiveMarkdownEditor';

/**
 * Right-panel renderer for the active note.
 *
 * Uses a single unified live-preview editor (Tiptap + tiptap-markdown)
 * instead of the old edit/view toggle — the markdown formatting is
 * rendered inline as the user types, Obsidian/Notion-style. The raw
 * markdown is what we persist, debounced on every edit.
 */
export default function NotePanel() {
  const activeNote = useNoteStore((s) => s.activeNote);
  const closeNote = useNoteStore((s) => s.closeNote);
  const updateActiveNoteBody = useNoteStore((s) => s.updateActiveNoteBody);
  const renameActiveNote = useNoteStore((s) => s.renameActiveNote);

  // Local draft so typing is instant; persisted via the debounced
  // effect below.
  const [draft, setDraft] = useState(activeNote?.body ?? '');

  // Title editing — double-click the title text in the header to enter
  // edit mode. Once the user renames, `noteStore.updateActiveNoteBody`'s
  // auto-derive logic detects that title !== deriveTitle(prevBody) and
  // stops re-deriving on subsequent body edits, so custom titles stick.
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Switching between notes (user clicked a different row in the
  // sidebar) should reset the draft to the new note's body and cancel
  // any in-flight title edit so it doesn't leak onto the new note.
  const activeIdRef = useRef<string | null>(activeNote?.id ?? null);
  useEffect(() => {
    if (!activeNote) return;
    if (activeNote.id !== activeIdRef.current) {
      activeIdRef.current = activeNote.id;
      setDraft(activeNote.body);
      setIsEditingTitle(false);
    }
  }, [activeNote]);

  // When entering title-edit mode, focus + select the input on the next
  // paint so Cmd+A-style select-all isn't needed for a quick retype.
  useEffect(() => {
    if (!isEditingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [isEditingTitle]);

  // Debounced persistence — wait ~350 ms after the last keystroke
  // before writing to IndexedDB so we don't hammer the DB on every
  // edit but the user's changes are durable well before they'd close
  // the tab.
  useEffect(() => {
    if (!activeNote) return;
    if (draft === activeNote.body) return;
    const id = window.setTimeout(() => {
      void updateActiveNoteBody(draft);
    }, 350);
    return () => window.clearTimeout(id);
  }, [draft, activeNote, updateActiveNoteBody]);

  if (!activeNote) return null;

  // Autofocus a freshly-created note (body still empty) so the user
  // can start typing immediately without clicking in.
  const autoFocus = activeNote.body.length === 0;

  const beginTitleEdit = () => {
    setTitleDraft(activeNote.title);
    setIsEditingTitle(true);
  };

  const commitTitleEdit = async () => {
    const trimmed = titleDraft.trim();
    // Empty / unchanged / same-as-current → silent cancel; don't
    // accidentally clobber the note with an empty title.
    if (!trimmed || trimmed === activeNote.title) {
      setIsEditingTitle(false);
      return;
    }
    await renameActiveNote(trimmed);
    setIsEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — back button + title + type badge */}
      <div className="h-12 border-b border-slate-700 flex items-center px-3 gap-2 shrink-0">
        <button
          onClick={() => {
            // Flush any pending draft before we close so the user
            // doesn't lose the last keystrokes of a fast-typing burst
            // that hasn't hit the debounce yet.
            if (activeNote && draft !== activeNote.body) {
              void updateActiveNoteBody(draft);
            }
            closeNote();
          }}
          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
          title="Back to list"
        >
          <ArrowLeft size={16} />
        </button>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              void commitTitleEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitTitleEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelTitleEdit();
              }
            }}
            // Amber border matches the notes palette used across the
            // anchor indicator, sidebar row highlights, and selection
            // popup in Note mode — keeps the "this input belongs to a
            // note" visual grammar consistent.
            className="flex-1 min-w-0 bg-slate-900 border border-amber-500/60 rounded px-1.5 py-0.5 text-sm text-slate-100 outline-none"
            aria-label="Note title"
          />
        ) : (
          // Single-click to edit, Apple-Notes / Notion-style. The span
          // is still `cursor-text` (not `cursor-pointer`) because the
          // affordance here is "this is an editable text field", not
          // "this is a button".
          <span
            onClick={beginTitleEdit}
            className="text-sm text-slate-200 truncate flex-1 cursor-text select-none"
            title="Click to rename"
          >
            {activeNote.title}
          </span>
        )}
        <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
          Note
        </span>
      </div>

      {/* Live-preview editor — markdown formatting renders as you type */}
      <div className="flex-1 overflow-hidden">
        <LiveMarkdownEditor
          value={draft}
          onChange={setDraft}
          autoFocus={autoFocus}
          placeholder="Write markdown here. Try **bold**, `code`, # heading, - list, > quote…"
        />
      </div>
    </div>
  );
}
