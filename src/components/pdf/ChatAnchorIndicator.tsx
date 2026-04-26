import { useState } from 'react';
import { MessageCircle, MessageSquarePlus, StickyNote } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { usePreviewStore } from '../../stores/previewStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useChatsForDocument, useNotesForDocument } from '../../data/liveQueries';
import DelayedTooltip from '../shared/DelayedTooltip';
import type { ChatAnchor } from '../../types';

type Kind = 'chat' | 'note';
type Brightness = 'bright' | 'faint';

interface Props {
  pageNumber: number;
}

interface Mark {
  key: string;
  kind: Kind;
  /** id of the underlying chat or note — used by the click handler
   *  to route to the right store action. */
  id: string;
  /** Display title — surfaced as the native browser tooltip on hover.
   *  For chat anchors it's the auto-titled chat title; for notes the
   *  user-set (or default) note title. */
  title: string;
  anchor: ChatAnchor;
  brightness: Brightness;
  /** Active and previewed marks render with a soft pulse so the eye
   *  is drawn back to the current focus. Faint marks (the toolbar's
   *  show-all view) stay still — pulsing dozens of indicators at once
   *  would be visually loud. */
  pulse: boolean;
  /** True for the currently-active chat/note. We skip the activate
   *  click for these since they're already in the panel — clicking
   *  again would just be a no-op user-facing. */
  isActive: boolean;
}

/**
 * "Slide-wide" anchors cover the entire page — produced by clicking
 * the page-number badge's "Ask about this slide". Rendering them as
 * a giant overlay would (and previously did) eat every click on the
 * page, swallowing clicks meant for other anchors and blocking
 * region-drag selection. We detect them here so they can be lifted
 * out of the spatial overlay and rendered as small icon chips next
 * to the page badge instead.
 */
function isSlideWide(a: ChatAnchor): boolean {
  return (
    (a.x ?? 0) <= 1 &&
    (a.y ?? 0) <= 1 &&
    (a.width ?? 0) >= 99 &&
    (a.height ?? 0) >= 99
  );
}

/**
 * Renders chat/note anchor highlights over a PDF page.
 *
 * Three layers stack here:
 *
 *   1. (optional) the "show all anchors" layer: when the toolbar
 *      toggle is on, every chat and note anchored to this page
 *      renders as a faint outline/highlight so the user can see all
 *      their annotations at a glance.
 *
 *   2. the previewed mark — single-clicked but not yet opened — gets
 *      a slightly brighter version of the same color. Skipped if the
 *      previewed item is already the active one.
 *
 *   3. the active mark — the chat/note currently filling the right
 *      panel — gets the brightest version + a pulse animation. Note
 *      takes precedence over chat because clicking a note explicitly
 *      closes any active chat (see AppLayout / NoteNode).
 *
 * Color vocabulary:
 *   - chats → indigo (the same blue used in the chat sidebar palette)
 *   - notes → amber (matches NoteNode, NotePanel, the Note-mode popup)
 *
 * Text-vs-region within a kind:
 *   - region anchors → ring-dominant (an outlined box, like an
 *     area selection)
 *   - text anchors   → fill-dominant (a highlighter swipe over text)
 *   …with a slight shade tweak (-300 vs -400) so the two read as
 *   visually distinct without leaving their parent palette.
 *
 * Border thickness is always 1 px (`ring-1`) — the previous 2 px ring
 * on bright marks felt like a thick border around someone's selection.
 */
