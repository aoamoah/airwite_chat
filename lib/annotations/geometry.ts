/** A viewport-relative rectangle. */
export type Rect = { left: number; top: number; width: number; height: number };

export type VideoGeometry = {
  /** The element's own rect — what the viewer can actually see. */
  box: Rect;
  /**
   * Where the full video frame lies, in viewport coordinates.
   *
   * With `object-fit: contain` (screenshare, portrait cameras) the frame sits
   * inside the box, surrounded by letterbox bars. With `cover` (landscape
   * cameras) the frame is larger than the box and overflows it on two sides.
   * Annotations are normalized against the frame either way, so a mark keeps
   * its place on the picture no matter how a given viewer's tile is shaped —
   * at the cost, under `cover`, of marks near the edge falling outside someone
   * else's crop.
   */
  frame: Rect;
};

/**
 * Where a video frame of the given intrinsic size lands inside a box.
 *
 * Split out from the DOM so it can be tested directly: `cover` scales up until
 * the box is filled and overflows the rest, `contain` scales down until the
 * whole frame fits. Both centre what they produce, matching the
 * `object-position: center` LiveKit sets.
 */
export function fitFrame(
  box: Rect,
  videoWidth: number,
  videoHeight: number,
  objectFit: string,
): Rect {
  const scale =
    objectFit === 'cover'
      ? Math.max(box.width / videoWidth, box.height / videoHeight)
      : Math.min(box.width / videoWidth, box.height / videoHeight);

  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

export function measureVideo(video: HTMLVideoElement): VideoGeometry | null {
  const rect = video.getBoundingClientRect();
  const box: Rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  if (!box.width || !box.height) return null;

  const { videoWidth, videoHeight } = video;
  // Before metadata arrives there is no aspect ratio to fit against.
  if (!videoWidth || !videoHeight) return { box, frame: box };

  // Read the fit rather than assuming it: LiveKit uses `contain` for
  // screenshare and portrait cameras, `cover` for landscape ones.
  const objectFit = getComputedStyle(video).objectFit;
  return { box, frame: fitFrame(box, videoWidth, videoHeight, objectFit) };
}

/**
 * Whether this viewer sees the video flipped left-to-right.
 *
 * LiveKit mirrors your own camera preview, which is a per-viewer illusion: the
 * published frames are not flipped, and nobody else sees them that way. Drawing
 * on your own cheek would therefore land on the opposite cheek for everyone
 * else unless input and painting are both un-flipped.
 *
 * Detected from the computed matrix rather than by re-implementing LiveKit's
 * selector, so it keeps working if they change how the mirror is applied.
 */
export function isMirrored(video: HTMLVideoElement): boolean {
  const { transform } = getComputedStyle(video);
  if (!transform || transform === 'none') return false;
  const open = transform.indexOf('(');
  if (open === -1) return false;
  // matrix(a, b, c, d, e, f) and matrix3d(...) both lead with the x scale.
  const first = Number.parseFloat(transform.slice(open + 1));
  return Number.isFinite(first) && first < 0;
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
