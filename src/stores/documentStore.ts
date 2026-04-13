import { create } from 'zustand';

interface DocumentState {
  pdfFile: File | null;
  pdfUrl: string | null;
  pageCount: number;
  currentPage: number;
  scale: number;
  pageTexts: string[];
  textExtractionDone: boolean;

  setPdfFile: (file: File) => void;
  setPageCount: (count: number) => void;
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;
  setPageTexts: (texts: string[]) => void;
  clearDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
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

  setPageCount: (count: number) => set({ pageCount: count }),
  setCurrentPage: (page: number) => set({ currentPage: page }),
  setScale: (scale: number) => set({ scale }),
  setPageTexts: (texts: string[]) => set({ pageTexts: texts, textExtractionDone: true }),

  clearDocument: () => {
    const prev = get().pdfUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      pdfFile: null,
      pdfUrl: null,
      pageCount: 0,
      currentPage: 1,
      pageTexts: [],
      textExtractionDone: false,
    });
  },
}));
