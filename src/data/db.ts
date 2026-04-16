import Dexie, { type EntityTable } from 'dexie';
import type { ChatAnchor, ContextMode, Folder, DocumentRecord } from '../types';

// Bump DB_VERSION and add a .version(N+1).stores({...}).upgrade(...) call below
// whenever the schema changes. Dexie preserves data across schema upgrades
// provided every old version is still declared.
export const DB_VERSION = 1;

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

export class DeckChatDB extends Dexie {
  folders!: EntityTable<FolderRow, 'id'>;
  documents!: EntityTable<DocumentRow, 'id'>;
  blobs!: EntityTable<BlobRow, 'documentId'>;
  chats!: EntityTable<ChatRow, 'id'>;
  messages!: EntityTable<MessageRow, 'id'>;

  constructor() {
    super('deck-chat');
    this.version(DB_VERSION).stores({
      folders: 'id, parentId, updatedAt',
      documents: 'id, folderId, updatedAt',
      blobs: 'documentId',
      chats: 'id, documentId, updatedAt',
      messages: 'id, chatId, seq, createdAt',
    });
  }
}

export const db = new DeckChatDB();
