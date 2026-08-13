'use client';

import * as React from 'react';
import { Participant, Room, RoomEvent } from 'livekit-client';
import { CaptionStore } from './store';
import { parseMessage, toMessage, type Caption, type CaptionLanguage } from './types';

const CAPTION_TOPIC = 'yehyia.captions';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type CaptionsApi = {
  /** Captions currently worth showing, oldest first. */
  visible: Caption[];
  /** Sends one finished utterance to everyone. */
  publish: (text: string, language: CaptionLanguage) => void;
};

/**
 * Carries captions between participants.
 *
 * Each speaker transcribes their own microphone and publishes the result, so
 * nothing here mixes or forwards audio — only short strings, one per utterance.
 */
export function useCaptions(room: Room): CaptionsApi {
  const store = React.useMemo(() => new CaptionStore(), []);
  const [visible, setVisible] = React.useState<Caption[]>([]);

  const refresh = React.useCallback(() => {
    setVisible(store.visible());
  }, [store]);

  const publish = React.useCallback(
    (text: string, language: CaptionLanguage) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const caption: Caption = {
        identity: room.localParticipant.identity,
        speaker: room.localParticipant.name || room.localParticipant.identity,
        text: trimmed,
        language,
        at: Date.now(),
      };

      // Shown locally straight away rather than waiting for the echo, so the
      // speaker sees what was heard without a second round trip.
      store.set(caption);
      refresh();

      room.localParticipant
        .publishData(encoder.encode(JSON.stringify(toMessage(caption))), {
          // A missed caption is better than a late one: it would arrive after
          // the sentence it describes has stopped being relevant.
          reliable: false,
          topic: CAPTION_TOPIC,
        })
        .catch((error) => console.error('[captions] failed to publish', error));
    },
    [room, store, refresh],
  );

  React.useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: Participant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== CAPTION_TOPIC || !participant) return;

      let parsed;
      try {
        parsed = parseMessage(JSON.parse(decoder.decode(payload)));
      } catch {
        return;
      }
      if (!parsed) return;

      store.set({
        // Taken from the transport, which already proves who sent it, rather
        // than from the payload, which anyone could fill in.
        identity: participant.identity,
        speaker: participant.name || parsed.n || participant.identity,
        text: parsed.x,
        language: parsed.l,
        at: Date.now(),
      });
      refresh();
    };

    const onLeft = (participant: Participant) => {
      store.clear(participant.identity);
      refresh();
    };

    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
    };
  }, [room, store, refresh]);

  // Captions expire on a timer rather than on the next message, or the last
  // thing said in a meeting would stay on screen indefinitely.
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (store.prune()) refresh();
    }, 1_000);
    return () => clearInterval(timer);
  }, [store, refresh]);

  return { visible, publish };
}
