import { streamAnthropic } from './providers/anthropic';
import { streamOpenAI } from './providers/openai';
import { streamGemini } from './providers/gemini';
import type { LlmRequest, UsageInfo } from './providers/types';
import { getModelInfo } from '../stores/settingsStore';

export type { LlmRequest, UsageInfo };

/**
 * Streaming chat entrypoint — dispatches to the right provider adapter
 * based on the model in `req.model`. Adapters translate our neutral
 * `LlmRequest` shape into each provider's wire format; the component
 * layer (ChatThread, AppLayout, pdfContext) never needs to know which
 * provider it's talking to.
 */
export async function streamChat(
  req: LlmRequest,
  onChunk: (text: string) => void,
  onDone: (usage?: UsageInfo) => void,
  onError: (err: string) => void,
) {
  const info = getModelInfo(req.model);
  if (!info) {
    onError(`Unknown model: ${req.model}`);
    return;
  }
  switch (info.provider) {
    case 'anthropic':
      return streamAnthropic(req, onChunk, onDone, onError);
    case 'openai':
      return streamOpenAI(req, onChunk, onDone, onError);
    case 'gemini':
      return streamGemini(req, onChunk, onDone, onError);
  }
}
