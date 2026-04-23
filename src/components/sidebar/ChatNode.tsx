import { MessageSquare } from 'lucide-react';
import type { SidebarChat } from '../../data/liveQueries';
import { useDocumentStore } from '../../stores/documentStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';

interface Props {
  chat: SidebarChat;
  depth: number;
}

export default function ChatNode({ chat, depth }: Props) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const loadChatsForDocument = useChatStore((s) => s.loadChatsForDocument);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const activeChatId = useChatStore((s) => s.activeChatId);

  const isActive = activeChatId === chat.id;

  const handleClick = async () => {
    // If the user is clicking a chat on a document that isn't open yet,
    // hydrate it first so the chat list in `chatStore` matches what we're
    // about to activate.
    if (activeDocumentId !== chat.documentId) {
      await openDocument(chat.documentId);
      await loadChatsForDocument(chat.documentId);
    }
    // Close any open note so the right panel switches to the chat
    // thread instead of staying stuck on the note.
    useNoteStore.getState().closeNote();
    setActiveChat(chat.id);
  };

  return (
    <button
      onClick={handleClick}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      className={`w-full flex items-center gap-1.5 pr-2 py-1 text-[11px] text-left rounded transition-colors ${
        isActive
          ? 'bg-indigo-600/30 text-indigo-100'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
      title={`p.${chat.anchor.pageNumber} — ${chat.title}`}
    >
      <MessageSquare size={11} className="shrink-0 text-slate-500" />
      <span className="text-slate-500 shrink-0 tabular-nums">
        p.{chat.anchor.pageNumber}
      </span>
      <span className="truncate">{chat.title}</span>
    </button>
  );
}
