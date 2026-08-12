'use client';

import * as React from 'react';
import { useRoomContext, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { AnnotationCanvas } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { colorForIdentity } from './colors';
import { STROKE_WIDTHS, type AnnotationTool, type StrokeWidthName } from './types';
import { useAnnotations } from './useAnnotations';
import { useAnnotationShortcuts } from './useAnnotationShortcuts';
import { useScreenShareRect } from './useScreenShareRect';

/**
 * Drop-in annotation layer for a room. Renders nothing until someone shares a
 * screen, since the board is anchored to the shared picture.
 *
 * Mount it inside a RoomContext, as a sibling of <VideoConference>.
 */
export function AnnotationLayer() {
  const room = useRoomContext();
  const rect = useScreenShareRect();
  const annotations = useAnnotations(room);

  const [tool, setTool] = React.useState<AnnotationTool>('none');
  const [color, setColor] = React.useState(() => colorForIdentity(room.localParticipant.identity));
  const [widthName, setWidthName] = React.useState<StrokeWidthName>('medium');

  const screenShares = useTracks([Track.Source.ScreenShare]);
  const shareSid = screenShares[0]?.publication?.trackSid;

  // A board belongs to the share it was drawn on, so a new share starts clean.
  // Every client runs this off the same track change, so no message is needed.
  const previousSid = React.useRef(shareSid);
  React.useEffect(() => {
    if (previousSid.current !== undefined && previousSid.current !== shareSid) {
      annotations.store.clear();
    }
    previousSid.current = shareSid;
  }, [shareSid, annotations.store]);

  const sharing = rect !== null;
  React.useEffect(() => {
    if (!sharing) setTool('none');
  }, [sharing]);

  useAnnotationShortcuts({ enabled: sharing, tool, setTool, onUndo: annotations.undoLast });

  const { beginStroke, extendStroke, endStroke } = annotations;
  const handleBegin = React.useCallback(
    (x: number, y: number) => beginStroke(x, y, color, STROKE_WIDTHS[widthName]),
    [beginStroke, color, widthName],
  );

  if (!rect) return null;

  return (
    <>
      <AnnotationCanvas
        store={annotations.store}
        rect={rect}
        tool={tool}
        color={color}
        onBegin={handleBegin}
        onExtend={extendStroke}
        onEnd={endStroke}
        onErase={annotations.eraseStrokes}
      />
      <AnnotationToolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        widthName={widthName}
        onWidthChange={setWidthName}
        onUndo={annotations.undoLast}
        onClear={annotations.clearAll}
      />
    </>
  );
}
