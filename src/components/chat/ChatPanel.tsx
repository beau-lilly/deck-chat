import { MessageCircle } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import ChatThread from './ChatThread';

interface ChatPanelProps {
  open: boolean;
  pageImageBase64?: string;
}

export default function ChatPanel({ open, pageImageBase64 }: ChatPanelProps) {
  if (!open) return null;

  const { chats, activeChatId, setActiveChat } = useChatStore();

  // If a chat is active, show the thread
  if (activeChatId) {
    return (
      <div className="w-96 h-full bg-slate-900 border-l border-slate-700 shrink-0">
        <ChatThread
          chatId={activeChatId}
          pageImageBase64={pageImageBase64}
          onBack={() => setActiveChat(null)}
        />
      </div>
    );
  }

  // Otherwise show the chat list
  const sortedChats = [...chats]
    .filter((c) => !c.archived)
    .sort((a, b) => {
      if (a.anchor.pageNumber !== b.anchor.pageNumber) return a.anchor.pageNumber - b.anchor.pageNumber;
      return a.anchor.y - b.anchor.y;
    });

  return (
    <div className="w-96 h-full bg-slate-900 border-l border-slate-700 flex flex-col shrink-0">
      <div className="h-12 border-b border-slate-700 flex items-center px-4">
        <h2 className="text-sm font-medium text-slate-200">Chats</h2>
        <span className="ml-2 text-xs text-slate-500">{sortedChats.length}</span>
      </div>

      {sortedChats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
          <p>Click on a slide to start asking questions about it.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {sortedChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setActiveChat(chat.id)}
              className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 transition-colors group"
            >
              <div className="flex items-start gap-2">
                <MessageCircle size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 truncate">{chat.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Page {chat.anchor.pageNumber} &middot; {chat.messages.length} message{chat.messages.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
