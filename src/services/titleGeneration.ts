import { streamChat } from './llm';
import type { Message } from '../types';
import type { ProviderId } from '../stores/settingsStore';

/**
 * Per-provider "cheapest fast text model" used for auto-titling chats.
 * Deliberately avoids reasoning models (o3-mini et al) — titling is a
 * trivial summarization task where reasoning-model latency + thinking
 * tokens are pure waste. All three of these run single-digit ms and
 * cost fractions of a cent per title.
 *
 * Keep in sync with the registry in settingsStore.ts: these ids must
 * exist there or the provider adapters will reject the request.
 */
const TITLE_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.4-nano',
  gemini: 'gemini-2.5-flash-lite',
};

// Tight budget — a good title is at most ~8 words. Cap input too so a
// pasted essay doesn't balloon the summarization prompt. Selections
// can be long (pasted paragraphs) so they get their own cap.
const MAX_INPUT_CHARS = 2000;
const MAX_SELECTION_CHARS = 800;
const MAX_TITLE_CHARS = 80;

// Explicitly instructs the model to title the TOPIC, not the question.
// Without this the model happily titled short referential questions
// like "what is this?" → "What Is This", because it had nothing else
// to summarize. Examples anchor the behavior for small/fast models
// whose zero-shot instruction following isn't always reliable.
const SYSTEM_PROMPT = [
  'You generate short chat titles. Each chat starts with the user highlighting something in a PDF and asking a question about it.',
  'You receive the highlighted text (when available) and the question. Produce a 3–6 word title that names the TOPIC — what the chat is ABOUT — not the question itself.',
  'Use Title Case. No quotes, no trailing punctuation, no leading articles (A/An/The). Output ONLY the title, nothing else.',
  '',
  'Examples:',
  '',
  'Highlighted: "Kubernetes Pod"',
  'Question: what is this?',
  'Title: Kubernetes Pods',
  '',
  'Highlighted: "attestation"',
  'Question: how does this work in TDX?',
  'Title: TDX Attestation',
  '',
  'Highlighted: "CVE-2024-3094"',
  'Question: is this still exploitable?',
  'Title: CVE-2024-3094 Exploitability',
  '',
  'Question: can you summarize the introduction?',
  'Title: Introduction Summary',
].join('\n');

/**
 * Best-effort auto-title for a newly-created chat.
 *
 * Runs asynchronously alongside the main chat stream — caller should
 * `void` this call and update the chat's title inside the `.then()`
 * if a non-empty result comes back. Any failure path (missing key,
 * rate limit, unregistered model, malformed response) resolves to
 * `null` so the caller can cleanly ignore it and leave the initial
 * truncated-question title in place.
 *
 * Intentionally does NOT send the PDF screenshot / full-page text
 * context that `streamChat` accepts: titles summarize the QUESTION,
 * not the document, and sending the multimodal bundle would blow up
 * the cost of the title call by two orders of magnitude for no
 * quality gain. (Also sidesteps the vision-model issue: since this
 * is text-only, text-only providers like o3-mini would work too if
 * we ever pointed at one.)
 */
export async function generateChatTitle(
  question: string,
  provider: ProviderId,
  apiKey: string,
  /** The text the user highlighted before asking (if any). Provides
   *  the subject matter the question is implicitly about — without
   *  it, a short referential question like "what is this?" gives the
   *  model nothing to summarize and it just echoes the question back
   *  as the title. Region-only selections (no text highlighted) leave
   *  this undefined; the title in that case will be weaker but still
   *  better than the fallback truncated-question placeholder. */
  selectedText?: string,
): Promise<string | null> {
  const model = TITLE_MODEL_BY_PROVIDER[provider];
  if (!model || !apiKey) return null;

  const trimmedQ = question.trim().slice(0, MAX_INPUT_CHARS);
  if (!trimmedQ) return null;

  const trimmedSel = selectedText?.trim().slice(0, MAX_SELECTION_CHARS);

  // Match the example format from the system prompt exactly so the
  // model's few-shot pattern-matching latches on to the same shape.
  const userContent = trimmedSel
    ? `Highlighted: "${trimmedSel}"\nQuestion: ${trimmedQ}\nTitle:`
    : `Question: ${trimmedQ}\nTitle:`;

  const messages: Message[] = [
    {
      id: 'title-gen',
      role: 'user',
      content: userContent,
      createdAt: new Date(),
    },
  ];

  let output = '';
  let failed = false;

  await streamChat(
    { apiKey, model, messages, systemPrompt: SYSTEM_PROMPT },
    (chunk) => {
      output += chunk;
    },
    () => {
      /* onDone — fall through, we'll post-process `output` below */
    },
    () => {
      failed = true;
    },
  );

  if (failed) return null;

  return cleanTitle(output);
}

/**
 * Normalize whatever the model emits into something sensible to show
 * in the sidebar:
 *   - trim whitespace
 *   - drop wrapping quotes (the model sometimes adds them despite
 *     being told not to)
 *   - drop trailing punctuation
 *   - reject overly long outputs (model refused to summarize and
 *     echoed the question back, or similar failure mode)
 *   - collapse internal whitespace
 */
function cleanTitle(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;

  // If the model emitted multiple lines, take the first non-empty one.
  const firstLine = t.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  t = firstLine.trim();

  // Some small models echo "Title:" back despite being told to output
  // only the title — the few-shot "Title:" label primes them to keep
  // writing "Title: X" rather than just "X". Strip it.
  t = t.replace(/^\s*title\s*[:\-]\s*/i, '');

  // Strip wrapping quotes / backticks (", ', `, curly quotes).
  t = t.replace(/^["'`\u2018\u2019\u201C\u201D]+|["'`\u2018\u2019\u201C\u201D]+$/g, '');
  // Strip a single trailing period / question mark / bang — headings
  // read better without them.
  t = t.replace(/[.!?]+$/, '');
  // Collapse runs of whitespace.
  t = t.replace(/\s+/g, ' ').trim();

  if (!t) return null;
  if (t.length > MAX_TITLE_CHARS) return null;
  return t;
}
