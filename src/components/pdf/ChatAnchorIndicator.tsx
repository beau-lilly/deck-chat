import { useChatStore } from '../../stores/chatStore';

interface Props {
  pageNumber: number;
}

/**
 * Renders a visual indicator over the region/text of the active chat's
 * anchor on this page. Appears only while a chat is open (activeChatId
 * is set) and only on the page that the anchor lives on. Styled
 * differently for region vs text selections so the user gets a hint
 * about which kind of anchor they're looking at.
 *
 * Coordinates are normalized 0–100% — matches the SelectionOverlay
 * pattern so the indicator tracks the page at every zoom level.
 */
export default function ChatAnchorIndicator({ pageNumber }: Props) {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chat = useChatStore((s) =>
    s.activeChatId ? s.chats.find((c) => c.id === s.activeChatId) : null,
  );

  if (!activeChatId || !chat) return null;
  const anchor = chat.anchor;
  if (anchor.pageNumber !== pageNumber) return null;

  // We use `description` as the discriminator for text vs region anchors
  // — the text-selection flow stuffs the selected text there, the region-
  // selection flow leaves it undefined.
  const isText = typeof anchor.description === 'string' && anchor.description.length > 0;

  // Common position/size via percentages. For text anchors that happen
  // to have zero width/height (e.g. a collapsed range) we fall back to a
  // small visible dot so the indicator is still findable.
  const width = Math.max(anchor.width ?? 0, 0.5);
  const height = Math.max(anchor.height ?? 0, 0.5);

  return (
    <div
      aria-label="Chat anchor"
      className={`absolute pointer-events-none rounded-sm animate-[pulse_2s_ease-in-out_infinite] ${
        isText
          ? // Text anchors get a soft "highlighter" look — a yellow fill
            // with a matching glow. Mimics how a real highlighter marks
            // the selected text without obscuring it.
            'bg-amber-300/30 ring-2 ring-amber-300/70 shadow-[0_0_12px_rgba(253,224,71,0.55)]'
          : // Region anchors get a more assertive indigo outline — the
            // same palette as the active-drag rectangle so the user reads
            // "this is a saved selection" at a glance.
            'bg-indigo-400/15 ring-2 ring-indigo-400 shadow-[0_0_14px_rgba(129,140,248,0.45)]'
      }`}
      style={{
        left: `${anchor.x}%`,
        top: `${anchor.y}%`,
        width: `${width}%`,
        height: `${height}%`,
      }}
    />
  );
}
