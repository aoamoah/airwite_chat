'use client';

import * as React from 'react';
import { useRoomContext } from '@livekit/components-react';
import { AnnotationCanvas } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { colorForIdentity } from './colors';
import { STROKE_WIDTHS, type AnnotationTool, type StrokeWidthName } from './types';
import { useAnnotations } from './useAnnotations';
import { useAnnotationShortcuts } from './useAnnotationShortcuts';
import { useAnnotationSurfaces, type Surface } from './useAnnotationSurfaces';

/**
 * Drop-in annotation layer for a room. Puts a board over every video on screen —
 * the shared screen and each camera tile — each with independent strokes, all
 * driven by one toolbar.
 *
 * Mount it inside a RoomContext, as a sibling of <VideoConference>.
 */
export function AnnotationLayer() {
  const room = useRoomContext();
  const surfaces = useAnnotationSurfaces();
  const annotations = useAnnotations(room);

  const [tool, setTool] = React.useState<AnnotationTool>('none');
  const [color, setColor] = React.useState(() => colorForIdentity(room.localParticipant.identity));
  const [widthName, setWidthName] = React.useState<StrokeWidthName>('medium');
  // Which board destructive actions apply to: the last one pointed at.
  const [activeSurface, setActiveSurface] = React.useState<Surface | null>(null);

  // A board belongs to the feed it was drawn on, so a republished track — a
  // camera toggled off and on, or a new share — starts clean. Every client runs
  // this off the same track change, so no message is needed.
  const knownSids = React.useRef(new Map<string, string>());
  React.useEffect(() => {
    const seen = new Set<string>();
    for (const surface of surfaces) {
      seen.add(surface.id);
      const previous = knownSids.current.get(surface.id);
      if (previous !== undefined && previous !== surface.trackSid) {
        annotations.store.clear(surface.id);
      }
      knownSids.current.set(surface.id, surface.trackSid);
    }
    // Forget surfaces that left, so returning participants are treated as new.
    for (const id of knownSids.current.keys()) {
      if (!seen.has(id)) knownSids.current.delete(id);
    }
  }, [surfaces, annotations.store]);

  const canAnnotate = surfaces.length > 0;
  React.useEffect(() => {
    if (!canAnnotate) setTool('none');
  }, [canAnnotate]);

  // Keep the active board in step with the live geometry, and drop it when its
  // video goes away.
  React.useEffect(() => {
    setActiveSurface((current) => {
      if (!current) return current;
      return surfaces.find((surface) => surface.id === current.id) ?? null;
    });
  }, [surfaces]);

  useAnnotationShortcuts({ enabled: canAnnotate, tool, setTool, onUndo: annotations.undoLast });

  const { beginStroke, clearSurface } = annotations;
  const handleBegin = React.useCallback(
    (surface: Surface, x: number, y: number) =>
      beginStroke(surface.id, x, y, color, STROKE_WIDTHS[widthName]),
    [beginStroke, color, widthName],
  );
  const handleClear = React.useCallback(() => {
    if (activeSurface) clearSurface(activeSurface.id);
  }, [clearSurface, activeSurface]);

  if (!canAnnotate) return null;

  return (
    <>
      {surfaces.map((surface) => (
        <AnnotationCanvas
          key={surface.id}
          store={annotations.store}
          surface={surface}
          tool={tool}
          color={color}
          onBegin={handleBegin}
          onExtend={annotations.extendStroke}
          onEnd={annotations.endStroke}
          onErase={annotations.eraseStrokes}
          onActivate={setActiveSurface}
        />
      ))}
      <AnnotationToolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        widthName={widthName}
        onWidthChange={setWidthName}
        onUndo={annotations.undoLast}
        onClear={handleClear}
        clearTarget={activeSurface?.label ?? null}
      />
    </>
  );
}
