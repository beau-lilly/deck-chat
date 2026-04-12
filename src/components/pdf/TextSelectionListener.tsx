import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { useSelectionStore } from '../../stores/selectionStore';

/**
 * Polls for text selection inside PDF pages.
 * No event listeners — purely polling-based for maximum Safari compatibility.
 * Shows a floating button when a stable text selection is detected.
 */
export default function TextSelectionListener() {
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const prevText = useRef('');
  const stableCount = useRef(0);

  const [floatingBtn, setFloatingBtn] = useState<{
    text: string;
    pageNum: number;
    x: number;
    y: number;
    width: number;
    height: number;
    btnX: number;
    btnY: number;
  } | null>(null);

  useEffect(() => {
    function poll() {
      const { pendingAnchor, tool } = useSelectionStore.getState();
      if (tool !== 'text') {
        setFloatingBtn(null);
        return;
      }
      if (pendingAnchor) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        prevText.current = '';
        stableCount.current = 0;
        // Don't clear button here — user might have just clicked the button
        // which briefly collapses the selection
        return;
      }

      const text = sel.toString().trim();

      if (text === prevText.current) {
        stableCount.current++;
      } else {
        prevText.current = text;
        stableCount.current = 1;
      }

      // Need 3 stable cycles (~450ms) — enough for drag to finish
      if (stableCount.current < 3) return;

      // Already showing button for this text
      if (floatingBtn?.text === text) return;

      let range: Range;
      try {
        range = sel.getRangeAt(0);
      } catch {
        return;
      }

      const startNode = range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
      if (!startNode) return;

      const textLayer = startNode.closest('.textLayer');
      if (!textLayer) return;

      const pageEl = textLayer.closest('[data-page]');
      if (!pageEl) return;

      const pageNum = parseInt(pageEl.getAttribute('data-page') || '0', 10);
      if (!pageNum) return;

      const pageRect = pageEl.getBoundingClientRect();
      const rangeRect = range.getBoundingClientRect();
      if (rangeRect.width === 0 && rangeRect.height === 0) return;

      const x = ((rangeRect.left - pageRect.left) / pageRect.width) * 100;
      const y = ((rangeRect.top - pageRect.top) / pageRect.height) * 100;
      const width = (rangeRect.width / pageRect.width) * 100;
      const height = (rangeRect.height / pageRect.height) * 100;

      setFloatingBtn({
        text, pageNum, x, y, width, height,
        btnX: rangeRect.right + 4,
        btnY: rangeRect.top - 4,
      });
    }

    pollRef.current = setInterval(poll, 150);

    // Clear button when clicking anywhere except the button itself
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (!target?.closest?.('[data-text-sel-btn]')) {
        setFloatingBtn(null);
        prevText.current = '';
        stableCount.current = 0;
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [floatingBtn?.text]);

  const handleClick = useCallback(() => {
    if (!floatingBtn) return;
    const { text, pageNum, x, y, width, height } = floatingBtn;
    setFloatingBtn(null);
    prevText.current = '';
    stableCount.current = 0;
    useSelectionStore.getState().finishTextSelection(pageNum, text, x, y, width, height);
  }, [floatingBtn]);

  if (!floatingBtn) return null;

  return (
    <button
      data-text-sel-btn
      data-selection-popup
      onClick={handleClick}
      className="fixed z-50 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg shadow-xl transition-colors"
      style={{
        left: `${floatingBtn.btnX}px`,
        top: `${Math.max(8, floatingBtn.btnY)}px`,
      }}
    >
      <MessageSquare size={12} />
      Ask about this
    </button>
  );
}
