import type { ProviderStreamFn, UsageInfo } from './types';

// Anthropic's native message content blocks. The first user message
// sends the anchored-region image (and optionally the full-page image
// for "slide" context mode) alongside the typed question; follow-up
// turns are text-only since the assistant has already "seen" the page.
type ContentBlock =
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }
  | { type: 'text'; text: string };

/**
 * Stream a chat response from Anthropic's Messages API.
 *
 * Uses the prompt-caching beta header so the large system prompt (which
 * embeds extracted PDF text) stays in Anthropic's cache for the rest of
 * the chat — drops cost/latency dramatically on follow-up turns.
 */
export const streamAnthropic: ProviderStreamFn = async (
  req,
  onChunk,
  onDone,
  onError,
) => {
  const anthropicMessages: Array<{
    role: string;
    content: string | ContentBlock[];
  }> = [];

  for (const msg of req.messages) {
    if (msg.role === 'user' && msg === req.messages[0]) {
      const content: ContentBlock[] = [];
      if (req.fullPageImageBase64) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: req.fullPageImageBase64 },
        });
      }
      if (req.pageImageBase64) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: req.pageImageBase64 },
        });
      }
      content.push({ type: 'text', text: msg.content });
      anthropicMessages.push({ role: 'user', content });
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const usage: UsageInfo = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };

  const systemBlock = req.systemPrompt
    ? [
        {
          type: 'text' as const,
          text: req.systemPrompt,
          // Ephemeral cache = Anthropic caches the prefix of this
          // message for ~5 min. Saves on repeat calls in a chat session.
          cache_control: { type: 'ephemeral' as const },
        },
      ]
    : undefined;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: 4096,
        stream: true,
        ...(systemBlock ? { system: systemBlock } : {}),
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) {
        onError('Invalid API key. Check your Anthropic API key in settings.');
      } else if (response.status === 429) {
        onError('Rate limited. Please wait and try again.');
      } else {
        onError(`API error ${response.status}: ${body}`);
      }
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (currentEvent === 'message_start') {
            try {
              const parsed = JSON.parse(data);
              const u = parsed.message?.usage;
              if (u) {
                usage.inputTokens = u.input_tokens || 0;
                usage.outputTokens = u.output_tokens || 0;
                usage.cacheCreationInputTokens = u.cache_creation_input_tokens || 0;
                usage.cacheReadInputTokens = u.cache_read_input_tokens || 0;
              }
            } catch {
              /* skip */
            }
          }

          if (currentEvent === 'message_delta') {
            try {
              const parsed = JSON.parse(data);
              const u = parsed.usage;
              if (u) {
                usage.outputTokens = u.output_tokens || usage.outputTokens;
              }
            } catch {
              /* skip */
            }
          }

          if (currentEvent === 'message_stop') {
            onDone(usage);
            return;
          }

          if (currentEvent === 'content_block_delta') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.delta?.type === 'text_delta') {
                onChunk(parsed.delta.text);
              }
            } catch {
              /* skip malformed chunks */
            }
          }

          if (currentEvent === 'error') {
            try {
              const parsed = JSON.parse(data);
              onError(parsed.error?.message || 'API stream error');
              return;
            } catch {
              /* skip */
            }
          }
        }
      }
    }

    onDone(usage);
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
};
