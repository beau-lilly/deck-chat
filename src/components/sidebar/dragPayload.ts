// Shared drag state for sidebar drag-and-drop.
//
// HTML5 DnD only exposes the `types` array (not the actual data) during
// dragover events, so we can't read the dragged item's id from the
// dataTransfer to decide whether a drop is valid. Instead we stash the
// payload in a module-level singleton at dragstart, clear it at dragend,
// and read it synchronously from dragover/drop handlers. Only one drag
// can be in flight at a time anyway, so a singleton is fine.

import type { Folder } from '../../types';

export type DragPayload =
  | { kind: 'folder'; id: string }
  | { kind: 'document'; id: string };

let active: DragPayload | null = null;

export function setActiveDrag(p: DragPayload | null): void {
  active = p;
}

export function getActiveDrag(): DragPayload | null {
  return active;
}

// Returns true if dropping `drag` onto the folder with id `targetFolderId`
// is valid. Documents can be moved into any folder. Folders can be moved
// into any folder EXCEPT themselves or one of their descendants (which
// would create a loop).
export function canAcceptDrop(
  drag: DragPayload,
  targetFolderId: string,
  folderChildren: Map<string, Folder[]>,
): boolean {
  if (drag.kind === 'document') return true;
  if (drag.id === targetFolderId) return false;
  // Walk from the dragged folder downward; if we reach the target, it's
  // a descendant and the move would create a cycle.
  const stack: string[] = [drag.id];
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = folderChildren.get(cur) ?? [];
    for (const k of kids) {
      if (k.id === targetFolderId) return false;
      stack.push(k.id);
    }
  }
  return true;
}
