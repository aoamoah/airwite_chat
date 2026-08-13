'use client';

import * as React from 'react';

type Point = { x: number; y: number };

/** Keeps a panel from being dropped past the edge and lost. */
const MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function read(key: string): Point | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return typeof parsed?.x === 'number' && typeof parsed?.y === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export type Draggable = {
  ref: React.RefObject<HTMLDivElement>;
  /** Spread onto the panel. Replaces its CSS anchoring once it has been moved. */
  style: React.CSSProperties | undefined;
  /** Spread onto the grip. Dragging is deliberately not the whole panel. */
  handleProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
    onPointerCancel: (event: React.PointerEvent) => void;
  };
  /** True once moved, so callers can offer a way back. */
  moved: boolean;
  reset: () => void;
};

/**
 * Lets a floating panel be dragged somewhere else and stay there.
 *
 * These panels sit over live video, and where they sit is a matter of what is
 * underneath them — a face, a shared slide — which only the person in the
 * meeting can see. Position is remembered per panel across meetings.
 *
 * Only the grip starts a drag. Making the whole panel draggable would mean
 * every button press begins as a potential drag, which on a touchscreen turns
 * ordinary taps into misfires.
 */
export function useDraggable(storageKey: string): Draggable {
  const ref = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<Point | null>(null);
  const grab = React.useRef<{ dx: number; dy: number } | null>(null);

  // Read after mount: localStorage does not exist during the server render.
  React.useEffect(() => {
    setPosition(read(storageKey));
  }, [storageKey]);

  const positionRef = React.useRef(position);
  positionRef.current = position;

  const place = React.useCallback((next: Point) => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      x: clamp(next.x, MARGIN, window.innerWidth - width - MARGIN),
      y: clamp(next.y, MARGIN, window.innerHeight - height - MARGIN),
    });
  }, []);

  // A panel parked near the edge of a large window would otherwise sit off
  // screen when the window shrinks or a phone is rotated.
  React.useEffect(() => {
    if (!position) return;
    const onResize = () => {
      const current = positionRef.current;
      if (current) place(current);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [position, place]);

  const onPointerDown = React.useCallback((event: React.PointerEvent) => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    grab.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Stops a touch drag from scrolling the page underneath instead.
    event.preventDefault();
  }, []);

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent) => {
      const held = grab.current;
      if (!held) return;
      place({ x: event.clientX - held.dx, y: event.clientY - held.dy });
    },
    [place],
  );

  const finish = React.useCallback(
    (event: React.PointerEvent) => {
      if (!grab.current) return;
      grab.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const current = positionRef.current;
      if (!current) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(current));
      } catch {
        // Not remembering where it was put is not worth failing a drag over.
      }
    },
    [storageKey],
  );

  const reset = React.useCallback(() => {
    setPosition(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing to undo if storage is unavailable.
    }
  }, [storageKey]);

  return {
    ref,
    style: position
      ? // Overrides the stylesheet's own anchoring, whatever corner it used.
        { left: position.x, top: position.y, right: 'auto', bottom: 'auto', transform: 'none' }
      : undefined,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
    moved: position !== null,
    reset,
  };
}
