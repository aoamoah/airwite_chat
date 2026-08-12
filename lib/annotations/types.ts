/** Topic carrying all annotation traffic on the LiveKit data channel. */
export const ANNOTATION_TOPIC = 'lk-annotations';

/**
 * A stroke's geometry lives in normalized screenshare space: both axes run 0..1
 * across the *content* box of the shared video, excluding letterbox bars. A mark
 * therefore lands on the same pixel of the shared screen for every viewer, no
 * matter how their window is sized.
 */
export type Stroke = {
  id: string;
  /** Participant identity of whoever drew it. Set from the sender, never from the payload. */
  author: string;
  /** Which board this belongs to — see Surface.id. Boards are independent. */
  surface: string;
  color: string;
  /** Line width as a fraction of the content box's shorter side, so it scales with the share. */
  width: number;
  /** Flat [x0, y0, x1, y1, ...] — roughly half the JSON of an array of {x, y}. */
  points: number[];
};

/**
 * Wire protocol. `begin` is the "writing" event and `end` the "not writing"
 * event: they bracket one press-drag-release. Points in between are batched
 * rather than sent per movement, see BATCH_INTERVAL_MS.
 */
export type AnnotationMessage =
  | { t: 'begin'; id: string; s: string; color: string; width: number; p: number[] }
  | { t: 'points'; id: string; p: number[] }
  | { t: 'end'; id: string }
  | { t: 'undo'; id: string }
  | { t: 'erase'; ids: string[] }
  | { t: 'clear'; s: string }
  | { t: 'sync-request' }
  | { t: 'sync-state'; strokes: Stroke[] };

/** Which input mode the local pointer is in. */
export type AnnotationTool = 'none' | 'pen' | 'eraser';

/** Fractions of the content box's shorter side. */
export const STROKE_WIDTHS = {
  thin: 0.003,
  medium: 0.006,
  thick: 0.012,
} as const;

export type StrokeWidthName = keyof typeof STROKE_WIDTHS;

/**
 * Eraser reach, as a fraction of the content box's shorter side — comfortably
 * wider than the thickest pen so a stroke can be caught without pixel-hunting.
 */
export const ERASER_RADIUS = 0.018;

/**
 * How often in-progress points are flushed to the channel. Pointer events fire
 * far faster than this on high-refresh displays, and every packet is reliable,
 * so batching keeps the channel calm without visible lag.
 */
export const BATCH_INTERVAL_MS = 40;
