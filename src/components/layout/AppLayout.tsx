import { useState, useRef, useCallback } from 'react';
import Toolbar from './Toolbar';
import EmptyState from './EmptyState';
import PdfViewer from '../pdf/PdfViewer';
import ChatPanel from '../chat/ChatPanel';
import Sidebar from '../sidebar/Sidebar';
import SelectionPopup from '../pdf/SelectionPopup';
import TextSelectionListener from '../pdf/TextSelectionListener';
import ApiKeySettings from '../settings/ApiKeySettings';
import { useDocumentStore } from '../../stores/documentStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { useSettingsStore, hasKeyForSelectedModel } from '../../stores/settingsStore';
import { useLibrarianStore } from '../../stores/librarianStore';
import { capturePageImage } from '../../services/pdfContext';
import { uploadPdfToFolder } from '../../services/uploadDocument';
import useResizeObserver from '../../hooks/useResizeObserver';
import type { ContextMode } from '../../types';

export default function AppLayout() {
  const [panelOpen, setPanelOpen] = useState(true);
  const [pageImageBase64, setPageImageBase64] = useState<string | undefined>();
  const [fullPageImageBase64, setFullPageImageBase64] = useState<string | undefined>();
  const pdfUrl = useDocumentStore((s) => s.pdfUrl);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useResizeObserver(pdfContainerRef);

  const pendingAnchor = useSelectionStore((s) => s.pendingAnchor);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const createChat = useChatStore((s) => s.createChat);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);

  const handleStartChat = useCallback(async (question: string, contextMode: ContextMode) => {
    if (!pendingAnchor) return;
    if (!activeDocumentId) {
      console.warn('[Deck Chat] Cannot create chat: no active document');
      return;
    }

    // Capture the page image before creating the chat
    const pageEl = pdfContainerRef.current?.querySelector(
      `[data-page="${pendingAnchor.pageNumber}"]`
    ) as HTMLElement | null;

    let croppedImg: string | undefined;
    let fullPageImg: string | undefined;

    if (pageEl) {
      // Always capture the cropped region
      croppedImg = await capturePageImage(pageEl, pendingAnchor);
      setPageImageBase64(croppedImg);

      // For slide mode, also capture the full page
      if (contextMode === 'slide') {
        fullPageImg = await capturePageImage(pageEl);
        setFullPageImageBase64(fullPageImg);
      } else {
        setFullPageImageBase64(undefined);
      }
    }

    // Close any active note before creating the chat — ChatPanel
    // prefers `activeNote` over `activeChatId`, so without this the
    // right panel would stay stuck on the note and the newly-created
    // chat would never come to the front (even though it's persisted).
    useNoteStore.getState().closeNote();

    createChat(activeDocumentId, pendingAnchor, question, contextMode);

    clearSelection();
    setPanelOpen(true);
  }, [pendingAnchor, clearSelection, createChat, activeDocumentId]);

  const handleCreateNote = useCallback(
    async (initialBody: string) => {
      if (!pendingAnchor) return;
      if (!activeDocumentId) {
        console.warn('[Deck Chat] Cannot create note: no active document');
        return;
      }
      // Seed the body: if the user has highlighted text (region-select
      // carries no description) and hasn't typed anything, drop the
      // selected text in as a blockquote so it's preserved in the note
      // even if the on-PDF highlight goes away later.
      let seed = initialBody;
      if (!seed && pendingAnchor.description) {
        seed = `> ${pendingAnchor.description}\n\n`;
      }
      // Clear chat's active thread so opening a note doesn't leave a
      // stale chat mounted behind it in the right panel.
      useChatStore.getState().setActiveChat(null);
      await useNoteStore
        .getState()
        .createAndOpenNote(activeDocumentId, pendingAnchor, seed);
      clearSelection();
      setPanelOpen(true);
    },
    [pendingAnchor, activeDocumentId, clearSelection],
  );

  const handleUploadClick = useCallback(() => {
    // Require an API key for the currently-selected model's provider
    // before allowing upload. If the user has only configured one
    // provider and has selected a model from the other, this nudges
    // them to either switch models or add the missing key.
    const state = useSettingsStore.getState();
    if (!hasKeyForSelectedModel(state)) {
      state.setShowSettings(true);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && file.type === 'application/pdf') {
        const folderId = useLibrarianStore.getState().selectedFolderId;
        void uploadPdfToFolder(file, folderId);
      }
    };
    input.click();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200">
      <Toolbar onTogglePanel={() => setPanelOpen(!panelOpen)} panelOpen={panelOpen} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div ref={pdfContainerRef} className="flex-1 overflow-hidden">
          {pdfUrl ? (
            <PdfViewer containerWidth={containerWidth} />
          ) : (
            <EmptyState onUpload={handleUploadClick} />
          )}
        </div>
        <ChatPanel
          open={panelOpen}
          pageImageBase64={pageImageBase64}
          fullPageImageBase64={fullPageImageBase64}
        />
      </div>
      <SelectionPopup onStartChat={handleStartChat} onCreateNote={handleCreateNote} />
      <TextSelectionListener />
      <ApiKeySettings />
    </div>
  );
}
