'use client';

import * as React from 'react';
import { DATA_MODES, type DataMode } from './types';

const STORAGE_KEY = 'yehyia:data-mode';

export type DataModeState = {
  mode: DataMode;
  /** A deliberate choice. Remembered for the next meeting. */
  choose: (mode: DataMode) => void;
  /**
   * A change the app made on the participant's behalf. Not remembered: it
   * describes tonight's network, not what this person wants to spend.
   */
  applyAutomatic: (mode: DataMode) => void;
};

function readStored(): DataMode | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && (DATA_MODES as readonly string[]).includes(stored)
      ? (stored as DataMode)
      : null;
  } catch {
    // Private browsing and blocked storage both throw rather than return null.
    return null;
  }
}

/**
 * The participant's data preference, remembered across meetings.
 *
 * Someone paying for every megabyte should not have to re-declare that each
 * time they join.
 */
export function useDataMode(): DataModeState {
  const [mode, setMode] = React.useState<DataMode>('full');

  // Read after mount rather than in the initial state: localStorage does not
  // exist during the server render, and seeding from it would make the first
  // client render disagree with the HTML that was sent.
  React.useEffect(() => {
    const stored = readStored();
    if (stored) setMode(stored);
  }, []);

  const choose = React.useCallback((next: DataMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not a reason to ignore it.
    }
  }, []);

  const applyAutomatic = React.useCallback((next: DataMode) => setMode(next), []);

  return { mode, choose, applyAutomatic };
}
