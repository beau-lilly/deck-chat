import { create } from 'zustand';
import type { ChatAnchor } from '../types';

/**
 * Tracks the single "previewed" chat or note across the app.
 *
 * Preview is the middle state between "nothing selected" and "opened":
 *   - Single-click a sidebar row  → set as preview (panel stays on the
 *     list; PDF viewer pans to the anchor; sidebar highlights the row).
 *   - Click the SAME row again    → promote to open (active chat/note
 *     fills the right panel).
 *   - Double-click                → previous click preview'd it; this
 *     click reads the already-previewed state and opens it. So the
 *     two-fire-onClick behavior of native dblclick gives the "double-
 *     click opens directly" UX for free, no separate dblclick handler.
 *
 * Using Zustand (with synchronous `getState()` reads inside click
 * handlers) instead of React state so the second of a back-to-back
 * click pair can see the first click's preview without waiting for
 * a re-render.
 *
 * Anchor is stored directly on the preview so the PdfViewer subscription
 * can pan without having to reach back into chat/note stores — especially
 * important when the preview is on a document that isn't currently loaded.
 */
export type PreviewKind = 'chat' | 'note';

export interface PreviewSelection {
  kind: PreviewKind;
  id: string;
  documentId: string;
  anchor: ChatAnchor;
}

interface PreviewState {
  previewed: PreviewSelection | null;
  setPreviewed: (p: PreviewSelection) => void;
  clearPreview: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  previewed: null,
  setPreviewed: (p) => set({ previewed: p }),
  clearPreview: () => set({ previewed: null }),
}));

/**
 * Small helper the sidebar/right-panel rows call instead of forking
 * the same 10-line `if (preview is me) open else preview` branch in
 * every click handler. Returns 'open' or 'preview' so the caller can
 * proceed with its specific open flow (chat vs note have slightly
 * different side effects — closing the other source, etc.).
 */
export function classifyClick(
  kind: PreviewKind,
  id: string,
  isAlreadyActive: boolean,
): 'noop' | 'open' | 'preview' {
  if (isAlreadyActive) return 'noop';
  const current = usePreviewStore.getState().previewed;
  if (current && current.kind === kind && current.id === id) return 'open';
  return 'preview';
}
