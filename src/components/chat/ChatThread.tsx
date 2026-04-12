import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { streamChat } from '../../services/llm';
import { buildSystemPrompt } from '../../services/pdfContext';

interface ChatThreadProps {
  chatId: string;
  pageImageBase64?: string;
  onBack: () => void;
}

export default function ChatThread({ chatId, pageImageBase64, onBack }: ChatThreadProps) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const { addMessage, updateLastAssistantMessage, markResponseStarted } = useChatStore();
  const { openRouterApiKey, selectedModel } = useSettingsStore();
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef('');
  const mountedRef = useRef(true);

  // Track mount status for safe local state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages]);

  if (!chat) return null;

  const sendFirstMessage = async () => {
    if (!openRouterApiKey) {
      setShowSettings(true);
      return;
    }

    // Get fresh state
    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat || !currentChat.needsResponse) return;

    // Atomically mark as started so no other mount can also fire
    markResponseStarted(chatId);

    addMessage(chatId, 'assistant', '');
    setIsStreaming(true);
    streamingRef.current = '';

    await streamChat(
      {
        apiKey: openRouterApiKey,
        model: selectedModel,
        messages: currentChat.messages,
        pageImageBase64,
        systemPrompt: buildSystemPrompt(currentChat.anchor),
      },
      (chunk) => {
        // Always update the store — it's global and safe
        streamingRef.current += chunk;
        updateLastAssistantMessage(chatId, streamingRef.current);
      },
      () => { if (mountedRef.current) setIsStreaming(false); },
      (err) => {
        updateLastAssistantMessage(chatId, `Error: ${err}`);
        if (mountedRef.current) setIsStreaming(false);
      },
    );
  };

  const sendFollowUp = async (content: string) => {
    if (!openRouterApiKey) {
      setShowSettings(true);
      return;
    }

    addMessage(chatId, 'user', content);
    addMessage(chatId, 'assistant', '');
    setIsStreaming(true);
    streamingRef.current = '';

    // Get fresh messages after adding the user message
    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat) return;

    await streamChat(
      {
        apiKey: openRouterApiKey,
        model: selectedModel,
        messages: currentChat.messages,
        systemPrompt: buildSystemPrompt(currentChat.anchor),
      },
      (chunk) => {
        streamingRef.current += chunk;
        updateLastAssistantMessage(chatId, streamingRef.current);
      },
      () => setIsStreaming(false),
      (err) => {
        updateLastAssistantMessage(chatId, `Error: ${err}`);
        setIsStreaming(false);
      },
    );
  };

  // Auto-send the first message once when the thread opens.
  // Uses store flag (needsResponse) instead of a local ref to survive StrictMode double-mount.
  // Does NOT abort on cleanup — the streaming writes to the global store and must complete.
  useEffect(() => {
    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat?.needsResponse || !openRouterApiKey) return;
    sendFirstMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, openRouterApiKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const msg = input.trim();
    setInput('');
    sendFollowUp(msg);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 border-b border-slate-700 flex items-center px-3 gap-2 shrink-0">
        <button
          onClick={onBack}
          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm text-slate-200 truncate">{chat.title}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {chat.messages.map((msg) => (
          <div key={msg.id} className={`text-sm ${msg.role === 'user' ? 'text-slate-300' : 'text-slate-100'}`}>
            <div className={`text-xs font-medium mb-1 ${msg.role === 'user' ? 'text-indigo-400' : 'text-emerald-400'}`}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">
              {msg.content || (isStreaming && msg.role === 'assistant' ? (
                <Loader2 size={14} className="animate-spin text-slate-500" />
              ) : null)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up..."
            disabled={isStreaming}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
