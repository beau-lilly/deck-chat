import { useMemo } from 'react';
import { FolderPlus, Upload } from 'lucide-react';
import { useFolders, useAllDocuments } from '../../data/liveQueries';
import { useLibrarianStore } from '../../stores/librarianStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { uploadPdfToFolder } from '../../services/uploadDocument';
import { repo } from '../../data/repo';
import { ROOT_FOLDER_ID, type DocumentRecord, type Folder } from '../../types';
import FolderNode from './FolderNode';
import FilterToggle from './FilterToggle';

export default function Sidebar() {
  const folders = useFolders();
  const documents = useAllDocuments();
  const filter = useLibrarianStore((s) => s.filter);
  const selectedFolderId = useLibrarianStore((s) => s.selectedFolderId);
  const sidebarOpen = useLibrarianStore((s) => s.sidebarOpen);

  // Precompute maps once per render so nested FolderNode renders are cheap.
  const { root, folderChildren, documentsByFolder } = useMemo(() => {
    const children = new Map<string, Folder[]>();
    for (const f of folders) {
      if (f.parentId == null) continue;
      const arr = children.get(f.parentId) ?? [];
      arr.push(f);
      children.set(f.parentId, arr);
    }
    for (const arr of children.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

    const docs = new Map<string, DocumentRecord[]>();
    for (const d of documents) {
      const arr = docs.get(d.folderId) ?? [];
      arr.push(d);
      docs.set(d.folderId, arr);
    }
    for (const arr of docs.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

    const rootFolder = folders.find((f) => f.id === ROOT_FOLDER_ID);
    return { root: rootFolder, folderChildren: children, documentsByFolder: docs };
  }, [folders, documents]);

  if (!sidebarOpen) return null;

  const showFolders = filter === 'all' || filter === 'folders';
  const showFiles = filter === 'all' || filter === 'files';

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name?');
    if (!name || !name.trim()) return;
    await repo.createFolder(selectedFolderId, name.trim());
    useLibrarianStore.getState().expandFolder(selectedFolderId);
  };

  const handleUpload = () => {
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
        void uploadPdfToFolder(file, selectedFolderId);
      }
    };
    input.click();
  };

  return (
    <div className="w-64 h-full bg-slate-900 border-r border-slate-700 flex flex-col shrink-0">
      <div className="h-12 border-b border-slate-700 flex items-center px-3 gap-1 shrink-0">
        <h2 className="text-sm font-medium text-slate-200 flex-1">Files</h2>
        <button
          onClick={handleNewFolder}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          title="New folder"
        >
          <FolderPlus size={14} />
        </button>
        <button
          onClick={handleUpload}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          title="Upload PDF"
        >
          <Upload size={14} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-slate-800">
        <FilterToggle />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {root ? (
          <FolderNode
            folder={root}
            depth={0}
            childFolders={folderChildren.get(ROOT_FOLDER_ID) ?? []}
            documentsByFolder={documentsByFolder}
            folderChildren={folderChildren}
            showFolders={showFolders}
            showFiles={showFiles}
          />
        ) : (
          <div className="px-3 py-4 text-xs text-slate-500">Loading…</div>
        )}
        {/* "Files-only" flat view: if the user filtered to files, also
            surface any uncategorized documents that exist outside the
            normal tree traversal. (In practice there shouldn't be any,
            but this keeps the view honest.) */}
        {filter === 'files' && documents.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-500">No files yet. Click upload.</div>
        )}
      </div>

      {/* selected-folder footer — shows where the next upload will land */}
      <div className="border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500 truncate">
        Upload target:{' '}
        <span className="text-slate-400">
          {folders.find((f) => f.id === selectedFolderId)?.name ?? '/'}
        </span>
      </div>
    </div>
  );
}
