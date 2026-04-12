import type { Message } from '../types';

interface LlmRequest {
  apiKey: string;
  model: string;
  messages: Message[];
  pageImageBase64?: string;
  systemPrompt?: string;
}

export async function streamChat(
  req: LlmRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  const openRouterMessages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }> = [];

  if (req.systemPrompt) {
    openRouterMessages.push({ role: 'system', content: req.systemPrompt });
  }

  for (const msg of req.messages) {
    if (msg.role === 'user' && msg === req.messages[0] && req.pageImageBase64) {
      // First user message: include the page image
      openRouterMessages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${req.pageImageBase64}` },
          },
          { type: 'text', text: msg.content },
        ],
      });
    } else {
      openRouterMessages.push({ role: msg.role, content: msg.content });
    }
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Deck Chat',
      },
      body: JSON.stringify({
        model: req.model,
        messages: openRouterMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      onError(`API error ${response.status}: ${body}`);
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
        if (data === '[DONE]') {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch {
          // skip malformed chunks
        }
      }
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
}
