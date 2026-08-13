'use client';

import * as React from 'react';

/**
 * The floating panels that can expand over the meeting.
 *
 * They all live in the same corner of a phone screen, so two open at once means
 * one covering the other. Only one is allowed open at a time.
 */
export type PanelId = 'annotation' | 'airwrite' | 'dataSaver' | 'captions';

type PanelStack = {
  open: PanelId | null;
  setOpen: (id: PanelId | null) => void;
};

const PanelContext = React.createContext<PanelStack>({ open: null, setOpen: () => {} });

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState<PanelId | null>(null);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export type PanelHandle = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

/**
 * Claims the single open slot for one panel.
 *
 * Opening one closes whichever was open, which is what callers should watch:
 * a panel that owns state of its own — a selected tool, a running camera
 * pipeline — has to shut that down when `isOpen` goes false.
 */
export function usePanel(id: PanelId): PanelHandle {
  const { open, setOpen } = React.useContext(PanelContext);
  const isOpen = open === id;

  return React.useMemo(
    () => ({
      isOpen,
      open: () => setOpen(id),
      // Only ever closes itself, never whatever replaced it.
      close: () => {
        if (isOpen) setOpen(null);
      },
      toggle: () => setOpen(isOpen ? null : id),
    }),
    [id, isOpen, setOpen],
  );
}
