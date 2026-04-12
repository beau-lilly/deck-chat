import { useState, useEffect, type RefObject } from 'react';

export default function useResizeObserver(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setWidth(el.clientWidth);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}
