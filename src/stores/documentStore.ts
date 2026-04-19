import { create } from 'zustand';
import { repo } from '../data/repo';

interface DocumentState {
  activeDocumentId: string | null;
  pdfFile: File | null;
  pdfUrl: string | null;
  pageCount: number;
  currentPage: number;
  scale: number;
  pageTexts: string[];
  textExtractionDone: boolean;

  // Transient upload path — used when a file has been picked but not yet
  // persisted (e.g. before repo.createDocument finishes, or for sessions that
  // want to preview without saving). Prefer openDocument for loading from
  // persistent storage.
  setPdfFile: (file: File) => void;

  // Open a document from the repo by id. Fetches the Blob, constructs a File,
  // and does the same URL lifecycle management as setPdfFile.
  openDocument: (id: string) => Promise<void>;

  setActiveDocumentId: (id: string | null) => void;
  setPageCount: (count: number) => void;
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;
  setPageTexts: (texts: string[]) => void;
  clearDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  activeDocumentId: null,
  pdfFile: null,
  pdfUrl: null,
  pageCount: 0,
  currentPage: 1,
  scale: 1.0,
  pageTexts: [],
  textExtractionDone: false,

  setPdfFile: (file: File) => {
    const prev = get().pdfUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      pdfFile: file,
      pdfUrl: URL.createObjectURL(file),
      pageCount: 0,
      currentPage: 1,
      pageTexts: [],
      textExtractionDone: false,
    });
  },

  openDocument: async (id: string) => {
    const doc = await repo.getDocument(id);
    const blob = await repo.getDocumentBlob(id);
    if (!doc || !blob) return;
    const file = new File([blob], doc.name, { type: blob.type || 'application/pdf' });
    const prev = get().pdfUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      activeDocumentId: id,
      pdfFile: file,
      pdfUrl: URL.createObjectURL(file),
      pageCount: doc.pageCount,
      currentPage: 1,
      pageTexts: [],
      textExtractionDone: false,
    });
  },

  setActiveDocumentId: (id) => set({ activeDocumentId: id }),

  setPageCount: (count: number) => {
    set({ pageCount: count });
    const { activeDocumentId } = get();
    if (activeDocumentId) {
      // Fire-and-forget: persist the page count on first load of a PDF so the
      // sidebar can show it eventually.
      void repo.updateDocumentPageCount(activeDocumentId, count);
    }
  },
  setCurrentPage: (page: number) => set({ currentPage: page }),
  setScale: (scale: number) => set({ scale }),
  setPageTexts: (texts: string[]) => set({ pageTexts: texts, textExtractionDone: true }),

  clearDocument: () => {
    const prev = get().pdfUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      activeDocumentId: null,
      pdfFile: null,
      pdfUrl: null,
      pageCount: 0,
      currentPage: 1,
      pageTexts: [],
      textExtractionDone: false,
    });
  },
}));
