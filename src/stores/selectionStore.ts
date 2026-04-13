import { create } from 'zustand';
import type { ChatAnchor } from '../types';

export type SelectionTool = 'text' | 'region';
type DragMode = 'idle' | 'dragging';

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface SelectionState {
  tool: SelectionTool;
  dragMode: DragMode;
  activePageNumber: number | null;
  drag: DragState | null;
  pendingAnchor: ChatAnchor | null;

  setTool: (tool: SelectionTool) => void;
  startDrag: (pageNumber: number, x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  finishDragSelection: (pageNumber: number, x: number, y: number, wasDrag: boolean) => void;
  finishTextSelection: (pageNumber: number, selectedText: string, x: number, y: number, width: number, height: number) => void;
  clearSelection: () => void;
}

const DRAG_THRESHOLD = 5;       // below this: treated as a click (percentage units)
const MIN_REGION_SIZE = 8;      // below this in both dimensions: too small, dismiss instead

export const useSelectionStore = create<SelectionState>((set, get) => ({
  tool: 'text',
  dragMode: 'idle',
  activePageNumber: null,
  drag: null,
  pendingAnchor: null,

  setTool: (tool) => {
    set({ tool, dragMode: 'idle', drag: null, activePageNumber: null, pendingAnchor: null });
  },

  startDrag: (pageNumber, x, y) => {
    set({
      dragMode: 'dragging',
      activePageNumber: pageNumber,
      drag: { startX: x, startY: y, currentX: x, currentY: y },
    });
  },

  updateDrag: (x, y) => {
    const { drag } = get();
    if (!drag) return;
    set({ drag: { ...drag, currentX: x, currentY: y } });
  },

  finishDragSelection: (pageNumber, x, y, wasDrag) => {
    const { drag } = get();

    if (wasDrag && drag) {
      const minX = Math.min(drag.startX, x);
      const minY = Math.min(drag.startY, y);
      const width = Math.abs(x - drag.startX);
      const height = Math.abs(y - drag.startY);

      if (width < MIN_REGION_SIZE && height < MIN_REGION_SIZE) {
        // Too small to be intentional — treat as a dismiss click
        set({ dragMode: 'idle', drag: null, activePageNumber: null, pendingAnchor: null });
      } else {
        set({
          dragMode: 'idle',
          pendingAnchor: {
            pageNumber,
            type: 'region',
            x: minX,
            y: minY,
            width,
            height,
          },
          drag: null,
        });
      }
    } else {
      set({ dragMode: 'idle', drag: null, activePageNumber: null, pendingAnchor: null });
    }
  },

  finishTextSelection: (pageNumber, selectedText, x, y, width, height) => {
    set({
      dragMode: 'idle',
      pendingAnchor: {
        pageNumber,
        type: 'region',
        x,
        y,
        width,
        height,
        description: selectedText,
      },
      drag: null,
    });
  },

  clearSelection: () => {
    set({ dragMode: 'idle', activePageNumber: null, drag: null, pendingAnchor: null });
    // Clear any browser text selection too
    window.getSelection()?.removeAllRanges();
  },
}));
