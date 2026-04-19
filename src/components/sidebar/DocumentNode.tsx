import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Pencil, Trash2, MoreVertical } from 'lucide-react';
import type { DocumentRecord } from '../../types';
import { useDocumentStore } from '../../stores/documentStore';
import { useChatStore } from '../../stores/chatStore';
import { useLibrarianStore } from '../../stores/librarianStore';
import { useChatsForDocument } from '../../data/liveQueries';
import { repo } from '../../data/repo';
import ChatNode from './ChatNode';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import InlineEditor from './InlineEditor';
import { setActiveDrag } from './dragPayload';

interface Props {
  doc: DocumentRecord;
  depth: number;
}

export default function DocumentNode({ doc, depth }: Props) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const clearDocument = useDocumentStore((s) => s.clearDocument);
  const loadChatsForDocument = useChatStore((s) => s.loadChatsForDocument);
  const setSelectedFolderId = useLibrarianStore((s) => s.setSelectedFolderId);
  const expanded = useLibrarianStore((s) => s.expandedDocs.has(doc.id));
  const toggleDocument = useLibrarianStore((s) => s.toggleDocument);
  const editingId = useLibrarianStore((s) => s.editingId);
  const setEditingId = useLibrarianStore((s) => s.setEditingId);
  const isEditing = editingId === doc.id;
  const isActive = activeDocumentId === doc.id;

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // mousedown(button=2) + contextmenu, both capture-phase — see FolderNode
  // for the reasoning behind the double-listener Safari workaround.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu((prev) => prev ?? { x: e.clientX, y: e.clientY });
    };

    el.addEventListener('mousedown', onMouseDown, { capture: true });
    el.addEventListener('contextmenu', onContextMenu, { capture: true });
    return () => {
      el.removeEventListener('mousedown', onMouseDown, { capture: true } as EventListenerOptions);
      el.removeEventListener('contextmenu', onContextMenu, { capture: true } as EventListenerOptions);
    };
  }, []);

  const handleOpen = async () => {
    setSelectedFolderId(doc.folderId);
    await openDocument(doc.id);
    await loadChatsForDocument(doc.id);
  };

  const handleRename = () => {
    setEditingId(doc.id);
  };

  // Drag source only — documents aren't drop targets.
  const canDrag = !isEditing;
  const onDragStart = (e: React.DragEvent) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', doc.name);
    setActiveDrag({ kind: 'document', id: doc.id });
  };
  const onDragEnd = () => {
    setActiveDrag(null);
  };

  const handleDelete = async () => {
    const ok = window.confirm(
      `Delete "${doc.name}" and all of its chats? This cannot be undone.`,
    );
    if (!ok) return;
    await repo.deleteDocument(doc.id);
    // If the deleted doc is currently open, tear down the PDF viewer state
    // so we don't leave a stale blob URL pointing at nothing.
    if (activeDocumentId === doc.id) {
      clearDocument();
      useChatStore.setState({ chats: [], activeChatId: null });
    }
  };

  const items: ContextMenuItem[] = [
    { label: 'Rename', icon: <Pencil size={12} />, onClick: handleRename },
    {
      label: 'Delete',
      icon: <Trash2 size={12} />,
      onClick: handleDelete,
      destructive: true,
    },
  ];

  return (
    <div>
      <div
        ref={rowRef}
        data-ctx-row="1"
        draggable={canDrag}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        className={`group flex items-center gap-1 pr-2 py-1 text-xs rounded select-none transition-colors ${
          isActive ? 'bg-indigo-600/20 text-indigo-200' : 'text-slate-300 hover:bg-slate-800'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleDocument(doc.id);
          }}
          className="p-0.5 rounded hover:bg-slate-700 text-slate-500 shrink-0"
          aria-label={expanded ? 'Collapse chats' : 'Expand chats'}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {isEditing ? (
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <FileText size={12} className="shrink-0 text-slate-500" />
            <InlineEditor
              initialValue={doc.name}
              selectBasename
              onCommit={async (newName) => {
                await repo.renameDocument(doc.id, newName);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              className="flex-1 min-w-0"
            />
          </div>
        ) : (
          <button
            onClick={handleOpen}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
            title={doc.name}
          >
            <FileText size={12} className="shrink-0 text-slate-500" />
            <span className="truncate">{doc.name}</span>
          </button>
        )}

        {/* Kebab trigger — always-available fallback so users whose right-
            click is blocked by an extension can still reach rename/delete. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            const MENU_WIDTH_ESTIMATE = 180;
            setMenu({ x: rect.right - MENU_WIDTH_ESTIMATE, y: rect.bottom + 2 });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title="More actions"
          aria-label="More actions"
          aria-haspopup="menu"
        >
          <MoreVertical size={12} />
        </button>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}

      {expanded && <ChatsSubtree documentId={doc.id} depth={depth + 1} />}
    </div>
  );
}

// Rendered only when the document is expanded so the liveQuery subscription
// is scoped to the user's actual interest — collapsing a document unmounts
// the subscription.
function ChatsSubtree({ documentId, depth }: { documentId: string; depth: number }) {
  const chats = useChatsForDocument(documentId);

  if (chats.length === 0) {
    return (
      <div
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className="py-1 text-[11px] text-slate-600 italic"
      >
        No chats yet
      </div>
    );
  }

  return (
    <div>
      {chats.map((chat) => (
        <ChatNode key={chat.id} chat={chat} depth={depth} />
      ))}
    </div>
  );
}
