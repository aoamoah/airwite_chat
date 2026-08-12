'use client';

import * as React from 'react';

/** Viewport-relative rect of the shared picture itself. */
export type ContentRect = { left: number; top: number; width: number; height: number };

/** How <VideoConference> renders a screenshare, verified against components-react 2.9.x. */
const SCREEN_SHARE_SELECTOR = 'video.lk-participant-media-video[data-lk-source="screen_share"]';

/**
 * Computes where the picture actually sits inside the video element.
 *
 * LiveKit styles screenshare video with `object-fit: contain`, so the element's
 * bounding box includes letterbox bars that are not part of the shared screen.
 * Anchoring annotations to the box instead of the picture would make marks drift
 * for any viewer whose window aspect ratio differs from the sharer's.
 */
function computeContentRect(video: HTMLVideoElement): ContentRect {
  const box = video.getBoundingClientRect();
  const { videoWidth, videoHeight } = video;
  // Before metadata arrives there is no aspect ratio to letterbox against.
  if (!videoWidth || !videoHeight || !box.width || !box.height) {
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }
  const scale = Math.min(box.width / videoWidth, box.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

function sameRect(a: ContentRect, b: ContentRect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/**
 * Tracks the screenshare element rendered by <VideoConference> and the rect of
 * its picture, returning null while nobody is sharing.
 *
 * <VideoConference> owns its own DOM and exposes no slot for an overlay, so the
 * element is located by selector and followed with observers. If you later
 * replace the prefab with a composed layout, this hook is the piece to delete:
 * the canvas can then be a child of the tile and read its rect directly.
 */
export function useScreenShareRect(): ContentRect | null {
  const [rect, setRect] = React.useState<ContentRect | null>(null);

  React.useEffect(() => {
    let frame = 0;
    let tracked: HTMLVideoElement | null = null;
    const elementObserver = new ResizeObserver(() => schedule());

    const measure = () => {
      frame = 0;
      const video = document.querySelector<HTMLVideoElement>(SCREEN_SHARE_SELECTOR);

      if (video !== tracked) {
        // The prefab swaps elements as the layout changes (grid <-> focus), so
        // re-point the observers whenever the element identity changes.
        elementObserver.disconnect();
        tracked?.removeEventListener('resize', schedule);
        tracked?.removeEventListener('loadedmetadata', schedule);
        if (video) {
          elementObserver.observe(video);
          // Intrinsic size changes when the sharer switches window or display,
          // which moves the letterbox bars without resizing the element.
          video.addEventListener('resize', schedule);
          video.addEventListener('loadedmetadata', schedule);
        }
        tracked = video;
      }

      if (!video) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const next = computeContentRect(video);
      setRect((prev) => (prev && sameRect(prev, next) ? prev : next));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    schedule();

    // Catches the element being mounted, unmounted or moved between layouts.
    const treeObserver = new MutationObserver(schedule);
    treeObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      elementObserver.disconnect();
      treeObserver.disconnect();
      tracked?.removeEventListener('resize', schedule);
      tracked?.removeEventListener('loadedmetadata', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
    };
  }, []);

  return rect;
}
