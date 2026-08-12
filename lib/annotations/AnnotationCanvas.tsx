'use client';

import * as React from 'react';
import styles from '../../styles/Annotations.module.css';
import { paint } from './draw';
import { pencilCursor } from './cursor';
import type { AnnotationStore } from './store';
import type { ContentRect } from './useScreenShareRect';

type Props = {
  store: AnnotationStore;
  rect: ContentRect;
  /** Whether the pencil is armed. When false the canvas only displays. */
  active: boolean;
  /** Only used to tint the pencil cursor; stroke styling is applied by the caller. */
  color: string;
  onBegin: (x: number, y: number) => void;
  onExtend: (x: number, y: number) => void;
  onEnd: () => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function AnnotationCanvas({
  store,
  rect,
  active,
  color,
  onBegin,
  onExtend,
  onEnd,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawingPointer = React.useRef<number | null>(null);

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

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || drawingPointer.current !== null) return;
    // Stops touch drags from scrolling and mouse drags from selecting text.
    event.preventDefault();
    drawingPointer.current = event.pointerId;
    // Capture keeps points flowing even if the pointer leaves the canvas, so a
    // stroke ends on release rather than at the edge of the shared picture.
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = toNormalized(event);
    onBegin(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingPointer.current !== event.pointerId) return;
    const { x, y } = toNormalized(event);
    onExtend(x, y);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingPointer.current !== event.pointerId) return;
    drawingPointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onEnd();
  };

  // Releasing the pencil mid-stroke would otherwise strand it open forever.
  React.useEffect(() => {
    if (!active && drawingPointer.current !== null) {
      drawingPointer.current = null;
      onEnd();
    }
  }, [active, onEnd]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        // Pass clicks through to the video and its controls when not drawing.
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? pencilCursor(color) : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    />
  );
}
