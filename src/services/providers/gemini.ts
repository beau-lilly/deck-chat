import type { ProviderStreamFn, UsageInfo } from './types';

// Gemini's `contents` parts. Images are inline base64 (no data-URL
// prefix — just the raw base64 data under `inlineData.data`).
type Part =
  | { inlineData: { mimeType: string; data: string } }
  | { text: string };

/**
 * Stream a chat response from Google's Gemini API.
 *
 * Differences worth calling out vs the Anthropic / OpenAI adapters:
 *  - Role mapping: Gemini uses `user` / `model`. We translate our
 *    `assistant` role to `model`.
 *  - System prompt lives in a dedicated top-level `systemInstruction`
 *    field, separate from `contents`.
 *  - Streaming uses `:streamGenerateContent?alt=sse`. Payload is plain
 *    SSE with JSON `data:` lines terminated when the server closes the
 *    stream — no `[DONE]` sentinel like OpenAI.
 *  - Prompt caching: explicit CachedContent requires a separate API
 *    call to create before use — not implemented here. Newer models
 *    (2.0+, 2.5) have IMPLICIT caching for repeated prefixes and
 *    report it via `usageMetadata.cachedContentTokenCount`, which we
 *    map into `UsageInfo.cacheReadInputTokens` for parity with the
 *    other two providers.
 *  - Auth: key goes in the `x-goog-api-key` header (not as a URL
 *    query param) so it doesn't leak into request logs.
 */
export const streamGemini: ProviderStreamFn = async (
  req,
  onChunk,
  onDone,
  onError,
) => {
  const contents: Array<{ role: string; parts: Part[] }> = [];

  for (const msg of req.messages) {
    // Gemini expects `user` / `model` — translate assistant → model.
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (msg.role === 'user' && msg === req.messages[0]) {
      const parts: Part[] = [];
      if (req.fullPageImageBase64) {
        parts.push({ inlineData: { mimeType: 'image/png', data: req.fullPageImageBase64 } });
      }
      if (req.pageImageBase64) {
        parts.push({ inlineData: { mimeType: 'image/png', data: req.pageImageBase64 } });
      }
      parts.push({ text: msg.content });
      contents.push({ role, parts });
    } else {
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  const body = {
    contents,
    ...(req.systemPrompt
      ? { systemInstruction: { parts: [{ text: req.systemPrompt }] } }
      : {}),
    generationConfig: {
      maxOutputTokens: 4096,
    },
  };

  const usage: UsageInfo = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };

  // v1beta has the wider model coverage (all 2.0+ releases live here).
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    req.model,
  )}:streamGenerateContent?alt=sse`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': req.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      // Gemini returns 400 "API key not valid" for bad keys more often
      // than 401, so treat both as auth errors.
      if (response.status === 401 || response.status === 403) {
        onError('Invalid API key. Check your Gemini API key in settings.');
      } else if (response.status === 400 && /api key/i.test(text)) {
        onError('Invalid API key. Check your Gemini API key in settings.');
      } else if (response.status === 429) {
        onError('Rate limited. Please wait and try again.');
      } else {
        onError(`API error ${response.status}: ${text}`);
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
        try {
          const parsed = JSON.parse(data);

          // Errors surfaced mid-stream arrive as `{ error: {...} }`.
          if (parsed.error) {
            onError(parsed.error.message || 'API stream error');
            return;
          }

          // Content: concatenate every text part in this chunk.
          // Occasionally Gemini returns multiple parts per chunk.
          const parts = parsed.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (typeof part.text === 'string' && part.text.length > 0) {
                onChunk(part.text);
              }
            }
          }

          // Usage arrives in final (and sometimes intermediate) chunks.
          // We keep updating so whichever is last wins.
          const u = parsed.usageMetadata;
          if (u) {
            usage.inputTokens = u.promptTokenCount || usage.inputTokens;
            usage.outputTokens = u.candidatesTokenCount || usage.outputTokens;
            // Implicit cache hit count, when present on newer models.
            if (typeof u.cachedContentTokenCount === 'number') {
              usage.cacheReadInputTokens = u.cachedContentTokenCount;
            }
          }
        } catch {
          /* skip malformed chunks */
        }
      }
    }

    onDone(usage);
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
};
