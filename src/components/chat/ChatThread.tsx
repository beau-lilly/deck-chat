import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDocumentStore } from '../../stores/documentStore';
import { streamChat, type UsageInfo } from '../../services/llm';
import { buildContextForMode } from '../../services/pdfContext';

interface ChatThreadProps {
  chatId: string;
  pageImageBase64?: string;
  fullPageImageBase64?: string;
  onBack: () => void;
}

export default function ChatThread({ chatId, pageImageBase64, fullPageImageBase64, onBack }: ChatThreadProps) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const { addMessage, updateLastAssistantMessage, markResponseStarted } = useChatStore();
  const { anthropicApiKey, selectedModel } = useSettingsStore();
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);
  const pageTexts = useDocumentStore((s) => s.pageTexts);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastUsage, setLastUsage] = useState<UsageInfo | null>(null);
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

  const contextMode = chat.contextMode || 'selection';
  const { systemPrompt, includeFullPageImage } = buildContextForMode(
    chat.anchor,
    contextMode,
    pageTexts,
  );

  const handleDone = (usage?: UsageInfo) => {
    if (usage) {
      setLastUsage(usage);
      const cacheStatus = usage.cacheReadInputTokens > 0
        ? `CACHE HIT (${usage.cacheReadInputTokens} tokens read from cache)`
        : usage.cacheCreationInputTokens > 0
          ? `CACHE WRITE (${usage.cacheCreationInputTokens} tokens written to cache)`
          : 'NO CACHE';
      console.log(
        `[Deck Chat] ${cacheStatus} | Input: ${usage.inputTokens} | Output: ${usage.outputTokens} | Cache created: ${usage.cacheCreationInputTokens} | Cache read: ${usage.cacheReadInputTokens}`
      );
    }
  };

  const sendFirstMessage = async () => {
    if (!anthropicApiKey) {
      setShowSettings(true);
      return;
    }

    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat || !currentChat.needsResponse) return;

    markResponseStarted(chatId);

    addMessage(chatId, 'assistant', '');
    setIsStreaming(true);
    streamingRef.current = '';

    await streamChat(
      {
        apiKey: anthropicApiKey,
        model: selectedModel,
        messages: currentChat.messages,
        pageImageBase64,
        fullPageImageBase64: includeFullPageImage ? fullPageImageBase64 : undefined,
        systemPrompt,
      },
      (chunk) => {
        streamingRef.current += chunk;
        updateLastAssistantMessage(chatId, streamingRef.current);
      },
      (usage) => {
        handleDone(usage);
        if (mountedRef.current) setIsStreaming(false);
      },
      (err) => {
        updateLastAssistantMessage(chatId, `Error: ${err}`);
        if (mountedRef.current) setIsStreaming(false);
      },
    );
  };

  const sendFollowUp = async (content: string) => {
    if (!anthropicApiKey) {
      setShowSettings(true);
      return;
    }

    addMessage(chatId, 'user', content);
    addMessage(chatId, 'assistant', '');
    setIsStreaming(true);
    streamingRef.current = '';

    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat) return;

    await streamChat(
      {
        apiKey: anthropicApiKey,
        model: selectedModel,
        messages: currentChat.messages,
        systemPrompt,
      },
      (chunk) => {
        streamingRef.current += chunk;
        updateLastAssistantMessage(chatId, streamingRef.current);
      },
      (usage) => {
        handleDone(usage);
        setIsStreaming(false);
      },
      (err) => {
        updateLastAssistantMessage(chatId, `Error: ${err}`);
        setIsStreaming(false);
      },
    );
  };

  // Auto-send the first message once when the thread opens.
  useEffect(() => {
    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat?.needsResponse || !anthropicApiKey) return;
    sendFirstMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, anthropicApiKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const msg = input.trim();
    setInput('');
    sendFollowUp(msg);
  };

  const modeLabel = contextMode === 'selection' ? 'Selection' : contextMode === 'slide' ? 'Slide' : 'Full Doc';

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
        <span className="text-sm text-slate-200 truncate flex-1">{chat.title}</span>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{modeLabel}</span>
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

      {/* Cache usage indicator */}
      {lastUsage && (
        <div className="px-3 py-1.5 border-t border-slate-700/50 text-[11px] text-slate-500 flex items-center gap-2">
          {lastUsage.cacheReadInputTokens > 0 ? (
            <span className="text-emerald-500">
              Cache hit: {lastUsage.cacheReadInputTokens.toLocaleString()} tokens cached
            </span>
          ) : lastUsage.cacheCreationInputTokens > 0 ? (
            <span className="text-amber-500">
              Cache written: {lastUsage.cacheCreationInputTokens.toLocaleString()} tokens
            </span>
          ) : (
            <span>No cache</span>
          )}
          <span className="text-slate-600">|</span>
          <span>In: {lastUsage.inputTokens.toLocaleString()}</span>
          <span>Out: {lastUsage.outputTokens.toLocaleString()}</span>
        </div>
      )}

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
