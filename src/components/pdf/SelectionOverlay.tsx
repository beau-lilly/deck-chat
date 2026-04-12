import { useRef, useCallback, useEffect } from 'react';
import { useSelectionStore } from '../../stores/selectionStore';

interface SelectionOverlayProps {
  pageNumber: number;
}

export default function SelectionOverlay({ pageNumber }: SelectionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isMouseDown = useRef(false);

  const { drag, activePageNumber, pendingAnchor, startDrag, updateDrag, finishDragSelection } =
    useSelectionStore();

  const getRelativeCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      // Clamp to 0-100% so dragging outside the page stays bounded
      return {
        x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
      };
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); // prevent text selection during drag
      const { x, y } = getRelativeCoords(e.clientX, e.clientY);
      isDragging.current = false;
      isMouseDown.current = true;
      startDrag(pageNumber, x, y);
    },
    [pageNumber, getRelativeCoords, startDrag],
  );

  // Use document-level listeners for mousemove/mouseup so drags that
  // leave this page's bounds still update correctly (clamped to 0-100%).
  useEffect(() => {
    if (activePageNumber !== pageNumber) return;
    if (!isMouseDown.current && !drag) return;

    const handleDocMouseMove = (e: MouseEvent) => {
      if (activePageNumber !== pageNumber) return;
      if (!drag) return;
      isDragging.current = true;
      const { x, y } = getRelativeCoords(e.clientX, e.clientY);
      updateDrag(x, y);
    };

    const handleDocMouseUp = (e: MouseEvent) => {
      if (activePageNumber !== pageNumber) return;
      isMouseDown.current = false;
      // Always finish on the originating page with clamped coords
      const { x, y } = getRelativeCoords(e.clientX, e.clientY);
      finishDragSelection(pageNumber, x, y, isDragging.current);
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleDocMouseMove);
    document.addEventListener('mouseup', handleDocMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleDocMouseMove);
      document.removeEventListener('mouseup', handleDocMouseUp);
    };
  }, [activePageNumber, pageNumber, drag, getRelativeCoords, updateDrag, finishDragSelection]);

  // Render drag rectangle for this page only
  const showDragRect = drag && activePageNumber === pageNumber;
  const showAnchor = pendingAnchor && pendingAnchor.pageNumber === pageNumber;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 cursor-crosshair z-10"
      onMouseDown={handleMouseDown}
    >
      {/* Active drag rectangle */}
      {showDragRect && drag && (
        <div
          className="absolute border-2 border-indigo-400 bg-indigo-400/15 pointer-events-none"
          style={{
            left: `${Math.min(drag.startX, drag.currentX)}%`,
            top: `${Math.min(drag.startY, drag.currentY)}%`,
            width: `${Math.abs(drag.currentX - drag.startX)}%`,
            height: `${Math.abs(drag.currentY - drag.startY)}%`,
          }}
        />
      )}

      {/* Completed selection: region */}
      {showAnchor && pendingAnchor.type === 'region' && (
        <div
          className="absolute border-2 border-indigo-400 bg-indigo-400/20 pointer-events-none rounded-sm"
          style={{
            left: `${pendingAnchor.x}%`,
            top: `${pendingAnchor.y}%`,
            width: `${pendingAnchor.width}%`,
            height: `${pendingAnchor.height}%`,
          }}
        />
      )}

    </div>
  );
}
