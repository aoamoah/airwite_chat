'use client';

import * as React from 'react';
import { useRoomContext } from '@livekit/components-react';
import toast from 'react-hot-toast';
import styles from '../../styles/Network.module.css';
import { DataModeControl } from './DataModeControl';
import { DragHandle } from '../ui/DragHandle';
import { usePanel } from '../ui/PanelStack';
import { useDraggable } from '../ui/useDraggable';
import { DATA_MODE_LABELS } from './types';
import type { DataModeState } from './useDataMode';
import { useApplyDataMode } from './useApplyDataMode';
import { useAutoDegrade } from './useAutoDegrade';
import type { DataMode } from './types';

/** How long automatic stepping down stays out of the way after being overruled. */
const OVERRULE_COOLDOWN_MS = 2 * 60 * 1000;

const DEGRADE_MESSAGE: Record<DataMode, string> = {
  full: '',
  low: 'Your connection is weak, so video quality was lowered.',
  'audio-only': 'Your connection could not keep up, so video is off for now.',
};

/**
 * Keeps the meeting inside the participant's data budget, and inside what their
 * connection can actually carry.
 */
export function DataSaver({ state }: { state: DataModeState }) {
  const room = useRoomContext();
  const { mode, choose, applyAutomatic } = state;

  useApplyDataMode(room, mode);

  // Automatic stepping down pauses after the participant overrules it, so a
  // connection that stays bad does not undo their decision every few seconds.
  const [autoEnabled, setAutoEnabled] = React.useState(true);
  const cooldown = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (cooldown.current) clearTimeout(cooldown.current);
    },
    [],
  );

  const pauseAutomatic = React.useCallback(() => {
    setAutoEnabled(false);
    if (cooldown.current) clearTimeout(cooldown.current);
    cooldown.current = setTimeout(() => setAutoEnabled(true), OVERRULE_COOLDOWN_MS);
  }, []);

  const handleDegrade = React.useCallback(
    (next: DataMode) => {
      const previous = mode;
      applyAutomatic(next);

      toast(
        (item) => (
          <span>
            {DEGRADE_MESSAGE[next]}{' '}
            <button
              type="button"
              className="lk-button"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => {
                // Deliberate, so it is remembered and automation backs off.
                choose(previous);
                pauseAutomatic();
                toast.dismiss(item.id);
              }}
            >
              Undo
            </button>
          </span>
        ),
        { duration: 10_000 },
      );
    },
    [mode, applyAutomatic, choose, pauseAutomatic],
  );

  useAutoDegrade(mode, handleDegrade, autoEnabled);

  const handleChoice = React.useCallback(
    (next: DataMode) => {
      choose(next);
      pauseAutomatic();
    },
    [choose, pauseAutomatic],
  );

  // Collapsed to a pill by default. Three labelled segments permanently across
  // the top of a phone screen is a lot of furniture for a setting most people
  // touch once.
  const panel = usePanel('dataSaver');
  const drag = useDraggable('yehyia:data-saver');

  return (
    <div className={styles.floating} ref={drag.ref} style={drag.style}>
      <div className={styles.floatingHeader}>
        <DragHandle drag={drag} label="the data use control" />
        <button
          type="button"
          className={styles.summary}
          onClick={panel.toggle}
          aria-expanded={panel.isOpen}
          title="Choose how much data this meeting uses"
        >
          <span className={styles.summaryDot} data-lk-mode={mode} aria-hidden="true" />
          <span className={styles.summaryText}>{DATA_MODE_LABELS[mode]}</span>
        </button>
      </div>

      {panel.isOpen && (
        <DataModeControl mode={mode} onChange={handleChoice} className={styles.expanded} />
      )}
    </div>
  );
}
