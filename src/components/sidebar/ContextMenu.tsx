import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  // When true, renders a horizontal separator line. `label` and `onClick` are
  // ignored for separator rows.
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Initial position is whatever the caller supplied; we re-measure after
  // mount and clamp it so the menu never hangs off the edge of the viewport.
  const [pos, setPos] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 4;
    let nextLeft = x;
    let nextTop = y;
    if (x + rect.width + MARGIN > vw) nextLeft = Math.max(MARGIN, vw - rect.width - MARGIN);
    if (y + rect.height + MARGIN > vh) nextTop = Math.max(MARGIN, vh - rect.height - MARGIN);
    if (nextLeft !== pos.left || nextTop !== pos.top) {
      setPos({ top: nextTop, left: nextLeft });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  useEffect(() => {
    // Close on: click anywhere outside, Escape, another right-click anywhere
    // (so the native or a different menu takes over), scroll or resize.
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onResize = () => onClose();
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('contextmenu', onDocMouseDown, { capture: true });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('contextmenu', onDocMouseDown, { capture: true } as EventListenerOptions);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
      className="min-w-[170px] bg-slate-800 border border-slate-700 rounded-md shadow-lg py-1 text-xs"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="my-1 border-t border-slate-700" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            role="menuitem"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
              item.destructive
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'text-slate-200 hover:bg-slate-700'
            }`}
          >
            <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center text-slate-400">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
