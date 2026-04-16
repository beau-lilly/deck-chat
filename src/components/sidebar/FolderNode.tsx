import { ChevronRight, ChevronDown, Folder as FolderIcon, FolderOpen } from 'lucide-react';
import type { Folder, DocumentRecord } from '../../types';
import { useLibrarianStore } from '../../stores/librarianStore';
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
  const userExpanded = useLibrarianStore((s) => s.expanded.has(folder.id));
  const expanded = forceExpanded || userExpanded;
  const toggleFolder = useLibrarianStore((s) => s.toggleFolder);
  const selectedFolderId = useLibrarianStore((s) => s.selectedFolderId);
  const setSelectedFolderId = useLibrarianStore((s) => s.setSelectedFolderId);

  const isSelected = selectedFolderId === folder.id;
  const docs = documentsByFolder.get(folder.id) ?? [];
  const hasChildren = childFolders.length > 0 || docs.length > 0;

  return (
    <div>
      <div
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        className={`group flex items-center gap-1 pr-2 py-1 text-xs rounded cursor-pointer transition-colors ${
          isSelected ? 'bg-slate-800 text-slate-100' : 'text-slate-300 hover:bg-slate-800/60'
        }`}
        onClick={() => setSelectedFolderId(folder.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFolder(folder.id);
          }}
          className="p-0.5 rounded hover:bg-slate-700 text-slate-500"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="block w-[12px] h-[12px]" />
          )}
        </button>
        {expanded ? (
          <FolderOpen size={12} className="text-indigo-400 shrink-0" />
        ) : (
          <FolderIcon size={12} className="text-indigo-400 shrink-0" />
        )}
        <span className="truncate">{folder.name}</span>
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
