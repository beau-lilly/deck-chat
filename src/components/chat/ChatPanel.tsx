import { useMemo, useState } from 'react';
import { MessageCircle, StickyNote } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useNotesForDocument } from '../../data/liveQueries';
import ChatThread from './ChatThread';
import NotePanel from '../notes/NotePanel';
import ResizeHandle from '../layout/ResizeHandle';

interface ChatPanelProps {
  open: boolean;
  pageImageBase64?: string;
  fullPageImageBase64?: string;
}

type Filter = 'all' | 'chats' | 'notes';

export default function ChatPanel({ open, pageImageBase64, fullPageImageBase64 }: ChatPanelProps) {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const activeNote = useNoteStore((s) => s.activeNote);
  const openNote = useNoteStore((s) => s.openNote);
  const closeNote = useNoteStore((s) => s.closeNote);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const chatPanelWidth = useLayoutStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useLayoutStore((s) => s.setChatPanelWidth);

  // Notes live in IndexedDB (via liveQuery) rather than zustand state —
  // they'd balloon the in-memory store since bodies can be long and
  // users are likely to accumulate many. The sidebar already uses this
  // hook; we reuse it here for the right panel's list.
  const notes = useNotesForDocument(activeDocumentId ?? '');

  const [filter, setFilter] = useState<Filter>('all');

  // Build a single unified list, sorted by anchor position (page →
  // y → x) so chats and notes that live on the same page sit next
  // to each other. Matches the sidebar's ordering so the right
  // panel doesn't feel inconsistent.
  type Row =
    | { kind: 'chat'; id: string; title: string; pageNumber: number; y: number; x: number; messages: number }
    | { kind: 'note'; id: string; title: string; pageNumber: number; y: number; x: number };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (filter !== 'notes') {
      for (const c of chats) {
        if (c.archived) continue;
        out.push({
          kind: 'chat',
          id: c.id,
          title: c.title,
          pageNumber: c.anchor.pageNumber,
          y: c.anchor.y ?? 0,
          x: c.anchor.x ?? 0,
          messages: c.messages.length,
        });
      }
    }
    if (filter !== 'chats') {
      for (const n of notes) {
        out.push({
          kind: 'note',
          id: n.id,
          title: n.title,
          pageNumber: n.anchor.pageNumber,
          y: n.anchor.y ?? 0,
          x: n.anchor.x ?? 0,
        });
      }
    }
    out.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
    return out;
  }, [chats, notes, filter]);

  if (!open) return null;

  const totalCount = chats.filter((c) => !c.archived).length + notes.length;

  const handleRowClick = (row: Row) => {
    if (row.kind === 'chat') {
      closeNote();
      setActiveChat(row.id);
    } else {
      setActiveChat(null);
      void openNote(row.id);
    }
  };

  return (
    <div
      style={{ width: `${chatPanelWidth}px` }}
      className="relative h-full bg-slate-900 border-l border-slate-700 flex flex-col shrink-0"
    >
      <ResizeHandle side="left" width={chatPanelWidth} onChange={setChatPanelWidth} />

      {activeNote ? (
        // Active note takes precedence — we clear activeChatId when a
        // note is opened (see AppLayout.handleCreateNote, NoteNode
        // click handler), so this branch only runs when the user is
        // explicitly in a note.
        <NotePanel />
      ) : activeChatId ? (
        <ChatThread
          chatId={activeChatId}
          pageImageBase64={pageImageBase64}
          fullPageImageBase64={fullPageImageBase64}
          onBack={() => setActiveChat(null)}
        />
      ) : (
        <>
          {/* Header — single combined label + count */}
          <div className="h-12 border-b border-slate-700 flex items-center px-4">
            <h2 className="text-sm font-medium text-slate-200">Chats &amp; Notes</h2>
            <span className="ml-2 text-xs text-slate-500">{totalCount}</span>
          </div>

          {/* Filter pills — mirror the library's chat / note palette so
              each pill previews its list color. */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800">
            <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </FilterPill>
            <FilterPill active={filter === 'chats'} onClick={() => setFilter('chats')}>
              Chats
            </FilterPill>
            <FilterPill active={filter === 'notes'} onClick={() => setFilter('notes')}>
              Notes
            </FilterPill>
          </div>

          {rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
              <p>
                {filter === 'notes'
                  ? 'No notes yet. Highlight text or drag a region to create one.'
                  : filter === 'chats'
                    ? 'No chats yet. Highlight text or drag a region to start asking.'
                    : 'Click on a slide to start asking questions or writing notes about it.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {rows.map((row) => (
                <button
                  key={`${row.kind}-${row.id}`}
                  onClick={() => handleRowClick(row)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    {row.kind === 'chat' ? (
                      <MessageCircle size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                    ) : (
                      <StickyNote size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-slate-200 truncate">{row.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Page {row.pageNumber}
                        {row.kind === 'chat' && (
                          <>
                            {' · '}
                            {row.messages} message{row.messages !== 1 ? 's' : ''}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface FilterPillProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FilterPill({ active, onClick, children }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
