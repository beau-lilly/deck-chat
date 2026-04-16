import { db, type MessageRow } from './db';
import {
  ROOT_FOLDER_ID,
  type Chat,
  type DocumentRecord,
  type Folder,
  type Message,
} from '../types';

function uuid(): string {
  return crypto.randomUUID();
}

export interface Repo {
  // folders
  listFolders(): Promise<Folder[]>;
  createFolder(parentId: string, name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  moveFolder(id: string, parentId: string): Promise<void>;
  deleteFolder(id: string): Promise<void>;

  // documents
  listDocuments(folderId?: string): Promise<DocumentRecord[]>;
  getDocument(id: string): Promise<DocumentRecord | undefined>;
  createDocument(folderId: string, file: File, pageCount?: number): Promise<DocumentRecord>;
  updateDocumentPageCount(id: string, pageCount: number): Promise<void>;
  getDocumentBlob(id: string): Promise<Blob | null>;
  renameDocument(id: string, name: string): Promise<void>;
  moveDocument(id: string, folderId: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;

  // chats
  listChats(documentId: string): Promise<Chat[]>;
  createChat(chat: Chat): Promise<void>;
  appendMessage(chatId: string, msg: Message): Promise<void>;
  updateLastAssistantMessage(chatId: string, content: string): Promise<void>;
  markResponseStarted(chatId: string): Promise<void>;
  deleteChat(id: string): Promise<void>;
}

async function ensureRoot(): Promise<void> {
  const root = await db.folders.get(ROOT_FOLDER_ID);
  if (!root) {
    const now = new Date();
    await db.folders.put({
      id: ROOT_FOLDER_ID,
      name: '/',
      parentId: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// Cascade delete helpers.
async function deleteFolderCascade(folderId: string): Promise<void> {
  // Gather all descendant folder ids (BFS).
  const all = await db.folders.toArray();
  const children = new Map<string, string[]>();
  for (const f of all) {
    if (f.parentId == null) continue;
    const arr = children.get(f.parentId) ?? [];
    arr.push(f.id);
    children.set(f.parentId, arr);
  }
  const toDelete: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const cur = stack.pop()!;
    toDelete.push(cur);
    stack.push(...(children.get(cur) ?? []));
  }

  // Delete all documents in those folders (cascades to chats/messages/blobs).
  const docs = await db.documents.where('folderId').anyOf(toDelete).toArray();
  for (const d of docs) await deleteDocumentCascade(d.id);

  await db.folders.bulkDelete(toDelete);
}

async function deleteDocumentCascade(documentId: string): Promise<void> {
  const chats = await db.chats.where('documentId').equals(documentId).toArray();
  const chatIds = chats.map((c) => c.id);
  if (chatIds.length) {
    await db.messages.where('chatId').anyOf(chatIds).delete();
    await db.chats.bulkDelete(chatIds);
  }
  await db.blobs.delete(documentId);
  await db.documents.delete(documentId);
}

async function hydrateChat(chatRow: Awaited<ReturnType<typeof db.chats.get>>): Promise<Chat | null> {
  if (!chatRow) return null;
  const msgRows = await db.messages
    .where('chatId')
    .equals(chatRow.id)
    .sortBy('seq');
  return {
    id: chatRow.id,
    documentId: chatRow.documentId,
    anchor: chatRow.anchor,
    title: chatRow.title,
    contextMode: chatRow.contextMode,
    archived: chatRow.archived,
    needsResponse: chatRow.needsResponse,
    createdAt: chatRow.createdAt,
    updatedAt: chatRow.updatedAt,
    messages: msgRows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  };
}

export const repo: Repo = {
  // ── folders ──────────────────────────────────────────────────────────
  async listFolders() {
    await ensureRoot();
    return db.folders.toArray();
  },

  async createFolder(parentId, name) {
    await ensureRoot();
    const now = new Date();
    const folder: Folder = {
      id: uuid(),
      parentId,
      name,
      createdAt: now,
      updatedAt: now,
    };
    await db.folders.put(folder);
    return folder;
  },

  async renameFolder(id, name) {
    if (id === ROOT_FOLDER_ID) return; // root is immutable
    await db.folders.update(id, { name, updatedAt: new Date() });
  },

  async moveFolder(id, parentId) {
    if (id === ROOT_FOLDER_ID) return; // root can't be reparented
    if (id === parentId) return;
    // Guard against cycles: reject if `parentId` is `id` or a descendant of
    // `id`. Walk from id downward through children, looking for parentId.
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === parentId) return; // would create a loop
      const kids = await db.folders.where('parentId').equals(cur).toArray();
      for (const k of kids) stack.push(k.id);
    }
    await db.folders.update(id, { parentId, updatedAt: new Date() });
  },

  async deleteFolder(id) {
    if (id === ROOT_FOLDER_ID) return;
    await db.transaction('rw', [db.folders, db.documents, db.blobs, db.chats, db.messages], () =>
      deleteFolderCascade(id),
    );
  },

  // ── documents ────────────────────────────────────────────────────────
  async listDocuments(folderId) {
    if (folderId) return db.documents.where('folderId').equals(folderId).toArray();
    return db.documents.toArray();
  },

  async getDocument(id) {
    return db.documents.get(id);
  },

  async createDocument(folderId, file, pageCount = 0) {
    await ensureRoot();
    const now = new Date();
    const doc: DocumentRecord = {
      id: uuid(),
      folderId,
      name: file.name,
      pageCount,
      sizeBytes: file.size,
      createdAt: now,
      updatedAt: now,
    };
    const blob = file.slice(0, file.size, file.type || 'application/pdf');
    await db.transaction('rw', [db.documents, db.blobs], async () => {
      await db.documents.put(doc);
      await db.blobs.put({
        documentId: doc.id,
        bytes: blob,
        mimeType: file.type || 'application/pdf',
      });
    });
    return doc;
  },

  async updateDocumentPageCount(id, pageCount) {
    await db.documents.update(id, { pageCount, updatedAt: new Date() });
  },

  async getDocumentBlob(id) {
    const row = await db.blobs.get(id);
    return row?.bytes ?? null;
  },

  async renameDocument(id, name) {
    await db.documents.update(id, { name, updatedAt: new Date() });
  },

  async moveDocument(id, folderId) {
    await db.documents.update(id, { folderId, updatedAt: new Date() });
  },

  async deleteDocument(id) {
    await db.transaction('rw', [db.documents, db.blobs, db.chats, db.messages], () =>
      deleteDocumentCascade(id),
    );
  },

  // ── chats ────────────────────────────────────────────────────────────
  async listChats(documentId) {
    const rows = await db.chats.where('documentId').equals(documentId).toArray();
    const chats = await Promise.all(rows.map((r) => hydrateChat(r)));
    return chats.filter((c): c is Chat => c !== null);
  },

  async createChat(chat) {
    await db.transaction('rw', [db.chats, db.messages], async () => {
      await db.chats.put({
        id: chat.id,
        documentId: chat.documentId,
        anchor: chat.anchor,
        title: chat.title,
        contextMode: chat.contextMode,
        archived: chat.archived,
        needsResponse: chat.needsResponse,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      });
      const rows: MessageRow[] = chat.messages.map((m, i) => ({
        id: m.id,
        chatId: chat.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        seq: i,
      }));
      if (rows.length) await db.messages.bulkPut(rows);
    });
  },

  async appendMessage(chatId, msg) {
    await db.transaction('rw', [db.chats, db.messages], async () => {
      const sorted = await db.messages.where('chatId').equals(chatId).sortBy('seq');
      const lastSeq = sorted.length ? sorted[sorted.length - 1].seq : -1;
      await db.messages.put({
        id: msg.id,
        chatId,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        seq: lastSeq + 1,
      });
      await db.chats.update(chatId, { updatedAt: new Date() });
    });
  },

  async updateLastAssistantMessage(chatId, content) {
    // sortBy materializes + sorts in memory, so iterate from the end to find
    // the most recent assistant message.
    const msgs = await db.messages.where('chatId').equals(chatId).sortBy('seq');
    let last: MessageRow | undefined;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        last = msgs[i];
        break;
      }
    }
    if (!last) return;
    await db.transaction('rw', [db.chats, db.messages], async () => {
      await db.messages.update(last!.id, { content });
      await db.chats.update(chatId, { updatedAt: new Date() });
    });
  },

  async markResponseStarted(chatId) {
    await db.chats.update(chatId, { needsResponse: false, updatedAt: new Date() });
  },

  async deleteChat(id) {
    await db.transaction('rw', [db.chats, db.messages], async () => {
      await db.messages.where('chatId').equals(id).delete();
      await db.chats.delete(id);
    });
  },
};

// Kick off root creation on module load so the sidebar can render a "/" row
// without every consumer having to await first.
void ensureRoot();
