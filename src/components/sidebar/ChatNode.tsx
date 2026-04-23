import { MessageSquare } from 'lucide-react';
import type { SidebarChat } from '../../data/liveQueries';
import { useDocumentStore } from '../../stores/documentStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { classifyClick, usePreviewStore } from '../../stores/previewStore';

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
  const previewed = usePreviewStore((s) => s.previewed);

  const isActive = activeChatId === chat.id;
  const isPreviewed =
    previewed?.kind === 'chat' && previewed.id === chat.id && !isActive;

  // Click cycle:
  //   first click on a not-yet-selected row  → preview (pan + highlight)
  //   click on the previewed row             → open (active chat fills panel)
  //   double-click                           → first of the two onClicks
  //     previews, second reads previewState and opens. Works because the
  //     preview store updates synchronously and the handler re-reads it
  //     via getState().
  //   click on the already-active row        → no-op (already open)
  const handleClick = async () => {
    const mode = classifyClick('chat', chat.id, isActive);
    if (mode === 'noop') return;

    // Whichever outcome (preview or open), if the chat's on a different
    // doc we must hydrate it first so the PDF swap and chat list stay
    // in sync with what we're about to select.
    if (activeDocumentId !== chat.documentId) {
      await openDocument(chat.documentId);
      await loadChatsForDocument(chat.documentId);
    }

    if (mode === 'preview') {
      usePreviewStore.getState().setPreviewed({
        kind: 'chat',
        id: chat.id,
        documentId: chat.documentId,
        anchor: chat.anchor,
      });
      return;
    }

    // mode === 'open' — promote the preview.
    usePreviewStore.getState().clearPreview();
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
          : isPreviewed
            ? 'bg-indigo-600/10 text-indigo-200 ring-1 ring-indigo-500/60'
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
