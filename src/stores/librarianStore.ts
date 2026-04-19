import { create } from 'zustand';
import { ROOT_FOLDER_ID } from '../types';

export type LibraryFilter = 'all' | 'folders' | 'files';

interface LibrarianState {
  expanded: Set<string>;
  // Tracked separately from `expanded` (which is for folders). Document ids
  // are UUIDs so there's no collision risk, but keeping sets separate makes
  // the semantics clearer and lets us persist them independently later.
  expandedDocs: Set<string>;
  filter: LibraryFilter;
  selectedFolderId: string;
  sidebarOpen: boolean;
  // Search query typed into the sidebar — filters folders and documents
  // by case-insensitive substring match. Empty string means no filter.
  search: string;
  // ID of a folder or document currently being renamed inline. Only one
  // item can be in edit mode at a time; null means no editor is open.
  editingId: string | null;

  toggleFolder: (id: string) => void;
  expandFolder: (id: string) => void;
  toggleDocument: (id: string) => void;
  expandDocument: (id: string) => void;
  setFilter: (f: LibraryFilter) => void;
  setSelectedFolderId: (id: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearch: (q: string) => void;
  setEditingId: (id: string | null) => void;
}

export const useLibrarianStore = create<LibrarianState>((set) => ({
  // Root is expanded on first load so the tree shows something immediately.
  expanded: new Set<string>([ROOT_FOLDER_ID]),
  expandedDocs: new Set<string>(),
  filter: 'all',
  selectedFolderId: ROOT_FOLDER_ID,
  sidebarOpen: true,
  search: '',
  editingId: null,

  toggleFolder: (id) =>
    set((s) => {
      const next = new Set(s.expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expanded: next };
    }),

  expandFolder: (id) =>
    set((s) => {
      if (s.expanded.has(id)) return s;
      const next = new Set(s.expanded);
      next.add(id);
      return { expanded: next };
    }),

  toggleDocument: (id) =>
    set((s) => {
      const next = new Set(s.expandedDocs);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedDocs: next };
    }),

  expandDocument: (id) =>
    set((s) => {
      if (s.expandedDocs.has(id)) return s;
      const next = new Set(s.expandedDocs);
      next.add(id);
      return { expandedDocs: next };
    }),

  setFilter: (filter) => set({ filter }),
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSearch: (q) => set({ search: q }),
  setEditingId: (id) => set({ editingId: id }),
}));
