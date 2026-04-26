import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from './db';
import type { ChatAnchor, DocumentRecord, Folder } from '../types';

// Lean chat shape for sidebar use — no messages, no contextMode, etc.
// Keeps liveQuery payloads small and avoids a separate hydration step.
export interface SidebarChat {
  id: string;
  documentId: string;
  title: string;
  anchor: ChatAnchor;
  /** Carried through from the chat row so consumers (sidebar, page-
   *  badge dot indicator) can filter out archived chats without
   *  re-fetching from the chat store. */
  archived: boolean;
  updatedAt: Date;
}

// Lean note shape for sidebar use — no body.
export interface SidebarNote {
  id: string;
  documentId: string;
  title: string;
  anchor: ChatAnchor;
  updatedAt: Date;
}

// Generic subscription helper — turns a Dexie liveQuery into React state.
function useLive<T>(factory: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(factory).subscribe({
      next: (v) => setValue(v),
      error: (e) => {
        console.error('[liveQuery] error:', e?.message ?? e, e?.stack ?? '');
      },
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useFolders(): Folder[] {
  return useLive(() => db.folders.toArray(), [], []);
}

export function useDocumentsIn(folderId: string): DocumentRecord[] {
  return useLive(
    () => db.documents.where('folderId').equals(folderId).toArray(),
    [folderId],
    [],
  );
}

export function useAllDocuments(): DocumentRecord[] {
  return useLive(() => db.documents.toArray(), [], []);
}

// Chats for a single document, sorted by anchor position:
//   1. pageNumber ascending
//   2. y ascending (top-to-bottom on the page)
//   3. x ascending (left-to-right tiebreak)
// Dexie can't index nested fields so the sort happens in memory after the
// `documentId` index narrows the row set.
//
// `documentId === ''` short-circuits to a stable empty array — callers
// (notably ChatAnchorIndicator's per-page show-all hook) pass empty
// when they want to skip the subscription's effective work without
// breaking the rules-of-hooks conditional-subscription constraint.
export function useChatsForDocument(documentId: string): SidebarChat[] {
  return useLive(
    async () => {
      if (!documentId) return [];
      const rows = await db.chats.where('documentId').equals(documentId).toArray();
      rows.sort((a, b) => {
        const pageDiff = a.anchor.pageNumber - b.anchor.pageNumber;
        if (pageDiff !== 0) return pageDiff;
        const yDiff = (a.anchor.y ?? 0) - (b.anchor.y ?? 0);
        if (yDiff !== 0) return yDiff;
        return (a.anchor.x ?? 0) - (b.anchor.x ?? 0);
      });
      return rows.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        title: r.title,
        anchor: r.anchor,
        archived: r.archived,
        updatedAt: r.updatedAt,
      }));
    },
    [documentId],
    [],
  );
}

// (Note — `archived` does NOT exist on NoteRow; only chats have it.)

// Search corpus shapes — same fields as the sidebar variants plus the
// concatenated text needed for full-text indexing. Kept separate so
// the lean sidebar query doesn't pay the cost of fetching all messages
// on every chat update.
export interface IndexableChat extends SidebarChat {
  /** Concatenated content of every message in the chat, joined by
   *  blank lines. Empty when the chat has only a placeholder
   *  assistant message and no user content beyond the title's source. */
  body: string;
}

export interface IndexableNote extends SidebarNote {
  body: string;
}

// Full-corpus chats hook for the search index. Subscribes to BOTH
// `db.chats` and `db.messages` so it refreshes when either changes —
// note that this means it refires on every streaming chunk write
// (since `updateLastAssistantMessage` bumps `db.chats.updatedAt` per
// chunk). The search index hook in `services/searchIndex.ts` mitigates
// that by only running MiniSearch's index build when a search query
// is actually active.
export function useAllIndexableChats(): IndexableChat[] {
  return useLive(
    async () => {
      const [chats, messages] = await Promise.all([
        db.chats.toArray(),
        db.messages.toArray(),
      ]);
      // Bucket messages by chatId in one pass — avoids the N+1 query
      // pattern of fetching messages per chat.
      const byChat = new Map<string, string[]>();
      for (const m of messages) {
        const arr = byChat.get(m.chatId) ?? [];
        arr.push(m.content);
        byChat.set(m.chatId, arr);
      }
      return chats.map((c) => ({
        id: c.id,
        documentId: c.documentId,
        title: c.title,
        anchor: c.anchor,
        archived: c.archived,
        updatedAt: c.updatedAt,
        body: (byChat.get(c.id) ?? []).join('\n\n'),
      }));
    },
    [],
    [],
  );
}

export function useAllIndexableNotes(): IndexableNote[] {
  return useLive(
    async () => {
      const notes = await db.notes.toArray();
      return notes.map((n) => ({
        id: n.id,
        documentId: n.documentId,
        title: n.title,
        anchor: n.anchor,
        updatedAt: n.updatedAt,
        body: n.body,
      }));
    },
    [],
    [],
  );
}

// Notes for a single document, sorted by the same anchor ordering as
// chats so they interleave naturally in the sidebar when rendered
// together.
export function useNotesForDocument(documentId: string): SidebarNote[] {
  return useLive(
    async () => {
      if (!documentId) return [];
      const rows = await db.notes.where('documentId').equals(documentId).toArray();
      rows.sort((a, b) => {
        const pageDiff = a.anchor.pageNumber - b.anchor.pageNumber;
        if (pageDiff !== 0) return pageDiff;
        const yDiff = (a.anchor.y ?? 0) - (b.anchor.y ?? 0);
        if (yDiff !== 0) return yDiff;
        return (a.anchor.x ?? 0) - (b.anchor.x ?? 0);
      });
      return rows.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        title: r.title,
        anchor: r.anchor,
        updatedAt: r.updatedAt,
      }));
    },
    [documentId],
    [],
  );
}
