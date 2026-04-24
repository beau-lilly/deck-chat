import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import {
  useSettingsStore,
  getApiKeyFor,
  getModelInfo,
} from '../../stores/settingsStore';
import { useDocumentStore } from '../../stores/documentStore';
import { streamChat, type UsageInfo } from '../../services/llm';
import { buildContextForMode } from '../../services/pdfContext';
import Markdown from '../shared/Markdown';
import AutoGrowTextarea from '../shared/AutoGrowTextarea';

interface ChatThreadProps {
  chatId: string;
  pageImageBase64?: string;
  fullPageImageBase64?: string;
  onBack: () => void;
}

export default function ChatThread({ chatId, pageImageBase64, fullPageImageBase64, onBack }: ChatThreadProps) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const { addMessage, updateLastAssistantMessage, markResponseStarted } = useChatStore();
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  // Pull the store state so getApiKeyFor can read whichever key the
  // selected model's provider needs. Re-renders whenever either key
  // changes, so swapping a key triggers the auto-send effect below.
  const apiKey = useSettingsStore((s) => getApiKeyFor(s, selectedModel));
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);
  // Name shown to the user in auth-error messages. Stays in sync with
  // whichever provider is backing the selected model.
  const providerName = (() => {
    const p = getModelInfo(selectedModel)?.provider;
    if (p === 'openai') return 'OpenAI';
    if (p === 'gemini') return 'Gemini';
    return 'Anthropic';
  })();
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

  const handleError = (chatId: string, err: string, isMounted: () => boolean) => {
    const isAuthError = err.includes('Invalid API key') || err.includes('401');
    const errorMsg = isAuthError
      ? `Invalid API key. Please update your ${providerName} API key in Settings.`
      : `Error: ${err}`;
    updateLastAssistantMessage(chatId, errorMsg);
    if (isAuthError) setShowSettings(true);
    if (isMounted()) setIsStreaming(false);
  };

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
    if (!apiKey) {
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
        apiKey,
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
      (err) => handleError(chatId, err, () => mountedRef.current),
    );
  };

  const sendFollowUp = async (content: string) => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    addMessage(chatId, 'user', content);
    addMessage(chatId, 'assistant', '');
    setIsStreaming(true);
    streamingRef.current = '';

    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat) return;

    // Pass images on every turn, not just the first. The provider
    // adapters attach them to the first user message in the array so
    // the model keeps a consistent multimodal context across the
    // conversation — otherwise Gemini reports itself as "text-based"
    // once the images drop off, and Anthropic/OpenAI start
    // hallucinating about what they can see.
    await streamChat(
      {
        apiKey,
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
        setIsStreaming(false);
      },
      (err) => handleError(chatId, err, () => true),
    );
  };

  // Auto-send the first message once when the thread opens. Re-runs
  // if the user opens a different chat or swaps into a provider whose
  // key is configured (e.g. enters a key mid-flow after an auth
  // failure), since `apiKey` is derived from the selected model.
  useEffect(() => {
    const currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!currentChat?.needsResponse || !apiKey) return;
    sendFirstMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, apiKey]);

  // Extracted so both the form's onSubmit (Send button) and the
  // textarea's Enter-to-submit path share one code path. Shift+Enter
  // still inserts a newline via the textarea's default behavior.
  const submit = () => {
    if (!input.trim() || isStreaming) return;
    const msg = input.trim();
    setInput('');
    sendFollowUp(msg);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
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
            {msg.content ? (
              msg.role === 'assistant' ? (
                // Assistant output comes through the markdown renderer
                // (headings, lists, tables, code, etc.); user text stays
                // in plain-pre so they see exactly what they typed.
                <Markdown content={msg.content} />
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              )
            ) : isStreaming && msg.role === 'assistant' ? (
              <Loader2 size={14} className="animate-spin text-slate-500" />
            ) : null}
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

      {/* Input — auto-grows with content. items-end so the Send button
          stays aligned to the bottom of the growing textarea, and the
          messages area above shrinks as the composer expands (since
          the messages div is flex-1 in the panel's column). */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700 shrink-0">
        <div className="flex items-end gap-2">
          <AutoGrowTextarea
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder="Ask a follow-up..."
            disabled={isStreaming}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm leading-relaxed text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
