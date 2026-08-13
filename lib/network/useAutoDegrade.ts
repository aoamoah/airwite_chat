'use client';

import * as React from 'react';
import { ConnectionQuality } from 'livekit-client';
import { useConnectionQualityIndicator, useLocalParticipant } from '@livekit/components-react';
import { dwellRequired, nextDegradedMode } from './degrade';
import type { DataMode } from './types';

/**
 * Watches the local connection and spends less data when it cannot keep up.
 *
 * One timer is armed per reading rather than polling: any change to quality or
 * to the current mode cancels it and starts again, which is precisely what
 * "sustained for N seconds" means, and costs nothing while the network is fine.
 */
export function useAutoDegrade(
  mode: DataMode,
  onDegrade: (next: DataMode) => void,
  enabled: boolean,
): ConnectionQuality {
  // Named explicitly: called bare, this hook reads a participant context that
  // exists only inside a tile and throws anywhere else.
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  const onDegradeRef = React.useRef(onDegrade);
  onDegradeRef.current = onDegrade;

  React.useEffect(() => {
    if (!enabled) return;

    const dwell = dwellRequired(mode, quality);
    if (dwell === null) return;

    const timer = setTimeout(() => {
      const next = nextDegradedMode({ mode, quality, sustainedMs: dwell });
      if (next) onDegradeRef.current(next);
    }, dwell);

    return () => clearTimeout(timer);
  }, [quality, mode, enabled]);

  return quality;
}