export default function ChatAnchorIndicator({ pageNumber }: Props) {
  const activeChat = useChatStore((s) =>
    s.activeChatId ? s.chats.find((c) => c.id === s.activeChatId) ?? null : null,
  );
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const activeNote = useNoteStore((s) => s.activeNote);
  const closeNote = useNoteStore((s) => s.closeNote);
  const openNote = useNoteStore((s) => s.openNote);
  const previewed = usePreviewStore((s) => s.previewed);
  const showAll = useLayoutStore((s) => s.showAllAnchors);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const selectWholeSlide = useSelectionStore((s) => s.selectWholeSlide);

  // Always subscribe (when there's an active doc) — slide-wide chips
  // must render whether or not the show-all toggle is on. The empty-
  // string short-circuit still kicks in when no doc is loaded.
  const allChats = useChatsForDocument(activeDocumentId ?? '');
  const allNotes = useNotesForDocument(activeDocumentId ?? '');

  // True if any SLIDE-WIDE anchor (chat or note created via the
  // page-number badge's "Ask about this slide" path) lives on this
  // page. Spatial chats/notes are deliberately excluded — those have
  // their own visible representations on the page (region/text
  // highlights when show-all is on, or as the active/preview mark)
  // so the dot would be redundant for them. The dot's specific job
  // is signaling slide-wide annotations, which otherwise have no
  // visible representation until the user hovers the badge.
  //
  // Archived chats are excluded — the right-panel list filters them
  // too, so the dot would otherwise lie about pages whose only
  // slide-wide chats are archived. Number() coerces in case any
  // legacy row stored pageNumber as a string (strict === would
  // silently miss those).
  const hasSlideWideAnchorsOnPage =
    allChats.some(
      (c) =>
        !c.archived &&
        Number(c.anchor.pageNumber) === pageNumber &&
        isSlideWide(c.anchor),
    ) ||
    allNotes.some(
      (n) =>
        Number(n.anchor.pageNumber) === pageNumber && isSlideWide(n.anchor),
    );

  // For previewed marks we only know the kind/id/anchor — look up
  // the title from chats / notes liveQueries so the tooltip is right.
  const titleForPreview = (() => {
    if (!previewed) return '';
    if (previewed.kind === 'chat') {
      return allChats.find((c) => c.id === previewed.id)?.title ?? '';
    }
    return allNotes.find((n) => n.id === previewed.id)?.title ?? '';
  })();

  // Resolve the single "active" mark (priority: note > chat).
  let activeKey: string | null = null;
  let activeMark: Mark | null = null;
  if (activeNote) {
    activeKey = `note:${activeNote.id}`;
    if (activeNote.anchor.pageNumber === pageNumber) {
      activeMark = {
        key: `active-${activeKey}`,
        kind: 'note',
        id: activeNote.id,
        title: activeNote.title,
        anchor: activeNote.anchor,
        brightness: 'bright',
        pulse: true,
        isActive: true,
      };
    }
  } else if (activeChat) {
    activeKey = `chat:${activeChat.id}`;
    if (activeChat.anchor.pageNumber === pageNumber) {
      activeMark = {
        key: `active-${activeKey}`,
        kind: 'chat',
        id: activeChat.id,
        title: activeChat.title,
        anchor: activeChat.anchor,
        brightness: 'bright',
        pulse: true,
        isActive: true,
      };
    }
  }

  // Resolve the "previewed" mark only if it isn't the same as the
  // active one (otherwise we'd render two marks on top of each
  // other for the same anchor).
  let previewKey: string | null = null;
  let previewMark: Mark | null = null;
  if (previewed) {
    previewKey = `${previewed.kind}:${previewed.id}`;
    if (previewKey !== activeKey && previewed.anchor.pageNumber === pageNumber) {
      previewMark = {
        key: `preview-${previewKey}`,
        kind: previewed.kind,
        id: previewed.id,
        title: titleForPreview,
        anchor: previewed.anchor,
        // Previewed marks are bright too — the user just clicked
        // them and wants to see where they are — but they're rendered
        // through the same code path as the active mark with pulse on.
        brightness: 'bright',
        pulse: true,
        isActive: false,
      };
    }
  }

  // Build the faint backdrop layer. Skip anchors that are already
  // covered by the active or preview mark so we don't stack two
  // highlights of the same anchor.
  //
  // Slide-wide anchors render their faint chips ALWAYS — they're
  // entry points to chats/notes that don't have a spatial location
  // on the page, so without persistent visibility the user couldn't
  // discover them. Spatial anchors (region/text) only render faintly
  // when the toolbar's show-all toggle is on, since they'd otherwise
  // double up with whatever's actively selected and clutter the page.
  const faintMarks: Mark[] = [];
  for (const c of allChats) {
    if (c.anchor.pageNumber !== pageNumber) continue;
    const k = `chat:${c.id}`;
    if (k === activeKey || k === previewKey) continue;
    if (!isSlideWide(c.anchor) && !showAll) continue;
    faintMarks.push({
      key: `faint-${k}`,
      kind: 'chat',
      id: c.id,
      title: c.title,
      anchor: c.anchor,
      brightness: 'faint',
      pulse: false,
      isActive: false,
    });
  }
  for (const n of allNotes) {
    if (n.anchor.pageNumber !== pageNumber) continue;
    const k = `note:${n.id}`;
    if (k === activeKey || k === previewKey) continue;
    if (!isSlideWide(n.anchor) && !showAll) continue;
    faintMarks.push({
      key: `faint-${k}`,
      kind: 'note',
      id: n.id,
      title: n.title,
      anchor: n.anchor,
      brightness: 'faint',
      pulse: false,
      isActive: false,
    });
  }

  // No early return — the page-number badge in the bottom cluster
  // must always render, even when this page has zero anchors.

  // Click handler — routes the panel to the corresponding chat or
  // note. Skipped on already-active marks (no observable change).
  // Doesn't go through the preview cycle because clicking an anchor
  // ON the page is a deliberate "I want to read this thread" action,
  // not a "let me preview" hover-style intent.
  const activate = (mark: Mark) => {
    if (mark.isActive) return;
    usePreviewStore.getState().clearPreview();
    if (mark.kind === 'chat') {
      closeNote();
      setActiveChat(mark.id);
    } else {
      setActiveChat(null);
      void openNote(mark.id);
    }
  };

  // Split off slide-wide anchors. Rendering them as full-page overlay
  // boxes would cover every other anchor on the page (and block region
  // drag-selection), so they get a separate compact icon-chip layer
  // stacked above the page-number badge instead.
  const allMarks: Mark[] = [
    ...faintMarks,
    ...(previewMark ? [previewMark] : []),
    ...(activeMark ? [activeMark] : []),
  ];
  const spatialMarks = allMarks.filter((m) => !isSlideWide(m.anchor));
  const slideWideMarks = allMarks
    .filter((m) => isSlideWide(m.anchor))
    .slice()
    .sort((a, b) => importance(a) - importance(b));

  return (
    <>
      {/* Spatial layer — region/text anchors render as positioned
          highlight boxes. Painted in low-to-high-importance order so
          bright pulses end up on top: faint < preview < active. */}
      {spatialMarks
        .slice()
        .sort((a, b) => importance(a) - importance(b))
        .map((m) => (
          <AnchorMark key={m.key} mark={m} onActivate={activate} />
        ))}

      {/* Bottom-right cluster.
       *
       * Layout: `flex-col-reverse` puts the badge FIRST in the DOM
       * but visually at the bottom. The chip container comes AFTER
       * in DOM (so Tailwind's `peer-hover/badge:` modifier — which
       * only targets later siblings — can reach it) but visually
       * above the badge.
       *
       * Behavior:
       *   - Badge always visible with the chat icon + page number
       *     (the persistent, indicator-shaped affordance the user
       *     asked for).
       *   - Chip stack hidden at rest (opacity-0 + translate-y, plus
       *     pointer-events-none so the invisible chip area doesn't
       *     intercept clicks meant for content beneath it).
       *   - Hovering the badge fires peer-hover/badge → chips fade
       *     in and slide UP from a tucked-behind position.
       *   - Hovering the chip container itself ALSO keeps the chips
       *     visible (`hover:` modifier), so cursor travel from badge
       *     to chips doesn't make them flicker out.
       *   - The chip container's bottom padding bridges the gap to
       *     the badge so cursor never lands on dead space between
       *     them. The padding is part of the chip container's hit
       *     area but not its visible content.
       */}
      <div className="group/cluster absolute bottom-2 right-3 z-20 flex flex-col-reverse items-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            selectWholeSlide(pageNumber);
          }}
          aria-label={
            showAll && hasSlideWideAnchorsOnPage
              ? `Ask about slide ${pageNumber} (has slide-wide annotations)`
              : `Ask about slide ${pageNumber}`
          }
          // `peer/badge` drives the chip-stack's peer-hover reveal
          // (siblings only). `group/tooltip` lets the
          // DelayedTooltip child (the "Attend to the whole page"
          // hint) react to direct hover on the badge specifically.
          // `relative` positions both the dot and the tooltip in
          // the badge's coordinate space.
          className="peer/badge group/tooltip relative flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors bg-slate-900/70 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          {showAll && hasSlideWideAnchorsOnPage && (
            // "This page has slide-wide annotations" indicator.
            // Positioned at the badge's top-right corner — slightly
            // INSIDE the corner now (-0.5 instead of -1 on each
            // axis) so it reads as anchored to the badge rather
            // than floating outside it. Uses `group-hover/cluster:`
            // (not `group-hover/badge:`) so the dot stays hidden
            // while the cursor is anywhere in the cluster —
            // including the chip stack above the badge — instead
            // of reappearing the moment the cursor leaves the
            // badge to hover the chips. The chip container's pb-1
            // hover-bridge keeps cluster hover continuous between
            // badge and chips.
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full pointer-events-none transition-opacity duration-150 group-hover/cluster:opacity-0"
              style={{ backgroundColor: '#a2d9f5' }}
            />
          )}
          <MessageSquarePlus size={11} />
          {pageNumber}
          {/* "Attend to the whole page" tooltip — shows ONLY when
              the badge itself is hovered, not when the cursor is on
              the extended chip stack. The chip container's own hover
              keeps chips visible without propagating hover up to the
              badge, so direct-badge hover is the discriminator.
              `below-right` aligns the tooltip's right edge with the
              badge so its text extends leftward past the icon —
              matches the "below the page number, to the left of the
              icon" placement. */}
          <DelayedTooltip position="below-right">
            Attend to the whole page
          </DelayedTooltip>
        </button>
        {slideWideMarks.length > 0 && (
          <div
            className="flex flex-col gap-1 items-end pb-1 transition-all duration-200 ease-out opacity-0 translate-y-2 pointer-events-none peer-hover/badge:opacity-100 peer-hover/badge:translate-y-0 peer-hover/badge:pointer-events-auto hover:opacity-100 hover:translate-y-0 hover:pointer-events-auto"
          >
            {slideWideMarks.map((m) => (
              <SlideWideAnchorChip key={m.key} mark={m} onActivate={activate} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Lower number paints first, higher number paints on top. Used to
// stack faint marks under preview/active marks regardless of the
// order in which we built them.
function importance(m: Mark): number {
  if (m.brightness === 'faint') return 0;
  if (m.isActive) return 2;
  return 1;
}

function AnchorMark({
  mark,
  onActivate,
}: {
  mark: Mark;
  onActivate: (m: Mark) => void;
}) {
  const { kind, anchor, title, brightness, pulse, isActive } = mark;
  const [hover, setHover] = useState(false);

  // `description` is populated by the text-selection flow and left
  // undefined for region selections — the discriminator between
  // text-style (highlighter) and region-style (outline) presentations.
  const isText =
    typeof anchor.description === 'string' && anchor.description.length > 0;

  // Collapsed text ranges (zero width/height) get a small visible
  // floor so the indicator stays findable.
  const width = Math.max(anchor.width ?? 0, 0.5);
  const height = Math.max(anchor.height ?? 0, 0.5);

  const ariaLabel = title
    ? `${kind === 'note' ? 'Open note' : 'Open chat'}: ${title}`
    : kind === 'note' ? 'Open note' : 'Open chat';

  // Anchors near the very top of the page would have their above-
  // tooltip clipped by whatever's above them; flip the tooltip below
  // in that case.
  const tooltipBelow = (anchor.y ?? 0) < 8;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={(e) => {
        // Stop bubbling so the viewport's click-to-clear-preview and
        // a region-mode SelectionOverlay don't also see this click.
        e.stopPropagation();
        onActivate(mark);
      }}
      // z-10 explicitly so anchor marks always sit above SelectionOverlay
      // (no z-index) regardless of DOM-order quirks across browsers.
      // The slide-wide cluster lives at z-20 above the page-badge area
      // so it can't be obscured either.
      // `cursor-pointer` instead of the previous `pointer-events: none`
      // div — already-active marks get `cursor-default` since clicking
      // them is a no-op.
      className={`absolute z-10 rounded-sm transition-colors ${
        isActive ? 'cursor-default' : 'cursor-pointer'
      } ${pulse ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''} ${styleFor(
        kind,
        isText,
        brightness,
      )}`}
      style={{
        left: `${anchor.x}%`,
        top: `${anchor.y}%`,
        width: `${width}%`,
        height: `${height}%`,
      }}
    >
      {hover && title && (
        <AnchorTooltip kind={kind} side={tooltipBelow ? 'below' : 'above'}>
          {title}
        </AnchorTooltip>
      )}
    </button>
  );
}

/**
 * Compact icon button for a slide-wide anchor (chat/note anchored to
 * the entire page via "Ask about this slide"). Stacks vertically in
 * the bottom-right cluster above the page badge — small enough that
 * even half a dozen of them on one slide stay tidy. Hover shows the
 * underlying chat/note title via the native tooltip.
 */
function SlideWideAnchorChip({
  mark,
  onActivate,
}: {
  mark: Mark;
  onActivate: (m: Mark) => void;
}) {
  const { kind, title, brightness, pulse, isActive } = mark;
  const [hover, setHover] = useState(false);
  const Icon = kind === 'chat' ? MessageCircle : StickyNote;

  // Visibility of these chips is controlled at the container level
  // (peer-hover/badge fades the whole stack in/out). Per-chip styles
  // here just deal with appearance ONCE visible:
  //   - bright (active/preview): saturated, pulsing — the chip the
  //     user is currently looking at.
  //   - faint (default): a readable kind-colored chip on dark slate.
  //     Direct hover on a single chip saturates it so the click
  //     target is unambiguous.
  const tone =
    kind === 'chat'
      ? brightness === 'bright'
        ? 'bg-indigo-500/80 text-white ring-1 ring-indigo-300'
        : 'bg-slate-900/90 text-indigo-300 ring-1 ring-indigo-400/60 hover:bg-indigo-500/40 hover:text-indigo-100 hover:ring-indigo-300'
      : brightness === 'bright'
        ? 'bg-amber-500/80 text-white ring-1 ring-amber-300'
        : 'bg-slate-900/90 text-amber-300 ring-1 ring-amber-400/60 hover:bg-amber-500/40 hover:text-amber-100 hover:ring-amber-300';

  const ariaLabel = title
    ? `${kind === 'note' ? 'Open note' : 'Open chat'}: ${title}`
    : kind === 'note' ? 'Open note' : 'Open chat';

  // Position relative is needed so the absolutely-positioned tooltip
  // anchors to this chip (not to a more distant relative ancestor).
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onActivate(mark);
      }}
      className={`relative flex items-center justify-center w-6 h-6 rounded transition-colors ${
        isActive ? 'cursor-default' : 'cursor-pointer'
      } ${pulse ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''} ${tone}`}
    >
      <Icon size={12} />
      {/* Tooltip lives to the LEFT for slide-wide chips — multiple
          chips stack vertically and an above-tooltip would overlap
          with the chip directly above it. */}
      {hover && title && (
        <AnchorTooltip kind={kind} side="left">
          {title}
        </AnchorTooltip>
      )}
    </button>
  );
}

/**
 * Custom tooltip for anchor marks. Replaces the native HTML `title`
 * attribute (a) because Chrome's native tooltip is unreliable and
 * (b) because the stock OS gray box reads as a 90s artifact next to
 * the rest of the dark-themed UI.
 *
 * Variants:
 *   - 'above' / 'below' — for spatial AnchorMark instances. Choice
 *     depends on the anchor's vertical position so a top-of-page
 *     anchor doesn't get its tooltip clipped.
 *   - 'left' — for slide-wide chips in the bottom-right cluster.
 *     Vertical stacking would otherwise put the tooltip in the gap
 *     between two chips, which feels cramped.
 *
 * The colored 1-px ring matches the kind (indigo for chats, amber
 * for notes) so the tooltip reads as part of the anchor it labels.
 */
function AnchorTooltip({
  kind,
  side,
  children,
}: {
  kind: Kind;
  side: 'above' | 'below' | 'left';
  children: React.ReactNode;
}) {
  const positionClass =
    side === 'above'
      ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2'
      : side === 'below'
        ? 'top-full left-1/2 mt-1.5 -translate-x-1/2'
        : 'right-full top-1/2 mr-1.5 -translate-y-1/2';
  const ringClass =
    kind === 'chat' ? 'ring-indigo-500/60' : 'ring-amber-500/60';
  return (
    <span
      role="tooltip"
      className={`absolute z-50 max-w-[20rem] truncate pointer-events-none px-2 py-1 text-xs font-medium text-slate-100 bg-slate-800 ring-1 ${ringClass} rounded shadow-lg ${positionClass}`}
    >
      {children}
    </span>
  );
}

/**
 * The four-by-two style table. Hover variants (faint only) brighten
 * toward the bright variant so users can tell an anchor is clickable
 * before they commit.
 *
 *                    bright (active/preview)              faint (show-all)
 *   ─────────────────────────────────────────────────────────────────────────
 *   chat region   →  ring-1 ring-indigo-400, fill /20     ring-1 ring-indigo-400/50, fill /10  (hover: bumps to bright)
 *   chat text     →  ring-1 ring-indigo-300/70, fill /50  ring-1 ring-indigo-300/25, fill /20
 *   note region   →  ring-1 ring-amber-400, fill /20      ring-1 ring-amber-400/50, fill /10
 *   note text     →  ring-1 ring-amber-300/70, fill /50   ring-1 ring-amber-300/25, fill /20
 *
 * Region = ring-dominant, text = fill-dominant. Within each kind the
 * shade differs (-400 for region, -300 for text) so they read as
 * visually distinct even at a glance.
 */
function styleFor(kind: Kind, isText: boolean, brightness: Brightness): string {
  if (kind === 'chat') {
    if (isText) {
      return brightness === 'bright'
        ? 'bg-indigo-300/50 ring-1 ring-indigo-300/70'
        : 'bg-indigo-300/20 ring-1 ring-indigo-300/25 hover:bg-indigo-300/45 hover:ring-indigo-300/60';
    }
    return brightness === 'bright'
      ? 'bg-indigo-400/20 ring-1 ring-indigo-400'
      : 'bg-indigo-400/10 ring-1 ring-indigo-400/50 hover:bg-indigo-400/20 hover:ring-indigo-400';
  }
  // note
  if (isText) {
    return brightness === 'bright'
      ? 'bg-amber-300/50 ring-1 ring-amber-300/70'
      : 'bg-amber-300/20 ring-1 ring-amber-300/25 hover:bg-amber-300/45 hover:ring-amber-300/60';
  }
  return brightness === 'bright'
    ? 'bg-amber-400/20 ring-1 ring-amber-400'
    : 'bg-amber-400/10 ring-1 ring-amber-400/50 hover:bg-amber-400/20 hover:ring-amber-400';
}
