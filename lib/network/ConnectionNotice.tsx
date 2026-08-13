'use client';

import * as React from 'react';
import { ConnectionQuality } from 'livekit-client';
import { useConnectionQualityIndicator, useLocalParticipant } from '@livekit/components-react';
import styles from '../../styles/Network.module.css';
import { isDegraded } from './degrade';

/**
 * Says something only when there is something to say.
 *
 * A permanent signal-strength meter is one more thing to read on a small screen
 * and, on a connection that is fine, tells the participant nothing they need.
 */
export function ConnectionNotice() {
  // The participant must be named. Called bare, this hook reads a participant
  // context that only exists inside a tile, and throws everywhere else — and
  // the connection worth reporting here is this participant's own.
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  if (!isDegraded(quality)) return null;

  const lost = quality === ConnectionQuality.Lost;

  return (
    <div
      className={lost ? `${styles.notice} ${styles.noticeLost}` : styles.notice}
      role="status"
      aria-live="polite"
    >
      <span className={styles.noticeDot} aria-hidden="true" />
      <span>{lost ? 'Reconnecting…' : 'Your connection is weak.'}</span>
    </div>
  );
}
