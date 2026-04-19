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
