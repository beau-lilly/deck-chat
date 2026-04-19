import { useRef } from 'react';
import { Upload, FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Settings, Type, BoxSelect, PanelLeft, LocateFixed } from 'lucide-react';
import { useDocumentStore, MIN_SCALE, MAX_SCALE, SCALE_STEP } from '../../stores/documentStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSelectionStore, type SelectionTool } from '../../stores/selectionStore';
import { useLibrarianStore } from '../../stores/librarianStore';
import { uploadPdfToFolder } from '../../services/uploadDocument';

interface ToolbarProps {
  onTogglePanel: () => void;
  panelOpen: boolean;
}

function SelectionToolToggle() {
  const tool = useSelectionStore((s) => s.tool);
  const setTool = useSelectionStore((s) => s.setTool);

  const btn = (t: SelectionTool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTool(t)}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
        tool === t
          ? 'bg-indigo-600 text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
      }`}
      title={label}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 bg-slate-800 rounded-md p-0.5">
      {btn('text', <Type size={12} />, 'Text')}
      {btn('region', <BoxSelect size={12} />, 'Region')}
    </div>
  );
}

export default function Toolbar({ onTogglePanel, panelOpen }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pdfFile, pageCount, currentPage, scale, setScale, triggerCenter } = useDocumentStore();
  const sidebarOpen = useLibrarianStore((s) => s.sidebarOpen);
  const setSidebarOpen = useLibrarianStore((s) => s.setSidebarOpen);

  const handleUploadClick = () => {
    const { anthropicApiKey } = useSettingsStore.getState();
    if (!anthropicApiKey) {
      useSettingsStore.getState().setShowSettings(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      const folderId = useLibrarianStore.getState().selectedFolderId;
      void uploadPdfToFolder(file, folderId);
    }
    // Reset so picking the same file twice re-triggers onChange.
    if (e.target) e.target.value = '';
  };

  return (
    <div className="h-12 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-3 shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <PanelLeft size={14} />
      </button>

      <button
        onClick={handleUploadClick}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"
      >
        <Upload size={14} />
        {pdfFile ? 'Change PDF' : 'Upload PDF'}
      </button>

      {pdfFile && (
        <>
          <div className="flex items-center gap-1.5 text-slate-400 text-sm">
            <FileText size={14} />
            <span className="max-w-48 truncate">{pdfFile.name}</span>
          </div>

          <div className="h-5 w-px bg-slate-700" />

          <span className="text-sm text-slate-400">
            Page {currentPage} / {pageCount}
          </span>

          <div className="h-5 w-px bg-slate-700" />

          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale(Math.max(MIN_SCALE, scale - SCALE_STEP))}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              disabled={scale <= MIN_SCALE + 1e-6}
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => setScale(1)}
              className="text-xs text-slate-400 hover:text-slate-200 w-10 text-center transition-colors"
              title="Reset zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => setScale(Math.min(MAX_SCALE, scale + SCALE_STEP))}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              disabled={scale >= MAX_SCALE - 1e-6}
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => triggerCenter()}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Center and scroll to top"
            >
              <LocateFixed size={14} />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-700" />

          <SelectionToolToggle />
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => useSettingsStore.getState().setShowSettings(true)}
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={onTogglePanel}
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
        >
          {panelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {panelOpen ? 'Hide Chat' : 'Show Chat'}
        </button>
      </div>
    </div>
  );
}
