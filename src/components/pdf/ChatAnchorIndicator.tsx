import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import { usePreviewStore } from '../../stores/previewStore';
import type { ChatAnchor } from '../../types';

interface Props {
  pageNumber: number;
}

/**
 * Renders a visual indicator over the region/text of the active chat,
 * active note, or previewed item's anchor on this page. Priority order:
 *
 *     activeNote > activeChat > previewed
 *
 * Styling differentiates by source + selection kind:
 *   - chat, region    → indigo ring
 *   - chat, text      → amber highlighter
 *   - note, region    → amber ring (notes live in the amber palette
 *                       across the sidebar + note panel; keep it
 *                       consistent on the page)
 *   - note, text      → amber highlighter, slightly darker ring to
 *                       distinguish from a chat's text anchor
 *   - preview         → same palette as the underlying kind, but with
 *                       a thinner ring + softer glow so the user can
 *                       tell "selected but not yet opened" at a glance.
 *
 * Coordinates are normalized 0–100% — matches SelectionOverlay so the
 * indicator tracks the page at every zoom level.
 */
export default function ChatAnchorIndicator({ pageNumber }: Props) {
  // Resolve whichever source is active. Note takes precedence because
  // clicking a note closes any active chat (see AppLayout + NoteNode).
  const activeChat = useChatStore((s) =>
    s.activeChatId ? s.chats.find((c) => c.id === s.activeChatId) ?? null : null,
  );
  const activeNote = useNoteStore((s) => s.activeNote);
  const previewed = usePreviewStore((s) => s.previewed);

  type Source = 'chat' | 'note';
  let anchor: ChatAnchor | null = null;
  let source: Source | null = null;
  // `preview` means the user has selected but not opened the item —
  // we dial back the ring/glow intensity so it reads as "highlighted
  // but not yet the focused thing".
  let isPreview = false;
  if (activeNote) {
    anchor = activeNote.anchor;
    source = 'note';
  } else if (activeChat) {
    anchor = activeChat.anchor;
    source = 'chat';
  } else if (previewed) {
    anchor = previewed.anchor;
    source = previewed.kind;
    isPreview = true;
  }
  if (!anchor || !source) return null;
  if (anchor.pageNumber !== pageNumber) return null;

  // `description` is populated by the text-selection flow and left
  // undefined for region-selections, so it's our text-vs-region
  // discriminator.
  const isText =
    typeof anchor.description === 'string' && anchor.description.length > 0;

  // For text anchors that end up with near-zero dimensions (collapsed
  // ranges), fall back to a small visible dot so the indicator stays
  // findable.
  const width = Math.max(anchor.width ?? 0, 0.5);
  const height = Math.max(anchor.height ?? 0, 0.5);

  // Preview variants: thinner ring (1 vs 2 px), lower-opacity fill,
  // no glow shadow. Keeps the indicator visible enough to locate the
  // anchor but unmistakably less "loud" than an opened one.
  const style = isPreview
    ? source === 'note'
      ? isText
        ? 'bg-amber-400/20 ring-1 ring-amber-400/60'
        : 'bg-amber-400/10 ring-1 ring-amber-400/60'
      : isText
        ? 'bg-amber-300/20 ring-1 ring-amber-300/50'
        : 'bg-indigo-400/10 ring-1 ring-indigo-400/70'
    : source === 'note'
      ? isText
        ? 'bg-amber-400/30 ring-2 ring-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.55)]'
        : 'bg-amber-400/15 ring-2 ring-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
      : isText
        ? 'bg-amber-300/30 ring-2 ring-amber-300/70 shadow-[0_0_12px_rgba(253,224,71,0.55)]'
        : 'bg-indigo-400/15 ring-2 ring-indigo-400 shadow-[0_0_14px_rgba(129,140,248,0.45)]';

  return (
    <div
      aria-label={
        isPreview
          ? `${source === 'note' ? 'Note' : 'Chat'} anchor (previewed)`
          : source === 'note'
            ? 'Note anchor'
            : 'Chat anchor'
      }
      className={`absolute pointer-events-none rounded-sm animate-[pulse_2s_ease-in-out_infinite] ${style}`}
      style={{
        left: `${anchor.x}%`,
        top: `${anchor.y}%`,
        width: `${width}%`,
        height: `${height}%`,
      }}
    />
  );
}
