import { ChevronRight, ChevronDown, FileText } from 'lucide-react';
import type { DocumentRecord } from '../../types';
import { useDocumentStore } from '../../stores/documentStore';
import { useChatStore } from '../../stores/chatStore';
import { useLibrarianStore } from '../../stores/librarianStore';
import { useChatsForDocument } from '../../data/liveQueries';
import ChatNode from './ChatNode';

interface Props {
  doc: DocumentRecord;
  depth: number;
}

export default function DocumentNode({ doc, depth }: Props) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const loadChatsForDocument = useChatStore((s) => s.loadChatsForDocument);
  const setSelectedFolderId = useLibrarianStore((s) => s.setSelectedFolderId);
  const expanded = useLibrarianStore((s) => s.expandedDocs.has(doc.id));
  const toggleDocument = useLibrarianStore((s) => s.toggleDocument);
  const isActive = activeDocumentId === doc.id;

  const handleOpen = async () => {
    setSelectedFolderId(doc.folderId);
    await openDocument(doc.id);
    await loadChatsForDocument(doc.id);
  };

  return (
    <div>
      <div
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        className={`group flex items-center gap-1 pr-2 py-1 text-xs rounded transition-colors ${
          isActive ? 'bg-indigo-600/20 text-indigo-200' : 'text-slate-300 hover:bg-slate-800'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleDocument(doc.id);
          }}
          className="p-0.5 rounded hover:bg-slate-700 text-slate-500"
          aria-label={expanded ? 'Collapse chats' : 'Expand chats'}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          onClick={handleOpen}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
          title={doc.name}
        >
          <FileText size={12} className="shrink-0 text-slate-500" />
          <span className="truncate">{doc.name}</span>
        </button>
      </div>

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
