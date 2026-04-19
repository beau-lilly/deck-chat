import { useCallback, useRef, useEffect } from 'react';
import { Document } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfPage from './PdfPage';
import { useDocumentStore, MIN_SCALE, MAX_SCALE } from '../../stores/documentStore';

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

  // Reset the "have we centered?" flag when a new document loads so the
  // next render re-centers it.
  useEffect(() => {
    hasInitializedRef.current = false;
  }, [pdfUrl]);

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
    // Per-event deadzone for the off-axis component: if one delta is
    // much smaller than the other, damp it so near-axis gestures snap
    // cleanly. Evaluated per wheel event (not per burst) so the user
    // can smoothly transition between horizontal, diagonal, and vertical
    // motion within a single gesture.
    //
    //   ratio = |smallerAxis| / |largerAxis|
    //   ratio ≤ SNAP_DEAD → smaller axis is zeroed (snap to dominant)
    //   ratio ≥ SNAP_SOFT → full pass-through (free 2D pan)
    //   in between        → smoothstep ramp (no visible snap threshold)
    //
    // Tuning:
    //   SNAP_DEAD=SNAP_SOFT=1.0 → pure axis lock. Every wheel event has
    //   its smaller-axis delta zeroed out, so the pan is always
    //   orthogonal (purely horizontal or purely vertical) regardless of
    //   the gesture angle. This is the maximum snap this model allows —
    //   going further would require flipping to a different strategy.
    const SNAP_DEAD = 1.0;
    const SNAP_SOFT = 1.0;
    const axisSnapMultiplier = (ratio: number): number => {
      if (ratio <= SNAP_DEAD) return 0;
      if (ratio >= SNAP_SOFT) return 1;
      const t = (ratio - SNAP_DEAD) / (SNAP_SOFT - SNAP_DEAD);
      return t * t * (3 - 2 * t); // smoothstep
    };

    // --- core: transform + page tracking ------------------------------
    const applyTransform = () => {
      canvas.style.transform = `translate3d(${txRef.current}px, ${tyRef.current}px, 0) scale(${visualZoomRef.current})`;
      schedulePageTrack();
    };

    // Rough bounds: viewport size vs content size × current visual zoom,
    // plus PAN_MARGIN so the user can swing slightly past the edges.
    const clampPan = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const cw = canvas.offsetWidth * visualZoomRef.current;
      const ch = canvas.offsetHeight * visualZoomRef.current;
      const slack = PAN_MARGIN;
      if (cw <= vw) {
        txRef.current = Math.max(-slack, Math.min(vw - cw + slack, txRef.current));
      } else {
        txRef.current = Math.max(vw - cw - slack, Math.min(slack, txRef.current));
      }
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

    const panBy = (dx: number, dy: number) => {
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

    // --- initial centering --------------------------------------------
    // pdf.js renders async, so canvas.offsetWidth is 0 for a few frames
    // after mount. Keep checking each frame until pages materialize, then
    // center horizontally and anchor near the top.
    // pdf.js renders async, so canvas.offsetWidth is 0 or partial for
    // a few frames after mount. We wait until the DOM has actually
    // started laying out pages, then center using our KNOWN target
    // `pageWidth` (not offsetWidth, which can still be mid-render).
    const initFrameIds: number[] = [];
    const tryInitialCenter = () => {
      if (hasInitializedRef.current) return;
      // Need at least one page in the DOM to know the layout has started.
      const firstPage = canvas.querySelector('[data-page]') as HTMLElement | null;
      if (!firstPage || firstPage.offsetWidth <= 0) {
        initFrameIds.push(requestAnimationFrame(tryInitialCenter));
        return;
      }
      const vw = viewport.clientWidth;
      const cw = pageWidthRef.current || firstPage.offsetWidth;
      txRef.current = Math.max(0, (vw - cw) / 2);
      tyRef.current = 24;
      hasInitializedRef.current = true;
      applyTransform();
    };
    initFrameIds.push(requestAnimationFrame(tryInitialCenter));

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

      // Pan. Native overflow: auto applies strict direction locking to
      // trackpad gestures, which makes diagonal swipes feel jerky. We do
      // our own with a soft deadzone so near-axis gestures snap cleanly
      // but the user can pan diagonally — and mix axes within one
      // gesture — freely.
      if (e.shiftKey) {
        // Classic shift+wheel convention for mouse wheels with no deltaX.
        panBy(-e.deltaY, 0);
        return;
      }

      let dx = e.deltaX;
      let dy = e.deltaY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX > 0 && absY > 0) {
        if (absX < absY) dx *= axisSnapMultiplier(absX / absY);
        else dy *= axisSnapMultiplier(absY / absX);
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
      if (s.scale !== prev.scale) schedulePageTrack();
    });

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('gesturestart', onGestureStart);
    viewport.addEventListener('gesturechange', onGestureChange);
    viewport.addEventListener('gestureend', onGestureEnd);

    return () => {
      if (commitTimer !== null) clearTimeout(commitTimer);
      if (pageTrackRafId !== null) cancelAnimationFrame(pageTrackRafId);
      for (const id of initFrameIds) cancelAnimationFrame(id);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
      viewport.removeEventListener('gestureend', onGestureEnd);
      unsubStore();
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
