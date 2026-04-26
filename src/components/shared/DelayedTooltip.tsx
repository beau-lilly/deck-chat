import type { ReactNode } from 'react';

type Position = 'below' | 'above' | 'below-left' | 'below-right';

interface Props {
  children: ReactNode;
  /** Where the tooltip appears relative to its parent.
   *
   *   - 'below' (default): centered under the parent. Best for
   *     toolbar buttons that are roughly in the middle of the row.
   *   - 'above': centered above the parent. Use when the parent is
   *     near the bottom of the viewport.
   *   - 'below-left': aligned to the parent's left edge, text
   *     extends rightward. Use for buttons near the left edge.
   *   - 'below-right': aligned to the parent's right edge, text
   *     extends leftward. Use for buttons near the right edge AND
   *     for the page-number badge whose tooltip should overflow
   *     past the icon.
   */
  position?: Position;
}

const POSITION_CLASS: Record<Position, string> = {
  below: 'top-full left-1/2 -translate-x-1/2 mt-1',
  above: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
  'below-left': 'top-full left-0 mt-1',
  'below-right': 'top-full right-0 mt-1',
};

/**
 * Hover tooltip with a 500 ms show-delay (matching the OS-level
 * `title` attribute's natural pause) and instant hide. Styled to
 * match the rest of the dark-slate UI vocabulary so it doesn't read
 * as a leftover OS chrome element.
 *
 * Usage: the parent that triggers the tooltip must carry
 * `group/tooltip relative` on its className (the named group lets
 * sibling tooltips elsewhere on the page coexist without interfering;
 * `relative` anchors the absolutely-positioned tooltip to the
 * parent). The tooltip itself is rendered as the parent's child.
 *
 * Why custom and not native `title=`:
 *   - `title` is OS-styled and reads as ugly gray chrome on a dark
 *     theme. Inconsistent across browsers (Chrome's is inconsistent
 *     about whether it shows at all).
 *   - We can match the existing tooltip palette across the app
 *     (anchor tooltips, page-number tooltip).
 *
 * Why CSS-only and not React state:
 *   - State-based delay would force a re-render per hover, and the
 *     hold-then-show / instant-hide asymmetry is trivial in CSS.
 *
 * The asymmetric timing trick:
 *   - Default state: `transition-opacity duration-0` — when the
 *     tooltip is being hidden, this state's transition rules apply,
 *     so the change snaps instantly.
 *   - Hover-active state: `duration-150 delay-500` — when becoming
 *     visible, the new state's rules apply, so the tooltip waits
 *     500 ms (matching OS title delay) and then fades in over 150 ms.
 */
export default function DelayedTooltip({ children, position = 'below' }: Props) {
  return (
    <span
      role="tooltip"
      className={`absolute z-30 whitespace-nowrap px-2 py-0.5 text-[11px] text-slate-200 bg-slate-800 ring-1 ring-slate-600 rounded shadow-lg pointer-events-none opacity-0 transition-opacity duration-0 group-hover/tooltip:opacity-100 group-hover/tooltip:duration-150 group-hover/tooltip:delay-500 ${POSITION_CLASS[position]}`}
    >
      {children}
    </span>
  );
}
