import type { Message } from '../../types';

// Provider-neutral request shape that each adapter translates into its
// own wire format. New providers only need to implement a function
// matching `ProviderStreamFn` — the rest of the app (ChatThread,
// pdfContext, settings UI) stays provider-agnostic.
export interface LlmRequest {
  apiKey: string;
  /** The provider-native model identifier (e.g. "claude-opus-4-…" or "gpt-4o"). */
  model: string;
  messages: Message[];
  /** Cropped region of the anchored page (base64 PNG, no data URL prefix). */
  pageImageBase64?: string;
  /** Full anchored page (base64 PNG). Only set for the "slide" context mode. */
  fullPageImageBase64?: string;
  /** Combined instructions + extracted document/slide text. */
  systemPrompt?: string;
}

// Unified usage accounting across providers. Fields that don't apply to
// a given provider stay at 0 (e.g. Anthropic reports cache creation
// separately; OpenAI's automatic caching only reports cached read
// tokens via `prompt_tokens_details.cached_tokens`).
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export type ProviderStreamFn = (
  req: LlmRequest,
  onChunk: (text: string) => void,
  onDone: (usage?: UsageInfo) => void,
  onError: (err: string) => void,
) => Promise<void>;
