import { useChatStore } from '../../stores/chatStore';
import { useNoteStore } from '../../stores/noteStore';
import type { ChatAnchor } from '../../types';

interface Props {
  pageNumber: number;
}

/**
 * Renders a visual indicator over the region/text of the active chat
 * OR active note's anchor on this page. Either opens the same anchor
 * type (ChatAnchor), so we resolve whichever one is active and render
 * a single pulse over it.
 *
 * Styling differentiates by source + selection kind:
 *   - chat, region    → indigo ring
 *   - chat, text      → amber highlighter
 *   - note, region    → amber ring (notes live in the amber palette
 *                       across the sidebar + note panel; keep it
 *                       consistent on the page)
 *   - note, text      → amber highlighter, slightly darker ring to
 *                       distinguish from a chat's text anchor
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

  type Source = 'chat' | 'note';
  let anchor: ChatAnchor | null = null;
  let source: Source | null = null;
  if (activeNote) {
    anchor = activeNote.anchor;
    source = 'note';
  } else if (activeChat) {
    anchor = activeChat.anchor;
    source = 'chat';
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

  const style =
    source === 'note'
      ? isText
        ? 'bg-amber-400/30 ring-2 ring-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.55)]'
        : 'bg-amber-400/15 ring-2 ring-amber-400/90 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
      : isText
        ? 'bg-amber-300/30 ring-2 ring-amber-300/70 shadow-[0_0_12px_rgba(253,224,71,0.55)]'
        : 'bg-indigo-400/15 ring-2 ring-indigo-400 shadow-[0_0_14px_rgba(129,140,248,0.45)]';

  return (
    <div
      aria-label={source === 'note' ? 'Note anchor' : 'Chat anchor'}
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
