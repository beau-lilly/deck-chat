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
  archived: boolean;
  needsResponse: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentMeta {
  id: string;
  name: string;
  pageCount: number;
  createdAt: Date;
}

export interface NavigationEntry {
  pageNumber: number;
  scrollOffset: number;
}
