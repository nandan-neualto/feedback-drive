'use client';

import { Children, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Pack cards into the available space without changing their DOM or keyboard order. */
export default function WallGrid({ children }: { children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element || !('ResizeObserver' in window)) return;
    const cells = Array.from(element.children) as HTMLElement[];
    let frame = 0;
    let width = 0;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(element).columnGap) || 14;
      for (const cell of cells) {
        const card = cell.firstElementChild;
        if (card) cell.style.gridRowEnd = `span ${Math.ceil(card.getBoundingClientRect().height + gap)}`;
      }
      element.dataset.packed = 'true';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== element || entry.contentRect.width !== width) {
          if (entry.target === element) width = entry.contentRect.width;
          schedule();
        }
      }
    });
    measure();
    observer.observe(element);
    for (const cell of cells) if (cell.firstElementChild) observer.observe(cell.firstElementChild);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [children]);
  return <div ref={grid} className="feedback-grid wall-masonry">{Children.map(children, child => <div className="wall-grid-cell">{child}</div>)}</div>;
}
