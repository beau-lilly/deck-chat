import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Upload,
} from 'lucide-react';
import { ROOT_FOLDER_ID, type Folder, type DocumentRecord } from '../../types';
import { useLibrarianStore } from '../../stores/librarianStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { repo } from '../../data/repo';
import { uploadPdfToFolder } from '../../services/uploadDocument';
import DocumentNode from './DocumentNode';

interface Props {
  folder: Folder;
  depth: number;
  childFolders: Folder[];
  documentsByFolder: Map<string, DocumentRecord[]>;
  folderChildren: Map<string, Folder[]>;
  showFolders: boolean;
  showFiles: boolean;
  // When true (search mode), override per-folder expand state so every
  // folder along a match path is visible without mutating user intent.
  forceExpanded?: boolean;
}

export default function FolderNode({
  folder,
  depth,
  childFolders,
  documentsByFolder,
  folderChildren,
  showFolders,
  showFiles,
  forceExpanded = false,
}: Props) {
  const isRoot = folder.id === ROOT_FOLDER_ID;
  // Root is pinned open — the user can't collapse "/" because there's no
  // meaningful UX in hiding the whole tree.
  const userExpanded = useLibrarianStore((s) => s.expanded.has(folder.id));
  const expanded = isRoot || forceExpanded || userExpanded;
  const toggleFolder = useLibrarianStore((s) => s.toggleFolder);
  const selectedFolderId = useLibrarianStore((s) => s.selectedFolderId);
  const setSelectedFolderId = useLibrarianStore((s) => s.setSelectedFolderId);

  const isSelected = selectedFolderId === folder.id;
  const docs = documentsByFolder.get(folder.id) ?? [];
  const hasChildren = childFolders.length > 0 || docs.length > 0;

  const handleNewSubfolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = window.prompt('Folder name?');
    if (!name || !name.trim()) return;
    await repo.createFolder(folder.id, name.trim());
    useLibrarianStore.getState().expandFolder(folder.id);
  };

  const handleUploadHere = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { anthropicApiKey, setShowSettings } = useSettingsStore.getState();
    if (!anthropicApiKey) {
      setShowSettings(true);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (file && file.type === 'application/pdf') {
        void uploadPdfToFolder(file, folder.id);
        useLibrarianStore.getState().expandFolder(folder.id);
      }
    };
    input.click();
  };

  return (
    <div>
      <div
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        className={`group flex items-center gap-1 pr-1 py-1 text-xs rounded cursor-pointer transition-colors ${
          isSelected ? 'bg-slate-800 text-slate-100' : 'text-slate-300 hover:bg-slate-800/60'
        }`}
        onClick={() => setSelectedFolderId(folder.id)}
      >
        {isRoot ? (
          <span className="block w-4 h-4 shrink-0" aria-hidden="true" />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(folder.id);
            }}
            className="p-0.5 rounded hover:bg-slate-700 text-slate-500 shrink-0"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {hasChildren ? (
              expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            ) : (
              <span className="block w-[12px] h-[12px]" />
            )}
          </button>
        )}
        {expanded ? (
          <FolderOpen size={12} className="text-indigo-400 shrink-0" />
        ) : (
          <FolderIcon size={12} className="text-indigo-400 shrink-0" />
        )}
        <span className="flex-1 min-w-0 truncate">{folder.name}</span>

        {/* Hover-revealed actions. `opacity-0` keeps them out of the way until
            the user actually hovers (or focuses) the row; the tree stays quiet
            when scanning. */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          <button
            onClick={handleNewSubfolder}
            className="p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700"
            title="New folder here"
            aria-label="New folder here"
          >
            <FolderPlus size={12} />
          </button>
          <button
            onClick={handleUploadHere}
            className="p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700"
            title="Upload PDF here"
            aria-label="Upload PDF here"
          >
            <Upload size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div>
          {showFolders &&
            childFolders.map((child) => (
              <FolderNode
                key={child.id}
                folder={child}
                depth={depth + 1}
                childFolders={folderChildren.get(child.id) ?? []}
                documentsByFolder={documentsByFolder}
                folderChildren={folderChildren}
                showFolders={showFolders}
                showFiles={showFiles}
                forceExpanded={forceExpanded}
              />
            ))}
          {showFiles &&
            docs.map((doc) => (
              <DocumentNode key={doc.id} doc={doc} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}
