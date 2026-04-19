import { useEffect, useRef } from 'react';

interface Props {
  initialValue: string;
  onCommit: (newValue: string) => void;
  onCancel: () => void;
  // When true, select only the basename (everything before the last dot) on
  // focus — matches Finder's behavior for files like "deck.pdf".
  selectBasename?: boolean;
  className?: string;
}

export default function InlineEditor({
  initialValue,
  onCommit,
  onCancel,
  selectBasename = false,
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Ensure we only fire commit/cancel once even if multiple events (blur +
  // Enter keydown) race during React's re-render.
  const settledRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (selectBasename) {
      const dot = initialValue.lastIndexOf('.');
      if (dot > 0) {
        input.setSelectionRange(0, dot);
      } else {
        input.select();
      }
    } else {
      input.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const trimmed = (inputRef.current?.value ?? '').trim();
    if (!trimmed || trimmed === initialValue) {
      onCancel();
      return;
    }
    onCommit(trimmed);
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={initialValue}
      // Stop propagation so the row's click/contextmenu/selection handlers
      // don't hijack events meant for the editor.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={() => commit()}
      className={`bg-slate-900 border border-indigo-500 rounded px-1 py-0 text-xs text-slate-100 outline-none ${className}`}
    />
  );
}
