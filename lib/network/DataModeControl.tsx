'use client';

import * as React from 'react';
import styles from '../../styles/Network.module.css';
import { DATA_MODES, DATA_MODE_HINTS, DATA_MODE_LABELS, type DataMode } from './types';

/**
 * The data-use picker, in the participant's language rather than the network's.
 * No bitrates, no resolutions — three choices and what each one costs.
 */
export function DataModeControl({
  mode,
  onChange,
  className,
  showHint = true,
}: {
  mode: DataMode;
  onChange: (mode: DataMode) => void;
  className?: string;
  showHint?: boolean;
}) {
  return (
    <div className={className ? `${styles.control} ${className}` : styles.control}>
      <span className={styles.label}>Data use</span>
      <div className={styles.segments} role="group" aria-label="Data use">
        {DATA_MODES.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.segment}
            aria-pressed={mode === option}
            onClick={() => onChange(option)}
          >
            {DATA_MODE_LABELS[option]}
          </button>
        ))}
      </div>
      {showHint && <span className={styles.hint}>{DATA_MODE_HINTS[mode]}</span>}
    </div>
  );
}
