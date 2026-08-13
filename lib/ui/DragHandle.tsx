'use client';

import * as React from 'react';
import styles from '../../styles/Draggable.module.css';
import type { Draggable } from './useDraggable';

/**
 * The grip that moves a floating panel, and puts it back.
 *
 * Double-clicking returns the panel to where the stylesheet wants it, which is
 * the way out of having dragged something somewhere unhelpful.
 */
export function DragHandle({ drag, label }: { drag: Draggable; label: string }) {
  return (
    <button
      type="button"
      className={styles.grip}
      aria-label={drag.moved ? `Move ${label} (double-click to reset)` : `Move ${label}`}
      title={drag.moved ? 'Drag to move — double-click to reset' : 'Drag to move'}
      onDoubleClick={drag.reset}
      {...drag.handleProps}
    >
      <svg
        className={styles.gripDots}
        width="10"
        height="16"
        viewBox="0 0 10 16"
        aria-hidden="true"
        focusable="false"
      >
        <g fill="currentColor">
          <circle cx="3" cy="3" r="1.3" />
          <circle cx="7" cy="3" r="1.3" />
          <circle cx="3" cy="8" r="1.3" />
          <circle cx="7" cy="8" r="1.3" />
          <circle cx="3" cy="13" r="1.3" />
          <circle cx="7" cy="13" r="1.3" />
        </g>
      </svg>
    </button>
  );
}
