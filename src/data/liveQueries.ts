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
export function useChatsForDocument(documentId: string): SidebarChat[] {
  return useLive(
    async () => {
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
        updatedAt: r.updatedAt,
      }));
    },
    [documentId],
    [],
  );
}
