import { StickyNote } from 'lucide-react';
import type { SidebarNote } from '../../data/liveQueries';
import { useDocumentStore } from '../../stores/documentStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';

interface Props {
  note: SidebarNote;
  depth: number;
}

/**
 * Sidebar row for a single note — the note-side parallel of ChatNode.
 * Clicking opens the note in the right panel, switching the doc if
 * needed and clearing any active chat so the panel routes to the
 * NotePanel branch.
 */
export default function NoteNode({ note, depth }: Props) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const loadChatsForDocument = useChatStore((s) => s.loadChatsForDocument);
  const activeNoteId = useNoteStore((s) => s.activeNote?.id);
  const openNote = useNoteStore((s) => s.openNote);

  const isActive = activeNoteId === note.id;

  const handleClick = async () => {
    if (activeDocumentId !== note.documentId) {
      await openDocument(note.documentId);
      await loadChatsForDocument(note.documentId);
    }
    // Clear chat selection so the panel routes to NotePanel.
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
