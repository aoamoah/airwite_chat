'use client';

import * as React from 'react';
import {
  LocalVideoTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
  type RemoteTrack,
} from 'livekit-client';
import type { DataMode } from './types';

/** What the camera captures in each mode. Capture low and nothing has to re-encode it. */
const CAPTURE = {
  full: VideoPresets.h720.resolution,
  low: VideoPresets.h180.resolution,
};

/**
 * Makes a data mode real, on both sides of the connection.
 *
 * Receiving is usually the larger bill — one participant sends a stream, but
 * receives one from everyone else — so the subscription side is handled first
 * and unconditionally, including for participants who arrive later.
 */
export function useApplyDataMode(room: Room, mode: DataMode): void {
  React.useEffect(() => {
    const applyToPublication = (publication: RemoteTrackPublication) => {
      if (publication.kind !== Track.Kind.Video) return;

      if (mode === 'audio-only') {
        publication.setSubscribed(false);
        return;
      }
      publication.setSubscribed(true);
      publication.setVideoQuality(mode === 'low' ? VideoQuality.LOW : VideoQuality.HIGH);
    };

    const applyToEveryone = () => {
      room.remoteParticipants.forEach((participant) =>
        participant.videoTrackPublications.forEach(applyToPublication),
      );
    };

    applyToEveryone();

    const onPublished = (publication: RemoteTrackPublication) => applyToPublication(publication);
    const onSubscribed = (_track: RemoteTrack, publication: RemoteTrackPublication) =>
      applyToPublication(publication);

    room.on(RoomEvent.TrackPublished, onPublished);
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.ParticipantConnected, applyToEveryone);

    return () => {
      room.off(RoomEvent.TrackPublished, onPublished);
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.ParticipantConnected, applyToEveryone);
    };
  }, [room, mode]);

  // Whether the camera was on before audio-only switched it off, so that
  // leaving audio-only restores what the participant had rather than turning on
  // a camera they had deliberately turned off.
  const cameraBeforeAudioOnly = React.useRef<boolean | null>(null);
  const previousMode = React.useRef<DataMode | null>(null);

  React.useEffect(() => {
    const previous = previousMode.current;
    previousMode.current = mode;

    // Nothing to undo and nothing to change on a normal first render.
    if (previous === null && mode === 'full') return;
    if (previous === mode) return;

    let cancelled = false;

    void (async () => {
      const local = room.localParticipant;

      try {
        if (mode === 'audio-only') {
          cameraBeforeAudioOnly.current ??= local.isCameraEnabled;
          await local.setCameraEnabled(false);
          return;
        }

        if (previous === 'audio-only') {
          const restore = cameraBeforeAudioOnly.current ?? false;
          cameraBeforeAudioOnly.current = null;
          if (restore) await local.setCameraEnabled(true);
        }

        if (cancelled) return;

        const track = local.getTrackPublication(Track.Source.Camera)?.track;
        if (track instanceof LocalVideoTrack) {
          // Restarting is visible as a brief flicker, which is why this only
          // runs on an actual mode change rather than on every render.
          await track.restartTrack({ resolution: CAPTURE[mode] });
        }
      } catch (cause) {
        // A camera that refuses to restart is not a reason to end the meeting.
        console.error('[network] could not apply data mode to the camera', cause);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room, mode]);
}
