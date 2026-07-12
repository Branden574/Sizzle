import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Swipe-down-to-dismiss for a bottom sheet. Attach `handlers` to the sheet's drag
 * area (its header / handle bar — NOT the scrollable body) and spread `sheetStyle`
 * onto the sheet panel. Dragging down moves the panel; releasing past `threshold`
 * (or with a fast downward flick) closes it, otherwise it springs back.
 */
export function useSwipeDismiss(onClose: () => void, threshold = 110) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startT = useRef(0);
  const curY = useRef(0);
  const active = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    // Let taps on interactive elements (the ✕, tabs, inputs) behave normally.
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) return;
    startY.current = e.clientY;
    startT.current = e.timeStamp;
    curY.current = 0;
    active.current = true;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!active.current) return;
    const dy = Math.max(0, e.clientY - startY.current); // downward only
    curY.current = dy;
    setDragY(dy);
  };
  const end = (e: ReactPointerEvent) => {
    if (!active.current) return;
    active.current = false;
    setDragging(false);
    const dt = Math.max(1, e.timeStamp - startT.current);
    const velocity = curY.current / dt; // px per ms
    if (curY.current > threshold || velocity > 0.5) onClose();
    setDragY(0);
  };

  const sheetStyle: CSSProperties = {
    transform: dragY ? `translateY(${dragY}px)` : undefined,
    transition: dragging ? 'none' : 'transform .28s cubic-bezier(.16,1,.3,1)',
  };
  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, style: { touchAction: 'none' as const, cursor: 'grab' } },
    sheetStyle,
    dragging,
  };
}
