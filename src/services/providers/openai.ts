import type { ProviderStreamFn, UsageInfo } from './types';
import { modelSupportsVision } from '../../stores/settingsStore';

// OpenAI Chat Completions content parts. Images go as data-URL-wrapped
// `image_url` objects (OpenAI accepts base64 data URLs inline); text
// goes as `text` parts. Follow-up turns are plain strings — same shape
// as Anthropic's behavior.
type ContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string };

/**
 * Stream a chat response from OpenAI's Chat Completions API.
 *
 * Notes on parity with the Anthropic adapter:
 *  - Prompt caching is AUTOMATIC on OpenAI — nothing to opt into. Repeat
 *    prefixes ≥ 1024 tokens get cached server-side and we see the
 *    savings via `prompt_tokens_details.cached_tokens` in the final
 *    usage report.
 *  - `stream_options.include_usage` is required to get usage back in
 *    the stream (otherwise usage is omitted entirely when streaming).
 *  - OpenAI's SSE framing is `data: <json>` lines terminated by
 *    `data: [DONE]`, much simpler than Anthropic's event-type scheme.
 */
export const streamOpenAI: ProviderStreamFn = async (
  req,
  onChunk,
  onDone,
  onError,
) => {
  const messages: Array<{ role: string; content: string | ContentPart[] }> = [];

  if (req.systemPrompt) {
    // "system" role is how OpenAI accepts the instructions + PDF text.
    // Plain string is fine for a system message — content parts aren't
    // needed here.
    messages.push({ role: 'system', content: req.systemPrompt });
  }

  // Text-only reasoning models (o3-mini, o1-mini, …) reject `image_url`
  // parts outright:
  //   "Invalid content type. image_url is only supported by certain models."
  // Fall back to text-only content for those — the system prompt already
  // carries the extracted per-page text via pdfContext, so the model
  // still has plenty to work with, just minus the screenshots.
  const canSendImages = modelSupportsVision(req.model);

  for (const msg of req.messages) {
    if (msg.role === 'user' && msg === req.messages[0]) {
      const content: ContentPart[] = [];
      if (canSendImages && req.fullPageImageBase64) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${req.fullPageImageBase64}` },
        });
      }
      if (canSendImages && req.pageImageBase64) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${req.pageImageBase64}` },
        });
      }
      content.push({ type: 'text', text: msg.content });
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  const usage: UsageInfo = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        messages,
        max_completion_tokens: 4096,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) {
        onError('Invalid API key. Check your OpenAI API key in settings.');
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          onDone(usage);
          return;
        }
        try {
          const parsed = JSON.parse(data);
          // Content chunks arrive as `choices[0].delta.content` strings;
          // final chunk has no delta content but carries `usage`.
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            onChunk(delta);
          }
          if (parsed.usage) {
            usage.inputTokens = parsed.usage.prompt_tokens || 0;
            usage.outputTokens = parsed.usage.completion_tokens || 0;
            // Automatic prompt caching surfaces here. Map into the
            // "cache read" field so the existing ChatThread cache-stats
            // UI lights up the same way it does for Anthropic hits.
            usage.cacheReadInputTokens =
              parsed.usage.prompt_tokens_details?.cached_tokens || 0;
          }
        } catch {
          /* skip malformed chunks — stream tolerates occasional noise */
        }
      }
    }

    onDone(usage);
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
};
