import { useEffect, useRef, useState } from 'react';

interface Props {
  // Which panel edge this handle lives on:
  //   'right' — handle on the right side of a left-anchored panel (drag
  //             right → panel grows). Used by the left sidebar.
  //   'left'  — handle on the left side of a right-anchored panel (drag
  //             left → panel grows). Used by the right chat panel.
  side: 'left' | 'right';
  // Current width in px.
  width: number;
  // Called with the new proposed width on every drag frame. The caller is
  // responsible for clamping to its own min/max.
  onChange: (nextWidth: number) => void;
}

export default function ResizeHandle({ side, width, onChange }: Props) {
  const [dragging, setDragging] = useState(false);
  // Snapshot the starting cursor position and width at drag start so each
  // frame can recompute absolutely (no drift from accumulated deltas).
  const startRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const start = startRef.current;
      if (!start) return;
      const delta = e.clientX - start.x;
      // Left-anchored panel (side='right'): dragging right widens.
      // Right-anchored panel (side='left'): dragging left widens (negate).
      const next = side === 'right' ? start.width + delta : start.width - delta;
      onChange(next);
    };

    const onUp = () => {
      setDragging(false);
      startRef.current = null;
    };

    // Capture so we still get events if the cursor leaves the handle fast.
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // Block text selection / mis-interpreted DnD starts during the drag.
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging, side, onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    // Ignore right-click / middle-click so context menu and auto-scroll
    // keep working.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { x: e.clientX, width };
    setDragging(true);
  };

  // Absolute 4-px strip overlaid on the panel edge. We pick up a broader
  // invisible hit area around it (8px inset) so the cursor snaps to the
  // resize state a little before reaching the exact pixel edge — feels
  // much less finicky than a literal 4px target.
  const positionClasses =
    side === 'right'
      ? 'right-0 translate-x-1/2' // centered over the right edge
      : 'left-0 -translate-x-1/2'; // centered over the left edge

  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      className={`absolute top-0 bottom-0 ${positionClasses} w-2 z-10 cursor-col-resize group`}
    >
      {/* Visible 1-px rule that fades to indigo on hover/drag */}
      <div
        className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px transition-colors ${
          dragging ? 'bg-indigo-400' : 'bg-transparent group-hover:bg-indigo-400/60'
        }`}
      />
    </div>
  );
}
