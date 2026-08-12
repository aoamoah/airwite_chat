'use client';

import * as React from 'react';
import styles from '../../styles/Annotations.module.css';
import { paint } from './draw';
import { eraserCursor, pencilCursor } from './cursor';
import { strokesUnderPoint } from './hitTest';
import { ERASER_RADIUS, type AnnotationTool } from './types';
import type { AnnotationStore } from './store';
import type { Surface } from './useAnnotationSurfaces';

type Props = {
  store: AnnotationStore;
  surface: Surface;
  tool: AnnotationTool;
  /** Only used to tint the pencil cursor; stroke styling is applied by the caller. */
  color: string;
  onBegin: (surface: Surface, x: number, y: number) => void;
  onExtend: (x: number, y: number) => void;
  onEnd: () => void;
  onErase: (ids: string[]) => void;
  /** Reports which board the pointer is working on, for surface-scoped actions. */
  onActivate: (surface: Surface) => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function AnnotationCanvas({
  store,
  surface,
  tool,
  color,
  onBegin,
  onExtend,
  onEnd,
  onErase,
  onActivate,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const activePointer = React.useRef<number | null>(null);
  const { box, frame, mirrored } = surface;

  // Repaint on any store change, coalesced to one frame so a burst of remote
  // point batches costs a single paint.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scheduled = 0;
    const repaint = () => {
      scheduled = 0;
      paint(canvas, store.list(surface.id), frame, mirrored);
    };
    const schedule = () => {
      if (!scheduled) scheduled = requestAnimationFrame(repaint);
    };

    schedule();
    const unsubscribe = store.subscribe(schedule);
    return () => {
      unsubscribe();
      if (scheduled) cancelAnimationFrame(scheduled);
    };
  }, [store, surface.id, frame, mirrored]);

  /**
   * Pointer position as a fraction of the video frame, which is what strokes
   * are stored against. Under `cover` the frame overflows the tile, so the
   * pointer maps to the visible portion of a larger picture.
   */
  const toFrameCoords = (event: React.PointerEvent) => {
    const x = clamp01((event.clientX - frame.left) / frame.width);
    const y = clamp01((event.clientY - frame.top) / frame.height);
    // Undo the preview mirror so the mark lands where every other viewer,
    // who sees this feed unflipped, expects it.
    return { x: mirrored ? 1 - x : x, y };
  };

  const eraseAt = React.useCallback(
    (point: { x: number; y: number }) => {
      const hits = strokesUnderPoint(store.list(surface.id), point, ERASER_RADIUS, frame);
      if (hits.length > 0) onErase(hits);
    },
    [store, surface.id, frame, onErase],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'none' || activePointer.current !== null) return;
    // Stops touch drags from scrolling and mouse drags from selecting text.
    event.preventDefault();
    activePointer.current = event.pointerId;
    // Capture keeps events flowing even if the pointer leaves the tile, so a
    // stroke ends on release rather than at the tile edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    onActivate(surface);

    const point = toFrameCoords(event);
    if (tool === 'eraser') eraseAt(point);
    else onBegin(surface, point.x, point.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    const point = toFrameCoords(event);
    if (tool === 'eraser') eraseAt(point);
    else onExtend(point.x, point.y);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // The eraser has no open state to close.
    if (tool !== 'eraser') onEnd();
  };

  // Switching tool or putting the pen down mid-stroke would otherwise strand
  // the stroke open forever.
  React.useEffect(() => {
    if (tool !== 'pen' && activePointer.current !== null) {
      activePointer.current = null;
      onEnd();
    }
  }, [tool, onEnd]);

  const cursor = React.useMemo(() => {
    if (tool === 'pen') return pencilCursor(color);
    if (tool === 'eraser') return eraserCursor(ERASER_RADIUS * Math.min(frame.width, frame.height));
    return undefined;
  }, [tool, color, frame.width, frame.height]);

  return (
    <div
      className={styles.surface}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        // Pass clicks through to the video and its controls when idle.
        pointerEvents: tool === 'none' ? 'none' : 'auto',
        cursor,
      }}
      onPointerEnter={() => tool !== 'none' && onActivate(surface)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/*
        Sized to the whole video frame and positioned relative to the tile, so
        the parent's overflow clip crops exactly what the video's own object-fit
        crops. Under `contain` the frame is smaller and nothing is clipped.
      */}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{
          left: frame.left - box.left,
          top: frame.top - box.top,
          width: frame.width,
          height: frame.height,
        }}
      />
    </div>
  );
}
