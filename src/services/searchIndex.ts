import { useMemo } from 'react';
import MiniSearch from 'minisearch';
import {
  useAllIndexableChats,
  useAllIndexableNotes,
  useAllDocuments,
} from '../data/liveQueries';
import type { ChatAnchor } from '../types';

/**
 * One ranked hit from a chat/note search. `kind` discriminates which
 * store to open the result in (chatStore vs noteStore); `documentId`
 * + `anchor` are everything the navigation flow needs to swap the
 * active doc and pan to the right place.
 */
export interface SearchResult {
  kind: 'chat' | 'note';
  id: string;
  title: string;
  documentId: string;
  documentName: string;
  anchor: ChatAnchor;
  /** A short body excerpt with the first match contextualized by ~40
   *  chars on either side. Empty when the body is empty (e.g. notes
   *  whose only content is the title). */
  snippet: string;
  /** MiniSearch BM25-derived score; higher = better. Surface for
   *  debugging or for a future "sort by recency vs relevance" toggle. */
  score: number;
}

const MAX_RESULTS = 50;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 100;

/**
 * Cross-document search across every chat (titles + concatenated
 * message bodies) and every note (titles + markdown bodies) in the
 * library. Powered by MiniSearch — BM25 scoring with light fuzzy +
 * prefix matching, multi-field weighting that boosts title matches
 * over body matches.
 *
 * Index is built lazily on the FIRST non-empty query and rebuilt
 * whenever the corpus changes. While the search input is empty, no
 * indexing work happens at all — important because the corpus liveQuery
 * refires on every streaming chunk (see `useAllIndexableChats`),
 * and we don't want to thrash MiniSearch through a long stream when
 * the user isn't searching.
 *
 * Returns at most `MAX_RESULTS` hits sorted by score.
 */
export function useChatNoteSearch(query: string): SearchResult[] {
  const chats = useAllIndexableChats();
  const notes = useAllIndexableNotes();
  const docs = useAllDocuments();

  const trimmed = query.trim();
  const enabled = trimmed.length > 0;

  // documentName lookup so we can show "Foo.pdf — p.5" on each result.
  const docNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of docs) m.set(d.id, d.name);
    return m;
  }, [docs]);

  // Build the index only when search is active. While `enabled` is
  // false this short-circuits to `null` immediately — no MiniSearch
  // instance is created and the corpus liveQueries can refire freely
  // (e.g. during a chat stream) without paying any indexing cost.
  const index = useMemo(() => {
    if (!enabled) return null;
    if (chats.length === 0 && notes.length === 0) return null;

    // Synthetic `__id` because chats and notes might in principle
    // share a UUID (they're separate tables generating UUIDs
    // independently). MiniSearch wants one global id per indexed doc.
    const ms = new MiniSearch({
      idField: '__id',
      fields: ['title', 'body', 'documentName'],
      storeFields: [
        'kind',
        'id',
        'title',
        'documentId',
        'documentName',
        'anchor',
        'body',
      ],
      searchOptions: {
        // Title matches dominate — if you searched "kubernetes" and
        // a chat is literally titled "Kubernetes Pods", that should
        // outrank a passing mention buried in another chat's body.
        boost: { title: 3, documentName: 1.5 },
        // Light fuzzy tolerates minor typos (kubernetez → kubernetes)
        // without making the search feel sloppy. 0.2 means up to 20%
        // edit distance per term.
        fuzzy: 0.2,
        prefix: true,
        // Default combine is OR — any term must match. Switching to
        // AND ("all terms must hit") makes multi-word queries feel
        // more specific without a dramatic recall hit on this corpus.
        combineWith: 'AND',
      },
    });

    for (const c of chats) {
      ms.add({
        __id: `c-${c.id}`,
        kind: 'chat',
        id: c.id,
        title: c.title,
        body: c.body,
        documentId: c.documentId,
        documentName: docNameById.get(c.documentId) ?? '',
        anchor: c.anchor,
      });
    }
    for (const n of notes) {
      ms.add({
        __id: `n-${n.id}`,
        kind: 'note',
        id: n.id,
        title: n.title,
        body: n.body,
        documentId: n.documentId,
        documentName: docNameById.get(n.documentId) ?? '',
        anchor: n.anchor,
      });
    }
    return ms;
  }, [enabled, chats, notes, docNameById]);

  return useMemo(() => {
    if (!enabled || !index) return [];
    const hits = index.search(trimmed);
    return hits.slice(0, MAX_RESULTS).map((h) => {
      const body: string = h.body ?? '';
      return {
        kind: h.kind as 'chat' | 'note',
        id: h.id as string,
        title: h.title as string,
        documentId: h.documentId as string,
        documentName: h.documentName as string,
        anchor: h.anchor as ChatAnchor,
        snippet: extractSnippet(body, trimmed),
        score: h.score,
      };
    });
  }, [enabled, index, trimmed]);
}

/**
 * Pull a short excerpt of the body around the first occurrence of any
 * query term. Falls back to the body's prefix if no term is found
 * literally (which can happen with fuzzy matches — "kubernetez"
 * matched, but the body has "Kubernetes" with different casing or a
 * stem the substring scan won't catch).
 */
function extractSnippet(body: string, query: string): string {
  if (!body) return '';
  const lowerBody = body.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let idx = -1;
  for (const t of terms) {
    const i = lowerBody.indexOf(t);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }

  if (idx < 0) {
    // No literal hit — show a head excerpt so the user sees SOMETHING
    // related to the chat/note, not an empty snippet.
    if (body.length <= SNIPPET_BEFORE + SNIPPET_AFTER) return body;
    return body.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER) + '…';
  }

  const start = Math.max(0, idx - SNIPPET_BEFORE);
  const end = Math.min(body.length, idx + SNIPPET_AFTER);
  let out = body.slice(start, end);
  // Collapse internal newlines / runs of whitespace so the snippet
  // reads as one continuous line. Without this, multi-line note
  // bodies show ragged line breaks in the result list.
  out = out.replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + out + (end < body.length ? '…' : '');
}
