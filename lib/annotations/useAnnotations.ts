'use client';

import * as React from 'react';
import { RoomEvent, type Participant, type Room } from 'livekit-client';
import { AnnotationStore } from './store';
import {
  ANNOTATION_TOPIC,
  BATCH_INTERVAL_MS,
  type AnnotationMessage,
  type Stroke,
} from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * LiveKit caps a single data packet at roughly 15 KiB and does not split
 * oversized payloads, so a board with any real amount of ink on it cannot be
 * sent to a joiner in one message. Kept conservatively below the limit to leave
 * room for the JSON envelope.
 */
const MAX_PAYLOAD_BYTES = 12_000;

/**
 * Splits a board into packets that fit the channel. Order does not matter and
 * chunks need no reassembly, because merge() is idempotent and keyed by stroke
 * id — a joiner simply accumulates whatever arrives.
 */
function chunkStrokes(strokes: Stroke[]): Stroke[][] {
  const chunks: Stroke[][] = [];
  let current: Stroke[] = [];
  let size = 0;
  for (const stroke of strokes) {
    const cost = JSON.stringify(stroke).length;
    if (current.length > 0 && size + cost > MAX_PAYLOAD_BYTES) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(stroke);
    size += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Minimum distance, in normalized units, between two recorded points.
 *
 * Pointer devices sample far more finely than a stroke needs. Dropping
 * sub-threshold movement roughly halves the data on screen and, more
 * importantly, stops a slow deliberate stroke from growing past the packet
 * limit and becoming unsendable to late joiners.
 */
const MIN_POINT_DISTANCE = 0.002;

/**
 * Decides whether this client answers a peer's request for the current board.
 *
 * Every participant holds the full state, so an unguarded request would be
 * answered by all of them at once. Ranking identities gives every client the
 * same answer with no election traffic; excluding the requester matters because
 * a joiner may well sort first and cannot answer its own question.
 */
function isSyncResponder(room: Room, requester: string): boolean {
  const candidates = [
    room.localParticipant.identity,
    ...Array.from(room.remoteParticipants.values(), (p) => p.identity),
  ]
    .filter((identity) => identity !== requester)
    .sort();
  return candidates[0] === room.localParticipant.identity;
}

export type AnnotationApi = {
  store: AnnotationStore;
  /** True between the local "writing" and "not writing" events. */
  isWriting: boolean;
  beginStroke: (surface: string, x: number, y: number, color: string, width: number) => void;
  extendStroke: (x: number, y: number) => void;
  endStroke: () => void;
  /** Removes whole strokes, whoever drew them. */
  eraseStrokes: (ids: string[]) => void;
  /** Removes this participant's most recent stroke, on any board. */
  undoLast: () => void;
  clearSurface: (surface: string) => void;
};

/**
 * Owns the annotation data channel: publishes local strokes, applies remote
 * ones, and reconciles state for participants who join mid-meeting.
 *
 * Uses the Room API directly rather than `useDataChannel` because that hook
 * stores each message in React state, which would re-render the subtree on
 * every batch of points from every drawer.
 */
export function useAnnotations(room: Room): AnnotationApi {
  const store = React.useMemo(() => new AnnotationStore(), []);
  const [isWriting, setIsWriting] = React.useState(false);

  const publish = React.useCallback(
    (message: AnnotationMessage, to?: string[]) => {
      room.localParticipant
        .publishData(encoder.encode(JSON.stringify(message)), {
          // Strokes persist until cleared, so a dropped packet would leave a
          // permanent gap in someone's board. Reliable, not lossy.
          reliable: true,
          topic: ANNOTATION_TOPIC,
          destinationIdentities: to,
        })
        .catch((error) => console.error('[annotations] failed to publish', error));
    },
    [room],
  );

  React.useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: Participant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== ANNOTATION_TOPIC || !participant) return;

      let message: AnnotationMessage;
      try {
        message = JSON.parse(decoder.decode(payload));
      } catch {
        return;
      }

      switch (message.t) {
        case 'begin':
          store.begin({
            id: message.id,
            // Attribution comes from the sender, never the payload, so undo
            // cannot be aimed at someone else's strokes.
            author: participant.identity,
            surface: message.s,
            color: message.color,
            width: message.width,
            points: [...message.p],
          });
          break;
        case 'points':
          store.append(message.id, message.p);
          break;
        case 'end':
          // Nothing to do: the stroke is already complete in the store. The
          // message exists so peers can react to writing starting and stopping.
          break;
        case 'undo': {
          const stroke = store.get(message.id);
          if (stroke?.author === participant.identity) store.remove(message.id);
          break;
        }
        case 'erase':
          // Unlike undo, the eraser is not restricted to its author's own
          // strokes: it is a shared tool over shared content, on the same
          // footing as Clear all.
          for (const id of message.ids) store.remove(id);
          break;
        case 'clear':
          store.clear(message.s);
          break;
        case 'sync-request':
          if (isSyncResponder(room, participant.identity)) {
            for (const chunk of chunkStrokes(store.list())) {
              publish({ t: 'sync-state', strokes: chunk }, [participant.identity]);
            }
          }
          break;
        case 'sync-state':
          store.merge(message.strokes);
          break;
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, store, publish]);

  // Ask for the existing board on arrival. Two attempts because the first can
  // land before peers have us in their participant list; merge() makes a
  // duplicate answer harmless.
  React.useEffect(() => {
    const request = () => publish({ t: 'sync-request' });
    const timers = [setTimeout(request, 400), setTimeout(request, 2500)];
    return () => timers.forEach(clearTimeout);
  }, [publish]);

  const activeId = React.useRef<string | null>(null);
  const lastPoint = React.useRef<{ x: number; y: number } | null>(null);
  const pending = React.useRef<number[]>([]);
  const flushTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const strokeCounter = React.useRef(0);

  const flush = React.useCallback(() => {
    if (!activeId.current || pending.current.length === 0) return;
    publish({ t: 'points', id: activeId.current, p: pending.current });
    pending.current = [];
  }, [publish]);

  const beginStroke = React.useCallback(
    (surface: string, x: number, y: number, color: string, width: number) => {
      const id = `${room.localParticipant.identity}:${Date.now()}:${strokeCounter.current++}`;
      const stroke: Stroke = {
        id,
        author: room.localParticipant.identity,
        surface,
        color,
        width,
        points: [x, y],
      };
      activeId.current = id;
      lastPoint.current = { x, y };
      pending.current = [];
      // Paint locally first so the line tracks the pointer without a round trip.
      store.begin(stroke);
      publish({ t: 'begin', id, s: surface, color, width, p: [x, y] });
      setIsWriting(true);

      if (flushTimer.current) clearInterval(flushTimer.current);
      flushTimer.current = setInterval(flush, BATCH_INTERVAL_MS);
    },
    [room, store, publish, flush],
  );

  const extendStroke = React.useCallback(
    (x: number, y: number) => {
      const id = activeId.current;
      if (!id) return;

      const previous = lastPoint.current;
      if (previous && Math.hypot(x - previous.x, y - previous.y) < MIN_POINT_DISTANCE) {
        return;
      }
      lastPoint.current = { x, y };

      store.append(id, [x, y]);
      pending.current.push(x, y);
    },
    [store],
  );

  const endStroke = React.useCallback(() => {
    const id = activeId.current;
    if (!id) return;
    flush();
    if (flushTimer.current) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    activeId.current = null;
    lastPoint.current = null;
    publish({ t: 'end', id });
    setIsWriting(false);
  }, [flush, publish]);

  React.useEffect(() => {
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, []);

  const eraseStrokes = React.useCallback(
    (ids: string[]) => {
      // Only announce strokes that were actually still on the board, so a drag
      // that keeps sweeping the same spot does not re-send them.
      const removed = ids.filter((id) => store.get(id) !== undefined);
      if (removed.length === 0) return;
      for (const id of removed) store.remove(id);
      publish({ t: 'erase', ids: removed });
    },
    [store, publish],
  );

  const undoLast = React.useCallback(() => {
    const stroke = store.lastStrokeBy(room.localParticipant.identity);
    if (!stroke) return;
    store.remove(stroke.id);
    publish({ t: 'undo', id: stroke.id });
  }, [room, store, publish]);

  const clearSurface = React.useCallback(
    (surface: string) => {
      store.clear(surface);
      publish({ t: 'clear', s: surface });
    },
    [store, publish],
  );

  return {
    store,
    isWriting,
    beginStroke,
    extendStroke,
    endStroke,
    eraseStrokes,
    undoLast,
    clearSurface,
  };
}
