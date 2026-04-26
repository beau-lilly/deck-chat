import { useCallback, useRef, useEffect } from 'react';
import { Document } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfPage from './PdfPage';
import { useDocumentStore, MIN_SCALE, MAX_SCALE } from '../../stores/documentStore';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { usePreviewStore } from '../../stores/previewStore';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  containerWidth: number;
}

// Delay between the last zoom event and re-rendering the canvas at full
// resolution. Short enough to feel responsive after a gesture ends, long
// enough to coalesce an entire active pinch into one canvas rebuild.
const COMMIT_DEBOUNCE_MS = 150;

// Background slack around the PDF content — lets the user pan off the
// edges slightly before the bounds clamp kicks in. Feels more like a real
// canvas than hard-stopping at the page edge.
const PAN_MARGIN = 400;

export default function PdfViewer({ containerWidth }: PdfViewerProps) {
  const { pdfUrl, pageCount, setPageCount, setCurrentPage } = useDocumentStore();
  const setPageTexts = useDocumentStore((s) => s.setPageTexts);
  const scale = useDocumentStore((s) => s.scale);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Mutable refs for pan (tx, ty) and preview zoom. Stored as refs, not
  // state, because they change at 60–120Hz during active gestures and
  // each update writes `transform` directly to the DOM — going through
  // React state would re-render the whole PDF tree on every event.
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const visualZoomRef = useRef(1);
  const hasInitializedRef = useRef(false);
  // Exposed from inside the main useEffect so the pdfUrl-change effect
  // can kick off a fresh centering loop without duplicating state or
  // re-binding all the event listeners the main effect owns.
  const kickInitialCenterRef = useRef<() => void>(() => {});
  // Same idea for viewport-resize rebalancing: the container-width
  // effect below calls this to re-apply mode-aware bounds (clampPan +
  // applyTransform) when the user drags a sidebar.
  const rebalanceRef = useRef<() => void>(() => {});
  // Mirrors the `pageWidth` the render function passes to react-pdf, so
  // initial centering can use the target width without waiting for pdf.js
  // to finish laying out the first page (whose offsetWidth is 0 or
  // partial during the first few frames).
  const pageWidthRef = useRef(0);

  const onDocumentLoadSuccess = useCallback(async (pdf: PDFDocumentProxy) => {
    setPageCount(pdf.numPages);

    // Extract text from all pages in the background so later LLM calls
    // can include per-page text context without re-parsing the PDF.
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        texts.push(pageText);
      } catch {
        texts.push('');
      }
    }
    setPageTexts(texts);
    console.log(`[Deck Chat] Extracted text from ${pdf.numPages} pages (${texts.reduce((a, t) => a + t.length, 0)} chars total)`);
  }, [setPageCount, setPageTexts]);

  // Reset the "have we centered?" flag and kick off a fresh centering
  // retry loop whenever a new document loads. The main useEffect below
  // only runs once (empty deps, so its event listeners stay stable
  // across document changes); we need a separate effect tied to pdfUrl
  // to re-trigger the centering it owns, via the ref it exposed.
  useEffect(() => {
    hasInitializedRef.current = false;
    kickInitialCenterRef.current();
  }, [pdfUrl]);

  // Rebalance the canvas when the viewport resizes (user drags a
  // sidebar edge). Waiting one frame lets React commit the new
  // pageWidth prop and react-pdf resize its inner Page wrapper before
  // we read canvas.offsetWidth for the clamp. clampPan handles both
  // modes correctly: FIT re-centers, PAN keeps tx but re-binds edges.
  useEffect(() => {
    if (!hasInitializedRef.current) return;
    const rafId = requestAnimationFrame(() => {
      rebalanceRef.current();
    });
    return () => cancelAnimationFrame(rafId);
  }, [containerWidth]);

  // All pan/zoom / page-tracking wiring. Runs once on mount; handlers
  // read current scale etc. via `useDocumentStore.getState()` so the
  // effect doesn't need to re-attach when the store changes (which would
  // drop in-flight gestures).
  useEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;

    let commitTimer: number | null = null;
    let gestureActive = false;
    let gestureStartVisualZoom = 1;
    let pageTrackRafId: number | null = null;

    // --- axis snap ----------------------------------------------------
    // Scroll / pan behavior is mode-dependent on whether the page's
    // visual width fits inside the viewport (between the sidebars):
    //
    //   FIT mode (page width ≤ viewport width):
    //     The page already fits horizontally, so there's nothing to pan
    //     sideways. We lock horizontal motion entirely (dx zeroed) and
    //     leave vertical untouched — the user just scrolls through the
    //     document like a normal reader. clampPan() below additionally
    //     forces tx to dead-center the page.
    //
    //   PAN mode (page width > viewport width — user has zoomed in):
    //     Horizontal pan is needed to see the hidden edges, so we allow
    //     free 2D scrolling with a soft axis lock (smoothstep deadzone
    //     at ratio 0.20 → 0.40) that snaps near-axis gestures without
    //     killing diagonals. clampPan() restricts tx to the range where
    //     the page still fully covers the viewport (no pan-past-edge).
    //
    // smoothstep ramp for the soft-lock case:
    //   ratio = |smallerAxis| / |largerAxis|
    //   ratio ≤ SNAP_DEAD → smaller axis is zeroed (snap to dominant)
    //   ratio ≥ SNAP_SOFT → full pass-through (free 2D pan)
    //   in between        → smoothstep (no perceptible boundary)
    const SNAP_DEAD_PAN = 0.2;
    const SNAP_SOFT_PAN = 0.4;
    const panModeAxisSnap = (ratio: number): number => {
      if (ratio <= SNAP_DEAD_PAN) return 0;
      if (ratio >= SNAP_SOFT_PAN) return 1;
      const t = (ratio - SNAP_DEAD_PAN) / (SNAP_SOFT_PAN - SNAP_DEAD_PAN);
      return t * t * (3 - 2 * t);
    };

    // Helper: is the page currently narrow enough to fit fully within the
    // viewport horizontally? Determines FIT vs PAN mode.
    const isPageFitHorizontally = () => {
      const cw = canvas.offsetWidth * visualZoomRef.current;
      return cw <= viewport.clientWidth;
    };

    // --- core: transform + page tracking ------------------------------
    const applyTransform = () => {
      canvas.style.transform = `translate3d(${txRef.current}px, ${tyRef.current}px, 0) scale(${visualZoomRef.current})`;
      schedulePageTrack();
    };

    // Mode-aware bounds clamp.
    //
    //   FIT mode (cw ≤ vw):
    //     Horizontal is locked — tx must keep the page dead-center.
    //     Vertical keeps the existing PAN_MARGIN slack so the user can
    //     over-scroll slightly (feels more forgiving).
    //
    //   PAN mode (cw > vw):
    //     Horizontal bounds are STRICT (no slack): the page must fully
    //     cover the viewport horizontally at all times, so tx lives
    //     in [vw - cw, 0] — the two extremes being "page right edge
    //     flush to viewport right" and "page left edge flush to viewport
    //     left". Vertical still has its slack.
    const clampPan = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const cw = canvas.offsetWidth * visualZoomRef.current;
      const ch = canvas.offsetHeight * visualZoomRef.current;
      const slack = PAN_MARGIN;

      if (cw <= vw) {
        // FIT mode — lock the page to horizontal center, no pan allowed.
        txRef.current = (vw - cw) / 2;
      } else {
        // PAN mode — strict edges, no slack. Page must always cover the
        // viewport horizontally.
        txRef.current = Math.max(vw - cw, Math.min(0, txRef.current));
      }

      // Vertical keeps slack — long documents need room to over-scroll.
      if (ch <= vh) {
        tyRef.current = Math.max(-slack, Math.min(vh - ch + slack, tyRef.current));
      } else {
        tyRef.current = Math.max(vh - ch - slack, Math.min(slack, tyRef.current));
      }
    };

    // Which page is at the viewport's upper third — matches the heuristic
    // used by the original scroll-based tracker so `currentPage` feels
    // the same.
    const schedulePageTrack = () => {
      if (pageTrackRafId !== null) return;
      pageTrackRafId = requestAnimationFrame(() => {
        pageTrackRafId = null;
        const pages = canvas.querySelectorAll<HTMLDivElement>('[data-page]');
        if (pages.length === 0) return;
        const vrect = viewport.getBoundingClientRect();
        const middle = vrect.top + vrect.height / 3;
        for (const page of pages) {
          const r = page.getBoundingClientRect();
          if (r.top <= middle && r.bottom > middle) {
            const n = parseInt(page.dataset.page || '1', 10);
            setCurrentPage(n);
            break;
          }
        }
      });
    };

    // In-flight pan animation (set by animatePanTo below). Any manual
    // pan/zoom cancels it so the user's input has immediate effect
    // rather than fighting an ongoing interpolation.
    let panAnimRafId: number | null = null;
    const cancelPanAnim = () => {
      if (panAnimRafId !== null) {
        cancelAnimationFrame(panAnimRafId);
        panAnimRafId = null;
      }
    };

    // Smoothly tween tx/ty (and optionally visualZoom) from their
    // current values to the target over `durationMs`, ease-out cubic —
    // motion starts fast and decelerates into the destination.
    //
    // The math works out that if tx, ty, and visualZoom all share the
    // same easing function, any content point's viewport position at
    // time `t` is exactly the linear interpolation (with the same ease)
    // between its start and end viewport positions. So if the caller
    // chose (targetTx, targetTy) such that a specific anchor lands at
    // viewport center at the target zoom, the anchor glides straight
    // toward that center throughout the animation — no drift, no need
    // to recompute tx/ty per frame from the anchor.
    //
    // When targetZoom differs from current, we also run the pinch/wheel
    // commit pipeline at animation end: the visualZoom gets rolled into
    // react-pdf's canvas width for a single crisp rebuild at the new
    // scale, and visualZoom resets to 1. tx/ty can stay put because the
    // canvas grows/shrinks by exactly the committed factor.
    const animatePanTo = (
      rawTx: number,
      rawTy: number,
      targetZoom: number = visualZoomRef.current,
      durationMs = 300,
    ) => {
      cancelPanAnim();

      // Pre-clamp the target at the target zoom level, then read it
      // back. Temporary writes are restored before we start the tween.
      const startTx = txRef.current;
      const startTy = tyRef.current;
      const startZoom = visualZoomRef.current;
      txRef.current = rawTx;
      tyRef.current = rawTy;
      visualZoomRef.current = targetZoom;
      clampPan();
      const targetTx = txRef.current;
      const targetTy = tyRef.current;
      txRef.current = startTx;
      tyRef.current = startTy;
      visualZoomRef.current = startZoom;

      const zoomChanging = Math.abs(targetZoom - startZoom) >= 0.01;

      // Already at target → snap and skip the tween.
      if (
        Math.abs(targetTx - startTx) < 1 &&
        Math.abs(targetTy - startTy) < 1 &&
        !zoomChanging
      ) {
        txRef.current = targetTx;
        tyRef.current = targetTy;
        visualZoomRef.current = targetZoom;
        applyTransform();
        // Still commit if we're arriving at a non-1 zoom (e.g. a second
        // same-anchor click after the first commit hasn't run yet).
        if (targetZoom !== 1) commit();
        return;
      }

      const startTime = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const e = easeOutCubic(t);
        txRef.current = startTx + (targetTx - startTx) * e;
        tyRef.current = startTy + (targetTy - startTy) * e;
        visualZoomRef.current = startZoom + (targetZoom - startZoom) * e;
        applyTransform();
        if (t < 1) {
          panAnimRafId = requestAnimationFrame(tick);
        } else {
          panAnimRafId = null;
          // Commit the visualZoom into the canvas scale for crisp text
          // if we changed zoom. No-op if visualZoom ended at 1.
          if (zoomChanging) commit();
        }
      };
      panAnimRafId = requestAnimationFrame(tick);
    };

    const panBy = (dx: number, dy: number) => {
      cancelPanAnim();
      txRef.current += dx;
      tyRef.current += dy;
      clampPan();
      applyTransform();
    };

    // Zoom anchored at viewport coords (cx, cy): the content point under
    // the cursor stays under the cursor. Derivation:
    //   before: content point in "raw" coords pc = (cx - tx) / z_old
    //   after:  cx = tx_new + pc * z_new
    //   ->      tx_new = cx - (cx - tx_old) * z_new / z_old
    //                  = cx + (tx_old - cx) * z_new / z_old
    const zoomBy = (factor: number, cx: number, cy: number) => {
      cancelPanAnim();
      const oldZoom = visualZoomRef.current;
      const committed = useDocumentStore.getState().scale;
      const clampedCombined = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, committed * oldZoom * factor),
      );
      const newZoom = clampedCombined / committed;
      if (newZoom === oldZoom) return;
      const actualFactor = newZoom / oldZoom;
      txRef.current = cx + (txRef.current - cx) * actualFactor;
      tyRef.current = cy + (tyRef.current - cy) * actualFactor;
      visualZoomRef.current = newZoom;
      // Re-apply mode-aware bounds as the zoom crosses between FIT and
      // PAN modes. Without this the cursor-anchored tx/ty math above can
      // leave the page in a transient out-of-bounds state (e.g. a gap
      // between the page edge and the sidebar while zoomed in, or the
      // page still off-center after dropping into FIT mode). Clamping
      // per zoom step snaps the page to its valid position the instant
      // the mode flips, instead of waiting for the next pan event or
      // the commit debounce to correct it.
      clampPan();
      applyTransform();
      scheduleCommit();
    };

    // Roll the preview CSS zoom into an actual canvas re-render. The math
    // works out so tx/ty can stay put — post-commit the canvas is larger
    // by exactly the factor the transform was scaling by, so the visual
    // position of every content point is unchanged.
    const commit = () => {
      commitTimer = null;
      const v = visualZoomRef.current;
      if (v === 1) return;
      const { scale: oldScale, setScale } = useDocumentStore.getState();
      const target = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * v));
      visualZoomRef.current = 1;
      applyTransform();
      if (target !== oldScale) setScale(target);
    };

    const scheduleCommit = () => {
      if (commitTimer !== null) clearTimeout(commitTimer);
      commitTimer = window.setTimeout(commit, COMMIT_DEBOUNCE_MS);
    };

    // --- centering helper --------------------------------------------
    // Horizontally centers the pages in the viewport at the current
    // visual zoom. By default leaves the vertical scroll position alone
    // — the user's usually centering because the page drifted sideways
    // and they don't want to jump back to page 1. `resetVertical: true`
    // is used only by the initial mount centering below.
    const centerView = ({ resetVertical = false } = {}): boolean => {
      const firstPage = canvas.querySelector('[data-page]') as HTMLElement | null;
      if (!firstPage) return false;
      const pageW = firstPage.offsetWidth;
      if (pageW <= 0) return false;
      const vw = viewport.clientWidth;
      if (vw <= 0) return false;

      // Wait for the DOM-reported page width to match the width we
      // just asked react-pdf to render at. On first mount the
      // useResizeObserver hook boots at a default of 800 px before
      // the ResizeObserver delivers the real width asynchronously,
      // which forces a render with a stale pageWidth followed by a
      // re-render at the correct one. If we center in that window,
      // `pageWidthRef.current` (the target) and `firstPage.offsetWidth`
      // (current DOM) disagree — `clampPan` uses `canvas.offsetWidth`
      // which is stale, so `tx` ends up pinned to a value that's wrong
      // for the canvas's final rendered size. Retrying until they
      // agree avoids the one-off off-center on first PDF load.
      const targetW = pageWidthRef.current;
      if (targetW <= 0 || Math.abs(pageW - targetW) > 4) return false;

      const visualPageWidth = pageW * visualZoomRef.current;
      txRef.current = (vw - visualPageWidth) / 2;
      if (resetVertical) tyRef.current = 24;
      clampPan();
      applyTransform();
      return true;
    };

    // Exposed so the viewport-resize effect can re-apply mode-aware
    // bounds when the user drags a sidebar (see the component-level
    // useEffect above). FIT mode will re-center, PAN mode will keep
    // the current tx but re-bind it to the new viewport edges.
    rebalanceRef.current = () => {
      if (!hasInitializedRef.current) return;
      clampPan();
      applyTransform();
    };

    // --- initial centering -------------------------------------------
    // pdf.js renders async, so the first-page DOM/layout may not exist
    // yet. We retry every frame until centerView() succeeds. Called both
    // on mount and whenever the pdfUrl effect above detects a new
    // document (via kickInitialCenterRef).
    let initFrameIds: number[] = [];
    const cancelInitFrames = () => {
      for (const id of initFrameIds) cancelAnimationFrame(id);
      initFrameIds = [];
    };
    const kickInitialCenter = () => {
      cancelInitFrames();
      const tryInitialCenter = () => {
        if (hasInitializedRef.current) return;
        if (!centerView({ resetVertical: true })) {
          initFrameIds.push(requestAnimationFrame(tryInitialCenter));
          return;
        }
        hasInitializedRef.current = true;
      };
      initFrameIds.push(requestAnimationFrame(tryInitialCenter));
    };
    kickInitialCenterRef.current = kickInitialCenter;
    kickInitialCenter();

    // --- wheel --------------------------------------------------------
    const onWheel = (e: WheelEvent) => {
      // Ignore wheel while a Safari gesture is in flight — those events
      // are duplicates and fight the cumulative e.scale math below.
      if (gestureActive) return;
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const rect = viewport.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // Multiplicative zoom keeps perceived gesture size constant across
        // zoom levels.
        const factor = Math.exp(-e.deltaY * 0.005);
        zoomBy(factor, cx, cy);
        return;
      }

      // Pan — behavior depends on FIT vs PAN mode (see axis-snap section
      // above). In FIT mode horizontal is locked because the page
      // already fits between the sidebars; in PAN mode we soft-snap
      // near-axis gestures with a 0.2/0.4 smoothstep deadzone so
      // diagonals still work.
      const fitMode = isPageFitHorizontally();

      if (e.shiftKey) {
        // Classic shift+wheel convention for mouse wheels with no deltaX.
        // In FIT mode there's no horizontal room, so we drop it.
        if (!fitMode) panBy(-e.deltaY, 0);
        return;
      }

      let dx = e.deltaX;
      let dy = e.deltaY;

      if (fitMode) {
        // FIT mode — only vertical scroll through the document.
        dx = 0;
      } else {
        // PAN mode — smoothstep axis lock with room for diagonals.
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX > 0 && absY > 0) {
          if (absX < absY) dx *= panModeAxisSnap(absX / absY);
          else dy *= panModeAxisSnap(absY / absX);
        }
      }

      panBy(-dx, -dy);
    };

    // --- Safari gesture events ---------------------------------------
    type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureActive = true;
      gestureStartVisualZoom = visualZoomRef.current;
      if (commitTimer !== null) {
        clearTimeout(commitTimer);
        commitTimer = null;
      }
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as GestureEvent;
      const rect = viewport.getBoundingClientRect();
      const cx = ge.clientX - rect.left;
      const cy = ge.clientY - rect.top;
      // ge.scale is cumulative from gesturestart, not a delta. Compose
      // against the preview we had at gesturestart so an ongoing
      // mid-preview zoom stacks correctly.
      const targetVisualZoom = gestureStartVisualZoom * (ge.scale || 1);
      const factor = targetVisualZoom / visualZoomRef.current;
      zoomBy(factor, cx, cy);
    };

    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureActive = false;
      if (commitTimer !== null) clearTimeout(commitTimer);
      commit();
    };

    // Toolbar-button zooms bypass all of the above — they call setScale
    // directly on the store. Kick the page tracker when that happens so
    // the toolbar's "Page n / N" readout stays current.
    const unsubStore = useDocumentStore.subscribe((s, prev) => {
      if (s.scale !== prev.scale) {
        schedulePageTrack();
        // Scale changed externally (toolbar zoom buttons or the
        // click-to-reset-100% readout). Canvas rebuilds at a new width
        // on the next React commit, so re-running clampPan afterward
        // re-centers the page in FIT mode or re-binds it to the
        // sidebar edges in PAN mode — without this, the page stays at
        // its pre-scale tx until the user's first manual pan snaps
        // it into place.
        requestAnimationFrame(() => {
          clampPan();
          applyTransform();
        });
      }
    });

    // --- pan to an anchor (chat or note) -----------------------------
    // When the user opens a chat or note, pan the canvas so the anchor
    // is visible (centered in the viewport). The page element for the
    // anchor may not be in the DOM yet (pdf.js renders pages lazily),
    // so we retry a few frames before giving up.
    const panToAnchor = (anchor: { pageNumber: number; x: number; y: number; width?: number; height?: number }) => {
      let retries = 0;
      const attempt = () => {
        // Gate on initial centering. When the click is a chat/note on a
        // PDF that isn't currently loaded, the subscription fires right
        // after `openDocument` swaps `pdfUrl` — but pdf.js hasn't yet
        // re-rendered the new doc's pages. Reading `pageEl.offsetWidth`
        // in that window returns the previous doc's stale width (or a
        // pre-layout transient), which makes `rawFitVisualZoom` below
        // compute a huge value that clamps to `MAX_SCALE` (4×). The
        // viewer ends up zoomed into the top-left corner. Waiting for
        // `hasInitializedRef` — only set true after centerView confirms
        // the first page's DOM width matches the target render width —
        // guarantees the new document is laid out before we measure.
        if (!hasInitializedRef.current) {
          if (retries++ < 180) requestAnimationFrame(attempt);
          return;
        }
        const pageEl = canvas.querySelector<HTMLElement>(
          `[data-page="${anchor.pageNumber}"]`,
        );
        if (!pageEl || pageEl.offsetWidth <= 0) {
          if (retries++ < 180) requestAnimationFrame(attempt);
          return;
        }
        // Same-story guard for the specific page being navigated to:
        // pages past the first can lag a frame or two while react-pdf
        // lays them out. If this page's `offsetWidth` doesn't match the
        // target width we just handed to react-pdf, the fit-zoom math
        // below will be wrong too — wait another frame.
        if (
          pageWidthRef.current > 0 &&
          Math.abs(pageEl.offsetWidth - pageWidthRef.current) > 4
        ) {
          if (retries++ < 180) requestAnimationFrame(attempt);
          return;
        }
        const centerXInPage = ((anchor.x + (anchor.width ?? 0) / 2) / 100) * pageEl.offsetWidth;
        const centerYInPage = ((anchor.y + (anchor.height ?? 0) / 2) / 100) * pageEl.offsetHeight;
        const centerYInCanvas = pageEl.offsetTop + centerYInPage;
        // `centerXInPage` is not used below — kept as the computed
        // document anchor center for reference (the horizontal target
        // centers the PAGE, not the anchor, so only y is needed).
        void centerXInPage;

        // Fit-width target zoom: page's visual width lands just inside
        // the viewport with a small breathing margin on each side.
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const FIT_MARGIN = 48; // 24 px each side
        const committed = useDocumentStore.getState().scale;
        const rawFitVisualZoom = (vw - FIT_MARGIN) / pageEl.offsetWidth;
        const combinedClamped = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, committed * rawFitVisualZoom),
        );
        const targetZoom = combinedClamped / committed;

        // Horizontal: center the PAGE (all pages have offsetLeft=0).
        // Vertical: anchor center at viewport center.
        const pageMidXInCanvas = pageEl.offsetLeft + pageEl.offsetWidth / 2;
        const targetTx = vw / 2 - pageMidXInCanvas * targetZoom;
        const targetTy = vh / 2 - centerYInCanvas * targetZoom;
        animatePanTo(targetTx, targetTy, targetZoom);
      };
      attempt();
    };

    const unsubChat = useChatStore.subscribe((s, prev) => {
      if (s.activeChatId && s.activeChatId !== prev.activeChatId) {
        const chat = s.chats.find((c) => c.id === s.activeChatId);
        if (chat) panToAnchor(chat.anchor);
        // Opening ANYTHING clears a stale preview — covers paths that
        // don't go through the sidebar rows (e.g. creating a chat from
        // the selection popup).
        usePreviewStore.getState().clearPreview();
      }
    });

    // Same story for notes — opening a different note pans the canvas
    // to its anchor so the user sees where it lives on the PDF.
    const unsubNote = useNoteStore.subscribe((s, prev) => {
      const prevId = prev.activeNote?.id ?? null;
      const nextId = s.activeNote?.id ?? null;
      if (nextId && nextId !== prevId && s.activeNote) {
        panToAnchor(s.activeNote.anchor);
        usePreviewStore.getState().clearPreview();
      }
    });

    // Preview (single-click-but-not-opened) pans to the anchor too, so
    // selecting a chat/note in the sidebar already brings the PDF to
    // the right position before the user decides whether to open it.
    const unsubPreview = usePreviewStore.subscribe((s, prev) => {
      const prevId = prev.previewed?.id ?? null;
      const nextId = s.previewed?.id ?? null;
      if (nextId && nextId !== prevId && s.previewed) {
        panToAnchor(s.previewed.anchor);
      }
    });

    // Esc-anywhere clears any active preview. Skipped when an input,
    // textarea, or contentEditable has focus — those typically use Esc
    // for their own cancel actions (search bar clear, inline-rename
    // cancel, selection-popup dismiss) and we don't want to fight them.
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const ae = document.activeElement as HTMLElement | null;
      if (
        ae instanceof HTMLInputElement ||
        ae instanceof HTMLTextAreaElement ||
        ae?.isContentEditable
      ) {
        return;
      }
      if (usePreviewStore.getState().previewed) {
        usePreviewStore.getState().clearPreview();
        // Blur the previously-clicked button. Chrome (unlike Safari)
        // paints its default :focus outline on a button after a click
        // and only removes it when focus moves elsewhere — without
        // this, clearing preview leaves a stray indigo border around
        // the row the user just deselected. Blurring drops focus to
        // <body> so the outline goes with it.
        if (ae && typeof ae.blur === 'function') ae.blur();
      }
    };

    // Click anywhere in the viewport (the empty slate-950 background or
    // a non-anchor area of a PDF page) clears the preview. Anchor
    // buttons and the page-number badge call `e.stopPropagation()` in
    // their own onClicks so they don't reach this handler — only true
    // "click into nothing" gestures land here.
    const onViewportClick = (_e: MouseEvent) => {
      if (usePreviewStore.getState().previewed) {
        usePreviewStore.getState().clearPreview();
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('gesturestart', onGestureStart);
    viewport.addEventListener('gesturechange', onGestureChange);
    viewport.addEventListener('gestureend', onGestureEnd);
    viewport.addEventListener('click', onViewportClick);
    document.addEventListener('keydown', onDocKeyDown);

    return () => {
      if (commitTimer !== null) clearTimeout(commitTimer);
      if (pageTrackRafId !== null) cancelAnimationFrame(pageTrackRafId);
      cancelInitFrames();
      kickInitialCenterRef.current = () => {};
      rebalanceRef.current = () => {};
      cancelPanAnim();
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
      viewport.removeEventListener('gestureend', onGestureEnd);
      viewport.removeEventListener('click', onViewportClick);
      document.removeEventListener('keydown', onDocKeyDown);
      unsubStore();
      unsubChat();
      unsubNote();
      unsubPreview();
    };
    // Deliberately empty deps: effect reads mutable state via refs and
    // store.getState(). Re-attaching on scale change would drop in-flight
    // gestures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pdfUrl) return null;

  // Base fit-width (capped), then multiply by committed zoom scale to get
  // the render width passed into react-pdf's canvas. Rendering wider =
  // crisper text at high zoom (no blurry CSS scaling) at the cost of a
  // bigger canvas.
  const basePageWidth = Math.min(containerWidth - 48, 900);
  const pageWidth = basePageWidth * scale;
  // Mirror to ref so the pan/zoom effect can read it without needing to
  // re-run when scale or containerWidth changes.
  pageWidthRef.current = pageWidth;

  return (
    <div
      ref={viewportRef}
      className="h-full overflow-hidden relative bg-slate-950"
      // touch-action: none → browser forwards all gestures to JS (needed
      // for smooth pinch/two-finger pan on touch). overscroll-behavior:
      // contain → prevents bounce from leaking to the parent.
      // We deliberately DO NOT set user-select:none here — doing so would
      // cascade to the pdf.js text layer and break drag-to-highlight text
      // selection. Panning is wheel/pinch only, so there's no mouse-drag
      // conflict to guard against.
      style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
    >
      <div
        ref={canvasRef}
        className="absolute top-0 left-0"
        style={{
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
          {Array.from({ length: pageCount }, (_, i) => (
            <PdfPage key={i + 1} pageNumber={i + 1} width={pageWidth} />
          ))}
        </Document>
      </div>
    </div>
  );
}
