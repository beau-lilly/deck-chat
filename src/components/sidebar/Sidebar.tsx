import { useEffect, useMemo } from 'react';
import { useFolders, useAllDocuments } from '../../data/liveQueries';
import { useLibrarianStore } from '../../stores/librarianStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { ROOT_FOLDER_ID, type DocumentRecord, type Folder } from '../../types';
import FolderNode from './FolderNode';
import SearchBar from './SearchBar';
import ResizeHandle from '../layout/ResizeHandle';

export default function Sidebar() {
  const folders = useFolders();
  const documents = useAllDocuments();
  const filter = useLibrarianStore((s) => s.filter);
  const selectedFolderId = useLibrarianStore((s) => s.selectedFolderId);
  const sidebarOpen = useLibrarianStore((s) => s.sidebarOpen);
  const search = useLibrarianStore((s) => s.search);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  // Precompute maps once per render so nested FolderNode renders are cheap.
  // When the user is searching we prune the tree down to matches plus the
  // ancestor folders needed to reach them.
  const { root, folderChildren, documentsByFolder, noResults } = useMemo(() => {
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

    if (!searching) {
      return {
        root: rootFolder,
        folderChildren: children,
        documentsByFolder: docs,
        noResults: false,
      };
    }

    // --- search mode ---
    // A document "matches" if its name contains the query.
    // A folder is "visible" if (a) its name matches, (b) any descendant folder
    // is visible, or (c) it directly contains a matching document.
    // We also keep all ancestors of any visible folder so the tree stays
    // connected from the root.
    const folderById = new Map(folders.map((f) => [f.id, f] as const));

    const visibleFolderIds = new Set<string>();
    const matchingDocs = new Map<string, DocumentRecord[]>();

    const addAncestors = (folderId: string) => {
      let cur: Folder | undefined = folderById.get(folderId);
      while (cur) {
        if (visibleFolderIds.has(cur.id)) break;
        visibleFolderIds.add(cur.id);
        if (cur.parentId == null) break;
        cur = folderById.get(cur.parentId);
      }
    };

    // Direct folder-name matches
    for (const f of folders) {
      if (f.name.toLowerCase().includes(query)) {
        addAncestors(f.id);
      }
    }
    // Matching documents; their containing folder (and its ancestors) become visible
    for (const d of documents) {
      if (d.name.toLowerCase().includes(query)) {
        addAncestors(d.folderId);
        const arr = matchingDocs.get(d.folderId) ?? [];
        arr.push(d);
        matchingDocs.set(d.folderId, arr);
      }
    }
    for (const arr of matchingDocs.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

    // Prune folderChildren to only include visible folders
    const filteredChildren = new Map<string, Folder[]>();
    for (const [parentId, kids] of children.entries()) {
      const kept = kids.filter((k) => visibleFolderIds.has(k.id));
      if (kept.length) filteredChildren.set(parentId, kept);
    }

    // Root should still render even if it's empty of visible children so the
    // user gets the "no results" hint attached to it.
    const rootVisible = rootFolder
      ? visibleFolderIds.has(rootFolder.id) || matchingDocs.size > 0
      : false;

    return {
      root: rootFolder,
      folderChildren: filteredChildren,
      documentsByFolder: matchingDocs,
      noResults: !rootVisible,
    };
  }, [folders, documents, searching, query]);

  // Document-level capture preventDefault for right-click on any sidebar row.
  // This is the earliest point in the event pipeline where JS can intervene
  // — earlier than any element-level listener — which is necessary in Safari
  // where the native context-menu dispatcher runs very early in the input
  // pipeline. Per-row listeners still handle the actual menu opening; this
  // effect only exists to kill the native menu.
  useEffect(() => {
    const preventOnRow = (e: Event) => {
      const target = e.target as Element | null;
      if (!target) return;
      const mouse = e as MouseEvent;
      // Only intercept right-button mousedown (button === 2); contextmenu is
      // always right-click or ctrl+click so all instances get suppressed.
      if (e.type === 'mousedown' && mouse.button !== 2) return;
      const row = target.closest('[data-ctx-row="1"]');
      if (!row) return;
      e.preventDefault();
    };
    document.addEventListener('contextmenu', preventOnRow, { capture: true });
    document.addEventListener('mousedown', preventOnRow, { capture: true });
    return () => {
      document.removeEventListener(
        'contextmenu',
        preventOnRow,
        { capture: true } as EventListenerOptions,
      );
      document.removeEventListener(
        'mousedown',
        preventOnRow,
        { capture: true } as EventListenerOptions,
      );
    };
  }, []);

  if (!sidebarOpen) return null;

  const showFolders = filter === 'all' || filter === 'folders';
  const showFiles = filter === 'all' || filter === 'files';

  return (
    <div
      style={{ width: `${sidebarWidth}px` }}
      className="relative h-full bg-slate-900 border-r border-slate-700 flex flex-col shrink-0"
    >
      <div className="px-3 py-2 border-b border-slate-800">
        <SearchBar />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {root ? (
          searching && noResults ? (
            <div className="px-3 py-4 text-xs text-slate-500">
              No matches for &ldquo;{search}&rdquo;
            </div>
          ) : (
            <FolderNode
              folder={root}
              depth={0}
              childFolders={folderChildren.get(ROOT_FOLDER_ID) ?? []}
              documentsByFolder={documentsByFolder}
              folderChildren={folderChildren}
              showFolders={showFolders}
              showFiles={showFiles}
              forceExpanded={searching}
            />
          )
        ) : (
          <div className="px-3 py-4 text-xs text-slate-500">Loading…</div>
        )}
      </div>

      {/* selected-folder footer — shows where the next upload will land */}
      <div className="border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500 truncate">
        Upload target:{' '}
        <span className="text-slate-400">
          {folders.find((f) => f.id === selectedFolderId)?.name ?? '/'}
        </span>
      </div>

      <ResizeHandle side="right" width={sidebarWidth} onChange={setSidebarWidth} />
    </div>
  );
}
