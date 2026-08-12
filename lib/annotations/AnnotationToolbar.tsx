'use client';

import * as React from 'react';
import styles from '../../styles/Annotations.module.css';
import { ANNOTATION_PALETTE } from './colors';
import { STROKE_WIDTHS, type AnnotationTool, type StrokeWidthName } from './types';

type Props = {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  widthName: StrokeWidthName;
  onWidthChange: (name: StrokeWidthName) => void;
  onUndo: () => void;
  onClear: () => void;
  /** Label of the board Clear will wipe, or null when none is active yet. */
  clearTarget: string | null;
};

const WIDTH_ORDER: StrokeWidthName[] = ['thin', 'medium', 'thick'];
/** Swatch dot sizes in px — presentational only, unrelated to STROKE_WIDTHS. */
const WIDTH_DOT_PX: Record<StrokeWidthName, number> = { thin: 4, medium: 7, thick: 11 };

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 21l1.2-4.2L16.9 4.1l3 3L7.2 19.8 3 21z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16.9 4.1l1.6-1.6a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5l-1.6 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8.6 20.5H20M4.2 16.3l4.1 4.2h3.9l7.6-7.7a1.8 1.8 0 0 0 0-2.5l-4.6-4.6a1.8 1.8 0 0 0-2.5 0L4.2 13.8a1.8 1.8 0 0 0 0 2.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  widthName,
  onWidthChange,
  onUndo,
  onClear,
  clearTarget,
}: Props) {
  const toggle = (next: AnnotationTool) => onToolChange(tool === next ? 'none' : next);

  return (
    <div className={styles.toolbar} data-lk-theme="default">
      <button
        className={`lk-button ${styles.toolButton}`}
        onClick={() => toggle('pen')}
        aria-pressed={tool === 'pen'}
        data-lk-annotating={tool === 'pen'}
        title="Annotate the shared screen (P)"
      >
        <PencilIcon />
        <span className={styles.buttonLabel}>Annotate</span>
      </button>

      <button
        className={`lk-button ${styles.toolButton}`}
        onClick={() => toggle('eraser')}
        aria-pressed={tool === 'eraser'}
        data-lk-annotating={tool === 'eraser'}
        title="Erase strokes (E)"
      >
        <EraserIcon />
        <span className={styles.buttonLabel}>Erase</span>
      </button>

      {tool === 'pen' && (
        <>
          <span className={styles.divider} role="separator" />

          <div className={styles.swatches} role="group" aria-label="Pen color">
            {ANNOTATION_PALETTE.map((option) => (
              <button
                key={option}
                className={styles.swatch}
                style={{ background: option }}
                aria-label={`Pen color ${option}`}
                aria-pressed={option === color}
                data-lk-selected={option === color}
                onClick={() => onColorChange(option)}
              />
            ))}
          </div>

          <span className={styles.divider} role="separator" />

          <div className={styles.swatches} role="group" aria-label="Pen thickness">
            {WIDTH_ORDER.map((name) => (
              <button
                key={name}
                className={styles.widthButton}
                aria-label={`${name} pen`}
                aria-pressed={name === widthName}
                data-lk-selected={name === widthName}
                onClick={() => onWidthChange(name)}
                title={`${name[0].toUpperCase()}${name.slice(1)} — ${STROKE_WIDTHS[name]}`}
              >
                <span
                  className={styles.widthDot}
                  style={{
                    width: WIDTH_DOT_PX[name],
                    height: WIDTH_DOT_PX[name],
                    background: color,
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      {tool !== 'none' && (
        <>
          <span className={styles.divider} role="separator" />
          <button
            className={`lk-button ${styles.toolButton}`}
            onClick={onUndo}
            title="Undo my last stroke (Cmd/Ctrl-Z)"
          >
            Undo
          </button>
          <button
            className={`lk-button ${styles.toolButton}`}
            onClick={onClear}
            disabled={clearTarget === null}
            title={
              clearTarget === null
                ? 'Point at a video to choose which board to clear'
                : `Clear every stroke on ${clearTarget} for everyone`
            }
          >
            {clearTarget === null ? 'Clear' : `Clear ${clearTarget}`}
          </button>
        </>
      )}
    </div>
  );
}
