import Dexie, { type EntityTable } from 'dexie';
import type { ChatAnchor, ContextMode, Folder, DocumentRecord } from '../types';

// Bump DB_VERSION and add a `.version(N+1).stores({...}).upgrade(...)` call
// below whenever the schema changes. Dexie preserves data across schema
// upgrades provided every prior version is still declared.
//
//   v1 → v2: added `notes` table (markdown-body notes anchored to a
//            region/text, parallel to chats). Adding a new table is a
//            non-destructive upgrade, so no data migration is needed.
export const DB_VERSION = 2;

// Row shapes used in IndexedDB. These differ slightly from the in-memory
// `Chat` / `Message` types because:
//   - messages live in their own table (cheap appends during streaming)
//   - Dexie cannot index nested objects, so anchor fields stay nested in a
//     blob and we only index primitives.
export interface FolderRow extends Folder {}

export interface DocumentRow extends DocumentRecord {}

export interface BlobRow {
  documentId: string;
  bytes: Blob;
  mimeType: string;
}

export interface ChatRow {
  id: string;
  documentId: string;
  anchor: ChatAnchor;
  title: string;
  contextMode: ContextMode;
  archived: boolean;
  needsResponse: boolean;
  /** See Chat.titleGenerated. Not indexed — Dexie stores arbitrary
   *  extra fields on the row without a schema bump, so this is a
   *  zero-migration addition. */
  titleGenerated?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  // monotonic index for stable ordering across ties on createdAt
  seq: number;
}

// Notes live alongside chats — same documentId → many anchors shape.
// Body is kept on the row itself (not split into chunks) because notes
// are user-written markdown and rarely bigger than a few KB.
export interface NoteRow {
  id: string;
  documentId: string;
  anchor: ChatAnchor;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export class DeckChatDB extends Dexie {
  folders!: EntityTable<FolderRow, 'id'>;
  documents!: EntityTable<DocumentRow, 'id'>;
  blobs!: EntityTable<BlobRow, 'documentId'>;
  chats!: EntityTable<ChatRow, 'id'>;
  messages!: EntityTable<MessageRow, 'id'>;
  notes!: EntityTable<NoteRow, 'id'>;

  constructor() {
    super('deck-chat');
    // v1 — original schema (pre-notes). Kept declared so users with
    // existing databases migrate cleanly onto v2.
    this.version(1).stores({
      folders: 'id, parentId, updatedAt',
      documents: 'id, folderId, updatedAt',
      blobs: 'documentId',
      chats: 'id, documentId, updatedAt',
      messages: 'id, chatId, seq, createdAt',
    });
    // v2 — adds notes. Additive schema change, no upgrade() needed.
    this.version(2).stores({
      folders: 'id, parentId, updatedAt',
      documents: 'id, folderId, updatedAt',
      blobs: 'documentId',
      chats: 'id, documentId, updatedAt',
      messages: 'id, chatId, seq, createdAt',
      notes: 'id, documentId, updatedAt',
    });
  }
}

export const db = new DeckChatDB();
