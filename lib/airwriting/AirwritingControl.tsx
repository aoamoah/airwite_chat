'use client';

import * as React from 'react';
import styles from '../../styles/Airwriting.module.css';
import { DragHandle } from '../ui/DragHandle';
import { useDraggable } from '../ui/useDraggable';
import { usePanel } from '../ui/PanelStack';
import { loadModelManifest, type ModelInfo } from './classifier';
import { SAMPLE_FPS } from './useHandTracker';
import { useAirwriting, type AirwritingPoint } from './useAirwriting';

/** Window preferred when several models are available, if one matches. */
const PREFERRED_WINDOW = 30;

type Props = {
  /** Board the hand draws on: the local participant's own camera tile. */
  surfaceId: string | null;
  onBegin: (surfaceId: string, point: AirwritingPoint) => void;
  onExtend: (point: AirwritingPoint) => void;
  onEnd: () => void;
  /**
   * Show the technical readout. Off for ordinary participants, who get a bare
   * toggle; on when an administrator has enabled AirWrite diagnostics.
   */
  diagnostics?: boolean;
};

function statusLabel(status: string, error: string | null): string {
  if (error) return 'error';
  return status;
}

/**
 * Toggle for air-writing, with an optional live readout.
 *
 * The probability bar is not decoration: the model is a black box whose only
 * observable output is this number, and seeing it move with your hand is the
 * quickest way to confirm the feature pipeline matches training and to pick
 * sensible gate thresholds. It is a debugging instrument, though, so it stays
 * behind `diagnostics` — a participant in a meeting sees only the toggle.
 */
export function AirwritingControl({
  surfaceId,
  onBegin,
  onExtend,
  onEnd,
  diagnostics = false,
}: Props) {
  const [enabled, setEnabled] = React.useState(false);
  const drag = useDraggable('yehyia:airwrite-panel');
  const [models, setModels] = React.useState<ModelInfo[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [manifestError, setManifestError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadModelManifest()
      .then((staged) => {
        if (cancelled) return;
        setModels(staged);
        const preferred =
          staged.find((entry) => entry.windowSize === PREFERRED_WINDOW) ?? staged[0];
        setSelected(preferred?.file ?? null);
      })
      .catch((cause) => {
        if (cancelled) return;
        console.error('[airwriting] could not load model manifest', cause);
        setManifestError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const model = React.useMemo(
    () => models.find((entry) => entry.file === selected) ?? null,
    [models, selected],
  );

  const available = surfaceId !== null && model !== null;

  // Air-writing owns the camera pipeline while it runs, so losing the single
  // open slot to another panel has to actually stop it, not just hide it.
  const panel = usePanel('airwrite');
  const { isOpen, open, close } = panel;

  React.useEffect(() => {
    if (!isOpen && enabled) setEnabled(false);
  }, [isOpen, enabled]);

  // Losing the camera — or the model — stops it and hands the slot back, rather
  // than leaving the slot claimed by a panel that can no longer do anything.
  React.useEffect(() => {
    if (available) return;
    setEnabled(false);
    close();
  }, [available, close]);

  const setRunning = (next: boolean) => {
    setEnabled(next);
    if (next) open();
    else close();
  };

  const surfaceRef = React.useRef(surfaceId);
  surfaceRef.current = surfaceId;

  const callbacks = React.useMemo(
    () => ({
      onBegin: (point: AirwritingPoint) => {
        const surface = surfaceRef.current;
        if (surface) onBegin(surface, point);
      },
      onExtend,
      onEnd,
    }),
    [onBegin, onExtend, onEnd],
  );

  const {
    status,
    error,
    probability,
    isWriting,
    handVisible,
    delegate,
    delegateError,
    detectMs,
    inferMs,
  } = useAirwriting({ enabled: enabled && available, model }, callbacks);

  // The pipeline samples at 30fps, so anything approaching 33ms per frame means
  // the detector cannot keep up and the lag is real rather than model latency.
  const frameBudgetMs = 1000 / SAMPLE_FPS;
  const overBudget = detectMs + inferMs > frameBudgetMs;

  const latencyMs = model ? Math.round((model.windowSize / SAMPLE_FPS) * 1000) : 0;

  return (
    <div className={styles.panel} data-lk-theme="default" ref={drag.ref} style={drag.style}>
      <DragHandle drag={drag} label="the air-write panel" />

      <button
        className={`lk-button ${styles.toggle}`}
        onClick={() => setRunning(!enabled)}
        disabled={!available}
        aria-pressed={enabled}
        data-lk-active={enabled}
        title={
          surfaceId === null
            ? 'Turn your camera on to air-write'
            : model === null
              ? 'No trained model is available'
              : 'Draw on your own tile with your right hand'
        }
      >
        Air-write
      </button>

      {diagnostics && (
        <label className={styles.windowPicker}>
          <span className={styles.dim}>model</span>
          <select
            value={selected ?? ''}
            onChange={(event) => setSelected(event.target.value)}
            disabled={enabled || models.length === 0}
            title="Frames per decision. Fewer reacts sooner; more sees a longer gesture."
          >
            {models.map((entry) => (
              <option key={entry.file} value={entry.file}>
                {entry.windowSize} frames ({Math.round((entry.windowSize / SAMPLE_FPS) * 1000)}ms)
              </option>
            ))}
          </select>
        </label>
      )}

      {enabled && diagnostics && (
        <div className={styles.readout}>
          <span className={styles.dim}>{statusLabel(status, error)}</span>

          <div
            className={styles.meter}
            title={`P(writing) — the gate opens above 0.6 and closes below 0.4. Decisions lag by about ${latencyMs}ms.`}
          >
            <div
              className={styles.meterFill}
              style={{
                width: `${Math.round((probability ?? 0) * 100)}%`,
                background: isWriting ? '#41d97a' : '#ffb020',
              }}
            />
            <span className={styles.meterLabel}>
              {probability === null ? 'priming…' : probability.toFixed(2)}
            </span>
          </div>

          <span className={styles.dim} title="Right hand only, as trained">
            {handVisible ? (isWriting ? 'writing' : 'tracking') : 'no hand'}
          </span>

          <span
            className={overBudget ? styles.error : styles.dim}
            title={
              `Per sampled frame: ${detectMs.toFixed(1)}ms hand detection + ` +
              `${inferMs.toFixed(1)}ms classification, against a ${frameBudgetMs.toFixed(0)}ms ` +
              `budget at ${SAMPLE_FPS}fps. ` +
              (delegate === 'CPU'
                ? `Running on CPU. The GPU delegate was refused: ${delegateError ?? 'no reason given'}`
                : 'Detection is on the GPU.')
            }
          >
            {detectMs.toFixed(0)}+{inferMs.toFixed(0)}ms
            {delegate === 'CPU' ? ' cpu' : ''}
          </span>
        </div>
      )}

      {(error || manifestError) &&
        (diagnostics ? (
          <span className={styles.error}>{error ?? manifestError}</span>
        ) : (
          // A participant gets the fact, not the failure. The meeting carries on.
          <span className={styles.dim}>Air-write unavailable</span>
        ))}
    </div>
  );
}
