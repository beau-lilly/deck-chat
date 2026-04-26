export type ContextMode = 'selection' | 'slide' | 'document';

export interface ChatAnchor {
  pageNumber: number;
  type: 'region';
  x: number;
  y: number;
  width?: number;
  height?: number;
  description?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface Chat {
  id: string;
  documentId: string;
  anchor: ChatAnchor;
  title: string;
  messages: Message[];
  contextMode: ContextMode;
  archived: boolean;
  needsResponse: boolean;
  /** True once the auto-title LLM call has replaced the initial
   *  truncated-question title with a summarized one. Prevents the
   *  generation from re-firing on refresh or on subsequent follow-up
   *  messages — titles are set once per chat. Optional so pre-existing
   *  chats (persisted before this flag existed) read as undefined and
   *  skip regeneration as well. */
  titleGenerated?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A markdown-backed note anchored to a text selection or region on a
 * PDF page. Parallels `Chat` — shares the `ChatAnchor` shape so the
 * same in-page indicator and auto-pan logic can drive both — but
 * carries a single editable body instead of a message list.
 */
export interface Note {
  id: string;
  documentId: string;
  anchor: ChatAnchor;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ROOT_FOLDER_ID = 'root';

export interface Folder {
  id: string;            // uuid; ROOT_FOLDER_ID is reserved for "/"
  name: string;          // "/" for root, otherwise user-entered
  parentId: string | null; // null only for root
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentRecord {
  id: string;
  folderId: string;
  name: string;
  pageCount: number;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NavigationEntry {
  pageNumber: number;
  scrollOffset: number;
}
