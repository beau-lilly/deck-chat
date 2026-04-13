import { useState, useRef, useCallback } from 'react';
import Toolbar from './Toolbar';
import EmptyState from './EmptyState';
import PdfViewer from '../pdf/PdfViewer';
import ChatPanel from '../chat/ChatPanel';
import SelectionPopup from '../pdf/SelectionPopup';
import TextSelectionListener from '../pdf/TextSelectionListener';
import ApiKeySettings from '../settings/ApiKeySettings';
import { useDocumentStore } from '../../stores/documentStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { capturePageImage } from '../../services/pdfContext';
import useResizeObserver from '../../hooks/useResizeObserver';
import type { ContextMode } from '../../types';

export default function AppLayout() {
  const [panelOpen, setPanelOpen] = useState(true);
  const [pageImageBase64, setPageImageBase64] = useState<string | undefined>();
  const [fullPageImageBase64, setFullPageImageBase64] = useState<string | undefined>();
  const pdfUrl = useDocumentStore((s) => s.pdfUrl);
  const setPdfFile = useDocumentStore((s) => s.setPdfFile);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useResizeObserver(pdfContainerRef);

  const pendingAnchor = useSelectionStore((s) => s.pendingAnchor);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const createChat = useChatStore((s) => s.createChat);

  const handleStartChat = useCallback(async (question: string, contextMode: ContextMode) => {
    if (!pendingAnchor) return;

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

    createChat(pendingAnchor, question, contextMode);

    clearSelection();
    setPanelOpen(true);
  }, [pendingAnchor, clearSelection, createChat]);

  const handleUploadClick = useCallback(() => {
    // Require API key before allowing upload
    const { anthropicApiKey, setShowSettings } = useSettingsStore.getState();
    if (!anthropicApiKey) {
      setShowSettings(true);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && file.type === 'application/pdf') {
        setPdfFile(file);
      }
    };
    input.click();
  }, [setPdfFile]);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200">
      <Toolbar onTogglePanel={() => setPanelOpen(!panelOpen)} panelOpen={panelOpen} />
      <div className="flex flex-1 overflow-hidden">
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
      <SelectionPopup onStartChat={handleStartChat} />
      <TextSelectionListener />
      <ApiKeySettings />
    </div>
  );
}
