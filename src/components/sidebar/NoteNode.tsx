import { StickyNote } from 'lucide-react';
import type { SidebarNote } from '../../data/liveQueries';
import { useDocumentStore } from '../../stores/documentStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { classifyClick, usePreviewStore } from '../../stores/previewStore';

interface Props {
  note: SidebarNote;
  depth: number;
}

/**
 * Sidebar row for a single note — the note-side parallel of ChatNode.
 *
 * Click cycle (same as ChatNode):
 *   first click → preview (pan + highlight only; panel stays on list)
 *   second click on the same row → open (active note fills the panel)
 *   double-click → first onClick previews, second reads preview and opens
 *   click on the already-active note → no-op
 */
export default function NoteNode({ note, depth }: Props) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const loadChatsForDocument = useChatStore((s) => s.loadChatsForDocument);
  const activeNoteId = useNoteStore((s) => s.activeNote?.id);
  const openNote = useNoteStore((s) => s.openNote);
  const previewed = usePreviewStore((s) => s.previewed);

  const isActive = activeNoteId === note.id;
  const isPreviewed =
    previewed?.kind === 'note' && previewed.id === note.id && !isActive;

  const handleClick = async () => {
    const mode = classifyClick('note', note.id, isActive);
    if (mode === 'noop') return;

    if (activeDocumentId !== note.documentId) {
      await openDocument(note.documentId);
      await loadChatsForDocument(note.documentId);
    }

    if (mode === 'preview') {
      usePreviewStore.getState().setPreviewed({
        kind: 'note',
        id: note.id,
        documentId: note.documentId,
        anchor: note.anchor,
      });
      return;
    }

    // mode === 'open'
    usePreviewStore.getState().clearPreview();
    useChatStore.getState().setActiveChat(null);
    await openNote(note.id);
  };

  return (
    <button
      onClick={handleClick}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      className={`w-full flex items-center gap-1.5 pr-2 py-1 text-[11px] text-left rounded transition-colors ${
        isActive
          ? 'bg-amber-500/20 text-amber-100'
          : isPreviewed
            ? 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/60'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
      title={`p.${note.anchor.pageNumber} — ${note.title}`}
    >
      {/* Amber tint keeps notes visually distinct from chats (indigo)
          in the sidebar so the dropdown is skimmable. */}
      <StickyNote size={11} className="shrink-0 text-amber-500/80" />
      <span className="text-slate-500 shrink-0 tabular-nums">
        p.{note.anchor.pageNumber}
      </span>
      <span className="truncate">{note.title}</span>
    </button>
  );
}
