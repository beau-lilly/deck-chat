import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Upload,
  Pencil,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { ROOT_FOLDER_ID, type Folder, type DocumentRecord } from '../../types';
import { useLibrarianStore } from '../../stores/librarianStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { repo } from '../../data/repo';
import { uploadPdfToFolder } from '../../services/uploadDocument';
import DocumentNode from './DocumentNode';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import InlineEditor from './InlineEditor';
import { canAcceptDrop, getActiveDrag, setActiveDrag } from './dragPayload';

// Finder-style unique-name resolver: returns "untitled folder" if free,
// otherwise "untitled folder 2", 3, … (skipping existing names, case-
// insensitive match).
function nextUntitledName(existing: string[]): string {
  const lc = new Set(existing.map((n) => n.toLowerCase()));
  const base = 'untitled folder';
  if (!lc.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base} ${n}`;
    if (!lc.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`; // absurd fallback
}

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
  const editingId = useLibrarianStore((s) => s.editingId);
  const setEditingId = useLibrarianStore((s) => s.setEditingId);
  const isEditing = editingId === folder.id;

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // Counter-based drag hover tracking: increment on dragenter, decrement on
  // dragleave. Safari reports `relatedTarget: null` inconsistently so the
  // `contains(relatedTarget)` trick doesn't work reliably there — the
  // counter is resilient because enter/leave events balance regardless of
  // which child is being crossed.
  const dragEnterCount = useRef(0);

  // Safari's native context-menu pipeline is triggered by the right-button
  // mousedown, not by `contextmenu` — by the time `contextmenu` fires the
  // native menu may already be committed. The only reliable cross-browser
  // fix is:
  //   1. Prevent default on MOUSEDOWN when button === 2 (right). This
  //      cuts the native menu off at the earliest point in WebKit's input
  //      pipeline, before it ever decides to show the page menu.
  //   2. Still render our menu in the `contextmenu` handler (some paths,
  //      like ctrl+click on macOS, may not emit button=2 mousedown).
  // Capture-phase listeners fire as the event descends (before any child
  // or sibling handler), which is the earliest point JS can intervene.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        // stopPropagation so parent rows don't also open a menu
        e.stopPropagation();
        setSelectedFolderId(folder.id);
        setMenu({ x: e.clientX, y: e.clientY });
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      // Some input paths (notably macOS ctrl+click and some trackpads)
      // skip the button=2 mousedown and jump straight to contextmenu.
      e.preventDefault();
      e.stopPropagation();
      // Only open the menu if mousedown didn't already do it (avoid a
      // flicker from setMenu fires in the same tick).
      setMenu((prev) => prev ?? { x: e.clientX, y: e.clientY });
      setSelectedFolderId(folder.id);
    };

    el.addEventListener('mousedown', onMouseDown, { capture: true });
    el.addEventListener('contextmenu', onContextMenu, { capture: true });
    return () => {
      el.removeEventListener('mousedown', onMouseDown, { capture: true } as EventListenerOptions);
      el.removeEventListener('contextmenu', onContextMenu, { capture: true } as EventListenerOptions);
    };
  }, [folder.id, setSelectedFolderId]);

  const isSelected = selectedFolderId === folder.id;
  const docs = documentsByFolder.get(folder.id) ?? [];
  const hasChildren = childFolders.length > 0 || docs.length > 0;

  const handleNewSubfolder = async () => {
    // Finder pattern: create with a default unique name, then immediately
    // open an inline editor on the new folder so the user can rename it.
    const existing = (childFolders ?? []).map((f) => f.name);
    const defaultName = nextUntitledName(existing);
    const newFolder = await repo.createFolder(folder.id, defaultName);
    useLibrarianStore.getState().expandFolder(folder.id);
    setEditingId(newFolder.id);
  };

  const handleUploadHere = () => {
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

  const handleRename = () => {
    // Inline edit — the row renders an InlineEditor when editingId matches.
    setEditingId(folder.id);
  };

  const handleDelete = async () => {
    const ok = window.confirm(
      `Delete folder "${folder.name}" and everything inside it (subfolders, PDFs, and chats)? This cannot be undone.`,
    );
    if (!ok) return;
    await repo.deleteFolder(folder.id);
    // If the deleted folder was the upload target, snap selection back to root
    // so the next upload doesn't land on a ghost id.
    if (selectedFolderId === folder.id) setSelectedFolderId(ROOT_FOLDER_ID);
  };

  // --- Drag & drop ---------------------------------------------------------
  // This row is both a drag SOURCE (the folder can be moved) and a drop
  // TARGET (other folders or documents can be dropped into it). Root can
  // only be a target, never a source.
  const canDrag = !isRoot && !isEditing;

  const onDragStart = (e: React.DragEvent) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', folder.name);
    setActiveDrag({ kind: 'folder', id: folder.id });
  };

  const onDragEnd = () => {
    setActiveDrag(null);
    dragEnterCount.current = 0;
    setIsDropTarget(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    const drag = getActiveDrag();
    if (!drag) return;
    if (!canAcceptDrop(drag, folder.id, folderChildren)) return;
    e.preventDefault(); // preventDefault is what marks this as a valid drop target
    e.dataTransfer.dropEffect = 'move';
  };

  const onDragEnter = (e: React.DragEvent) => {
    const drag = getActiveDrag();
    if (!drag) return;
    if (!canAcceptDrop(drag, folder.id, folderChildren)) return;
    e.preventDefault();
    dragEnterCount.current++;
    // Only flip visible state on the first enter — subsequent enters from
    // descendant-crossings are absorbed by the counter without re-rendering.
    if (dragEnterCount.current === 1) setIsDropTarget(true);
  };

  const onDragLeave = () => {
    if (dragEnterCount.current === 0) return;
    dragEnterCount.current--;
    if (dragEnterCount.current === 0) setIsDropTarget(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    const drag = getActiveDrag();
    setActiveDrag(null);
    dragEnterCount.current = 0;
    setIsDropTarget(false);
    if (!drag) return;
    if (!canAcceptDrop(drag, folder.id, folderChildren)) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.kind === 'folder') {
      await repo.moveFolder(drag.id, folder.id);
    } else {
      await repo.moveDocument(drag.id, folder.id);
    }
    // Auto-expand the target so the user sees where their item landed.
    useLibrarianStore.getState().expandFolder(folder.id);
  };

  const items: ContextMenuItem[] = [
    { label: 'New folder', icon: <FolderPlus size={12} />, onClick: handleNewSubfolder },
    { label: 'Upload PDF', icon: <Upload size={12} />, onClick: handleUploadHere },
  ];
  if (!isRoot) {
    items.push(
      { separator: true, label: '', onClick: () => {} },
      { label: 'Rename', icon: <Pencil size={12} />, onClick: handleRename },
      {
        label: 'Delete',
        icon: <Trash2 size={12} />,
        onClick: handleDelete,
        destructive: true,
      },
    );
  }

  return (
    <div>
      <div
        ref={rowRef}
        data-ctx-row="1"
        draggable={canDrag}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        className={`group flex items-center gap-1 pr-2 py-1 text-xs rounded cursor-pointer select-none transition-colors ${
          isDropTarget
            ? 'ring-1 ring-indigo-400 bg-indigo-600/20 text-indigo-100'
            : isSelected
              ? 'bg-slate-800 text-slate-100'
              : 'text-slate-300 hover:bg-slate-800/60'
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
        {isEditing ? (
          <InlineEditor
            initialValue={folder.name}
            onCommit={async (newName) => {
              await repo.renameFolder(folder.id, newName);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
            className="flex-1 min-w-0"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate">{folder.name}</span>
        )}

        {/* Kebab trigger — always-available fallback for users whose
            right-click is blocked by a browser extension (e.g. StopTheMadness).
            Only appears on hover so the tree stays clean. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedFolderId(folder.id);
            // Anchor the menu to the kebab's bottom-right. ContextMenu clamps
            // to the viewport so a right-aligned drop reads naturally on a
            // sidebar-width row.
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            // Position menu so its right edge sits under the kebab's right
            // edge; ContextMenu handles the inner clamp if space is tight.
            const MENU_WIDTH_ESTIMATE = 180;
            setMenu({ x: rect.right - MENU_WIDTH_ESTIMATE, y: rect.bottom + 2 });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title="More actions"
          aria-label="More actions"
          aria-haspopup="menu"
        >
          <MoreVertical size={12} />
        </button>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}

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
