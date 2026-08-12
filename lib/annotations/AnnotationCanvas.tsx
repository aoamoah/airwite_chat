'use client';

import * as React from 'react';
import styles from '../../styles/Annotations.module.css';
import { paint } from './draw';
import { eraserCursor, pencilCursor } from './cursor';
import { strokesUnderPoint } from './hitTest';
import { ERASER_RADIUS, type AnnotationTool } from './types';
import type { AnnotationStore } from './store';
import type { ContentRect } from './useScreenShareRect';

type Props = {
  store: AnnotationStore;
  rect: ContentRect;
  tool: AnnotationTool;
  /** Only used to tint the pencil cursor; stroke styling is applied by the caller. */
  color: string;
  onBegin: (x: number, y: number) => void;
  onExtend: (x: number, y: number) => void;
  onEnd: () => void;
  onErase: (ids: string[]) => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function AnnotationCanvas({
  store,
  rect,
  tool,
  color,
  onBegin,
  onExtend,
  onEnd,
  onErase,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const activePointer = React.useRef<number | null>(null);

  // Repaint on any store change, coalesced to one frame so a burst of remote
  // point batches costs a single paint.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    const repaint = () => {
      frame = 0;
      paint(canvas, store.list(), rect);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(repaint);
    };

    schedule();
    const unsubscribe = store.subscribe(schedule);
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [store, rect]);

  const toNormalized = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - box.left) / box.width),
      y: clamp01((event.clientY - box.top) / box.height),
    };
  };

  const eraseAt = React.useCallback(
    (point: { x: number; y: number }) => {
      const hits = strokesUnderPoint(store.list(), point, ERASER_RADIUS, rect);
      if (hits.length > 0) onErase(hits);
    },
    [store, rect, onErase],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'none' || activePointer.current !== null) return;
    // Stops touch drags from scrolling and mouse drags from selecting text.
    event.preventDefault();
    activePointer.current = event.pointerId;
    // Capture keeps events flowing even if the pointer leaves the canvas, so a
    // stroke ends on release rather than at the edge of the shared picture.
    event.currentTarget.setPointerCapture(event.pointerId);

    const point = toNormalized(event);
    if (tool === 'eraser') eraseAt(point);
    else onBegin(point.x, point.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== event.pointerId) return;
    const point = toNormalized(event);
    if (tool === 'eraser') eraseAt(point);
    else onExtend(point.x, point.y);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // The eraser has no open state to close.
    if (tool !== 'eraser') onEnd();
  };

  // Switching tool or putting the pen down mid-stroke would otherwise strand the
  // stroke open forever.
  React.useEffect(() => {
    if (tool !== 'pen' && activePointer.current !== null) {
      activePointer.current = null;
      onEnd();
    }
  }, [tool, onEnd]);

  const cursor = React.useMemo(() => {
    if (tool === 'pen') return pencilCursor(color);
    if (tool === 'eraser') return eraserCursor(ERASER_RADIUS * Math.min(rect.width, rect.height));
    return undefined;
  }, [tool, color, rect.width, rect.height]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        // Pass clicks through to the video and its controls when idle.
        pointerEvents: tool === 'none' ? 'none' : 'auto',
        cursor,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    />
  );
}
