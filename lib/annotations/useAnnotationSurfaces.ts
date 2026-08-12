'use client';

import * as React from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { isMirrored, measureVideo, sameRect, type Rect } from './geometry';

export type Surface = {
  /**
   * Stable board identity. Keyed by participant rather than by track so a
   * board survives a camera being toggled off and back on; `trackSid` carries
   * the change detection instead.
   */
  id: string;
  kind: 'screen' | 'camera';
  /** Human-readable target, for labelling destructive actions. */
  label: string;
  trackSid: string;
  box: Rect;
  frame: Rect;
  mirrored: boolean;
};

const VIDEO_SELECTOR = 'video.lk-participant-media-video';

function surfaceKey(surface: Surface): string {
  const { box, frame } = surface;
  return [
    surface.id,
    surface.trackSid,
    surface.mirrored,
    box.left,
    box.top,
    box.width,
    box.height,
    frame.left,
    frame.top,
    frame.width,
    frame.height,
  ].join(',');
}

function sameSurfaces(a: Surface[], b: Surface[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((surface, index) => surfaceKey(surface) === surfaceKey(b[index]));
}

/**
 * Every video currently on screen that can be drawn on, with the geometry
 * needed to place a canvas over it.
 *
 * Elements are matched to their owner through the MediaStreamTrack id behind
 * `srcObject`, not through DOM attributes: the only identifying attribute
 * LiveKit renders is `data-lk-participant-name`, and display names are not
 * unique. Track ids are.
 */
export function useAnnotationSurfaces(): Surface[] {
  const trackRefs = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const [surfaces, setSurfaces] = React.useState<Surface[]>([]);

  const owners = React.useMemo(() => {
    const map = new Map<string, Omit<Surface, 'box' | 'frame' | 'mirrored'>>();
    for (const ref of trackRefs) {
      const mediaTrack = ref.publication?.track?.mediaStreamTrack;
      if (!mediaTrack || !ref.publication) continue;
      const isScreen = ref.source === Track.Source.ScreenShare;
      const who = ref.participant.name || ref.participant.identity;
      map.set(mediaTrack.id, {
        id: isScreen ? `screen:${ref.participant.identity}` : `camera:${ref.participant.identity}`,
        kind: isScreen ? 'screen' : 'camera',
        label: isScreen ? 'the shared screen' : who,
        trackSid: ref.publication.trackSid,
      });
    }
    return map;
  }, [trackRefs]);

  const ownersRef = React.useRef(owners);
  ownersRef.current = owners;

  React.useEffect(() => {
    let frame = 0;
    const observed = new Set<HTMLVideoElement>();
    const elementObserver = new ResizeObserver(() => schedule());

    const measure = () => {
      frame = 0;
      const next: Surface[] = [];
      const seen = new Set<HTMLVideoElement>();

      for (const video of document.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR)) {
        seen.add(video);
        if (!observed.has(video)) {
          elementObserver.observe(video);
          video.addEventListener('resize', schedule);
          video.addEventListener('loadedmetadata', schedule);
          observed.add(video);
        }

        const stream = video.srcObject;
        if (!(stream instanceof MediaStream)) continue;
        const [mediaTrack] = stream.getVideoTracks();
        const owner = mediaTrack && ownersRef.current.get(mediaTrack.id);
        if (!owner) continue;

        const geometry = measureVideo(video);
        if (!geometry) continue;

        next.push({ ...owner, ...geometry, mirrored: isMirrored(video) });
      }

      for (const video of observed) {
        if (seen.has(video)) continue;
        elementObserver.unobserve(video);
        video.removeEventListener('resize', schedule);
        video.removeEventListener('loadedmetadata', schedule);
        observed.delete(video);
      }

      setSurfaces((previous) => (sameSurfaces(previous, next) ? previous : next));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    schedule();

    // Catches tiles mounting, unmounting, or moving between grid and focus.
    const treeObserver = new MutationObserver(schedule);
    treeObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      elementObserver.disconnect();
      treeObserver.disconnect();
      for (const video of observed) {
        video.removeEventListener('resize', schedule);
        video.removeEventListener('loadedmetadata', schedule);
      }
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
    };
  }, [owners]);

  return surfaces;
}
