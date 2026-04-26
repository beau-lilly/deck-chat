import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Search, StickyNote, X } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { classifyClick, usePreviewStore } from '../../stores/previewStore';
import { useNotesForDocument } from '../../data/liveQueries';
import { useChatNoteSearch, type SearchResult } from '../../services/searchIndex';
import ChatThread from './ChatThread';
import NotePanel from '../notes/NotePanel';
import ResizeHandle from '../layout/ResizeHandle';
import type { ChatAnchor } from '../../types';

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
  const loadChatsForDocument = useChatStore((s) => s.loadChatsForDocument);
  const activeNote = useNoteStore((s) => s.activeNote);
  const openNote = useNoteStore((s) => s.openNote);
  const closeNote = useNoteStore((s) => s.closeNote);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const chatPanelWidth = useLayoutStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useLayoutStore((s) => s.setChatPanelWidth);
  const previewed = usePreviewStore((s) => s.previewed);

  // Cross-document full-text search across every chat (titles + message
  // bodies) and every note (titles + markdown bodies). When the input
  // has a query, the filter pills hide and the list view is replaced
  // with ranked search results — clicking one swaps to that doc and
  // opens the chat/note. Empty input → normal scoped-to-active-doc
  // list view.
  const [searchQuery, setSearchQuery] = useState('');
  const searchResults = useChatNoteSearch(searchQuery);
  const searching = searchQuery.trim().length > 0;

  // Notes live in IndexedDB (via liveQuery) rather than zustand state —
  // they'd balloon the in-memory store since bodies can be long and
  // users are likely to accumulate many. The sidebar already uses this
  // hook; we reuse it here for the right panel's list.
  const notes = useNotesForDocument(activeDocumentId ?? '');

  const [filter, setFilter] = useState<Filter>('all');

  // Gate the width transition so it only animates on open/close toggles
  // and NOT on resize-drag. With the transition always on, dragging the
  // resize handle caused the outer wrapper's width to lag ~100ms behind
  // the inner's snapped width. The inner (width = chatPanelWidth) was
  // correct for the cursor, but the outer (also width = chatPanelWidth
  // but animated) was wider — leaving a transparent gap on the right of
  // the inner where bg-slate-950 bled through, so the chat panel looked
  // like it had "come off" the right edge of the screen. Animating only
  // on toggle lets the drag path stay crisp.
  const [animateWidth, setAnimateWidth] = useState(false);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;
    setAnimateWidth(true);
    const t = window.setTimeout(() => setAnimateWidth(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  // Build a single unified list, sorted by anchor position (page →
  // y → x) so chats and notes that live on the same page sit next
  // to each other. Matches the sidebar's ordering so the right
  // panel doesn't feel inconsistent.
  type Row =
    | { kind: 'chat'; id: string; title: string; pageNumber: number; y: number; x: number; anchor: ChatAnchor; messages: number }
    | { kind: 'note'; id: string; title: string; pageNumber: number; y: number; x: number; anchor: ChatAnchor };

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
          anchor: c.anchor,
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
          anchor: n.anchor,
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

  const totalCount = chats.filter((c) => !c.archived).length + notes.length;

  // Same preview → open cycle as the left sidebar nodes. First click
  // on an unselected row previews (pan + highlight); a second click on
  // the previewed row opens. Double-click opens directly because React
  // fires onClick twice in a native dblclick — the first previews, the
  // second promotes to open.
  const handleRowClick = (row: Row) => {
    const isActive =
      row.kind === 'chat' ? activeChatId === row.id : activeNote?.id === row.id;
    const mode = classifyClick(row.kind, row.id, isActive);
    if (mode === 'noop') return;

    if (mode === 'preview') {
      // Doc is already loaded (right-panel rows come from the active
      // doc's chats/notes), so we don't need to openDocument here.
      usePreviewStore.getState().setPreviewed({
        kind: row.kind,
        id: row.id,
        documentId: activeDocumentId ?? '',
        anchor: row.anchor,
      });
      return;
    }

    // mode === 'open' — promote preview, route the panel.
    usePreviewStore.getState().clearPreview();
    if (row.kind === 'chat') {
      closeNote();
      setActiveChat(row.id);
    } else {
      setActiveChat(null);
      void openNote(row.id);
    }
  };

  // Search-result clicks cycle preview → open just like the regular
  // list rows (and the left sidebar nodes):
  //
  //   1st click on an unselected row     → preview (pan PDF + highlight)
  //   2nd click on the previewed row     → open (route the panel)
  //   double-click                       → first onClick previews, the
  //                                        second reads the preview store
  //                                        and opens. No separate
  //                                        onDoubleClick handler needed.
  //
  // Different from `handleRowClick` for the local list because search
  // results can live on a different document than the one currently
  // open. We have to hydrate that doc BEFORE classifying — that way
  // the second click of a double-click (which fires before React
  // re-renders, while the first click's `await openDocument` may
  // still be in flight) reads the freshest state via `getState()`
  // and correctly sees the preview the first click just set.
  const handleSearchResultClick = async (result: SearchResult) => {
    if (useDocumentStore.getState().activeDocumentId !== result.documentId) {
      await openDocument(result.documentId);
      await loadChatsForDocument(result.documentId);
    }

    const mode = classifyClick(result.kind, result.id, false);

    if (mode === 'preview') {
      // Don't clear the search query — user might want to keep
      // browsing other results before committing to one.
      usePreviewStore.getState().setPreviewed({
        kind: result.kind,
        id: result.id,
        documentId: result.documentId,
        anchor: result.anchor,
      });
      return;
    }

    // mode === 'open' — promote preview, route the panel, clear search.
    usePreviewStore.getState().clearPreview();
    if (result.kind === 'chat') {
      closeNote();
      setActiveChat(result.id);
    } else {
      setActiveChat(null);
      await openNote(result.id);
    }
    setSearchQuery('');
  };

  // Outer wrapper animates width 0 ↔ chatPanelWidth for a smooth
  // collapse/expand. Matches the left Sidebar: fixed-width inner +
  // overflow-hidden wrapper so content doesn't reflow mid-animation.
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      style={{ width: open ? `${chatPanelWidth}px` : '0px' }}
      className={`shrink-0 overflow-hidden h-full ${animateWidth ? 'transition-[width] duration-200 ease-out' : ''}`}
    >
    <div
      style={{ width: `${chatPanelWidth}px` }}
      className="relative h-full bg-slate-900 border-l border-slate-700 flex flex-col"
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

          {/* Cross-document search. Empty → normal active-doc list
              with filter pills below. Non-empty → search results
              replace the list and the filter pills hide (filtering
              alongside searching would be a confusing two-axis UX
              and isn't what users want here). */}
          <div className="px-3 py-2 border-b border-slate-800">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchQuery('');
                  }
                }}
                placeholder="Search chats &amp; notes…"
                className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {!searching && (
            // Filter pills — mirror the library's chat / note palette so
            // each pill previews its list color.
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
          )}

          {searching ? (
            searchResults.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs px-6 text-center">
                <p>
                  No matches for &ldquo;{searchQuery.trim()}&rdquo;
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {searchResults.map((result) => {
                  // Same preview ring vocabulary as the regular list
                  // rows: indigo for chats, amber for notes. Tells the
                  // user "this result is selected; another click will
                  // open it".
                  const isPreviewed =
                    previewed?.kind === result.kind && previewed.id === result.id;
                  const previewRing =
                    isPreviewed &&
                    (result.kind === 'chat'
                      ? 'bg-indigo-600/10 ring-1 ring-inset ring-indigo-500/60'
                      : 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/60');
                  return (
                    <button
                      key={`${result.kind}-${result.id}`}
                      onClick={() => {
                        void handleSearchResultClick(result);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 transition-colors group ${previewRing || ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {result.kind === 'chat' ? (
                          <MessageCircle size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                        ) : (
                          <StickyNote size={14} className="text-amber-400 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-200 truncate">{result.title}</div>
                          {/* Snippet shows the body excerpt around the
                              first matched term. Skipped when the body
                              is empty (e.g. an unwritten note whose only
                              content is the title itself). */}
                          {result.snippet && (
                            <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                              {result.snippet}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 mt-1 truncate">
                            {result.documentName || 'Unknown document'} &middot; p.
                            {result.anchor.pageNumber}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
              <p>
                {filter === 'notes'
                  ? 'No notes yet. Highlight text or drag a region to create one.'
                  : filter === 'chats'
                    ? 'No chats yet. Highlight text or drag a region to start asking.'
                    : 'Highlight text or drag a region on a slide to start asking questions or writing notes about it.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {rows.map((row) => {
                const isPreviewed =
                  previewed?.kind === row.kind && previewed.id === row.id;
                const previewRing =
                  isPreviewed &&
                  (row.kind === 'chat'
                    ? 'bg-indigo-600/10 ring-1 ring-inset ring-indigo-500/60'
                    : 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/60');
                return (
                <button
                  key={`${row.kind}-${row.id}`}
                  onClick={() => handleRowClick(row)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 transition-colors group ${previewRing || ''}`}
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
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
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
