import { useLayoutEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Fired on Enter (without Shift). Consumers wire this to their
   *  existing submit handler so a single-line input feels unchanged
   *  while Shift+Enter still inserts a newline in the textarea. */
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Starting row count when the value is empty. Default 1 so the box
   *  reads like a single-line input at rest. */
  minRows?: number;
  /** Upper bound on growth (in px). Once hit, the textarea scrolls
   *  internally rather than continuing to grow. Default is generous
   *  (~10 lines at text-sm / leading-relaxed); callers can override. */
  maxHeightPx?: number;
  /** Forwarded to the underlying textarea so callers (e.g. the
   *  selection popup) can focus imperatively. React 19 accepts refs
   *  as plain props so we just pass it through. */
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

/**
 * Auto-resizing textarea — behaves like a single-line input at rest,
 * grows to fit content as the user types, and scrolls inside itself
 * after reaching `maxHeightPx`.
 *
 * Implementation: measure `scrollHeight` in a layout effect after every
 * value change and set `height` to match. The "set height:auto first,
 * then read scrollHeight" dance is the canonical shrink-as-well-as-grow
 * pattern — `scrollHeight` is always ≥ current height, so without the
 * reset the box would only ever grow, never shrink after deletions.
 */
export default function AutoGrowTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  className = '',
  minRows = 1,
  maxHeightPx = 240,
  textareaRef,
}: Props) {
  const innerRef = useRef<HTMLTextAreaElement>(null);

  // Consumers that want their own ref (e.g. SelectionPopup's
  // imperative focus) can pass `textareaRef`. Merge it onto our
  // internal ref via a callback so both the auto-grow logic and the
  // external handle stay in sync.
  const assignRef = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (!textareaRef) return;
    if (typeof textareaRef === 'function') textareaRef(el);
    else (textareaRef as React.RefObject<HTMLTextAreaElement | null>).current = el;
  };

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    // Reset first so scrollHeight reflects the CURRENT content rather
    // than the previous (taller) layout. Without this, shrinking the
    // text never shortens the box.
    el.style.height = 'auto';
    // Clamp to maxHeightPx; overflow-y auto lets the user scroll inside
    // past that point so the UI doesn't eat the whole panel.
    const next = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${next}px`;
  }, [value, maxHeightPx]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits; Shift+Enter falls through to the textarea default
    // (insert newline). Matches the convention used by Slack, Discord,
    // Notion's comments, etc.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <textarea
      ref={assignRef}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      // resize:none disables the native drag-to-resize handle — the box
      // grows automatically and a user handle would fight that.
      // overflow-y auto kicks in at maxHeightPx so the box scrolls
      // inside itself once it hits the cap.
      style={{ resize: 'none', overflowY: 'auto', maxHeight: `${maxHeightPx}px` }}
      className={className}
    />
  );
}
