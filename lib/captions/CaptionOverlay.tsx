'use client';

import * as React from 'react';
import styles from '../../styles/Captions.module.css';
import type { Caption } from './types';

/**
 * The captions themselves, over the video.
 *
 * Speakers are named because captions arrive a beat behind the audio: without
 * a name it is genuinely unclear who a line belongs to when two people talk
 * close together.
 */
export function CaptionOverlay({ captions }: { captions: Caption[] }) {
  if (captions.length === 0) return null;

  return (
    <div className={styles.overlay} role="log" aria-live="polite" aria-label="Captions">
      {captions.map((caption) => (
        <p className={styles.line} key={`${caption.identity}:${caption.at}`}>
          <span className={styles.speaker}>{caption.speaker}</span>
          {caption.text}
        </p>
      ))}
    </div>
  );
}
