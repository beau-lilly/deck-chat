import { useEffect, useRef } from 'react';
import { useSelectionStore } from '../../stores/selectionStore';

/**
 * Polls for text selection inside PDF pages.
 * When a stable text selection is detected, immediately sets the pending anchor
 * so the bottom SelectionPopup appears — no intermediate "Ask about this" button.
 */
export default function TextSelectionListener() {
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const prevText = useRef('');
  const stableCount = useRef(0);
  const committedText = useRef('');

  useEffect(() => {
    function poll() {
      const { pendingAnchor, tool } = useSelectionStore.getState();
      if (tool !== 'text') return;
      if (pendingAnchor) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        // Selection was cleared — only reset if we haven't committed yet
        // (avoid resetting during brief collapses when new DOM renders)
        if (!committedText.current) {
          prevText.current = '';
          stableCount.current = 0;
        }
        return;
      }

      const text = sel.toString().trim();

      // If we already committed this exact text, don't re-commit
      if (text === committedText.current) return;

      if (text === prevText.current) {
        stableCount.current++;
      } else {
        prevText.current = text;
        stableCount.current = 1;
        committedText.current = '';
      }

      // Need 3 stable cycles (~450ms) — enough for drag to finish
      if (stableCount.current < 3) return;

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

      // Mark this text as committed so we don't re-trigger
      committedText.current = text;

      // Directly set the pending anchor — SelectionPopup will appear at the bottom
      useSelectionStore.getState().finishTextSelection(pageNum, text, x, y, width, height);
    }

    pollRef.current = setInterval(poll, 150);

    // Reset committed text when user starts a new selection (pointerdown)
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element;
      // Don't reset if clicking inside the selection popup
      if (target?.closest?.('[data-selection-popup]')) return;

      committedText.current = '';
      prevText.current = '';
      stableCount.current = 0;
    }
    document.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  // No UI — the SelectionPopup handles the prompt
  return null;
}
