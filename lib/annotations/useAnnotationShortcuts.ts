'use client';

import * as React from 'react';
import type { AnnotationTool } from './types';

/**
 * Whether the key belongs to whoever is typing rather than to us. Without this,
 * "please erase that" in the chat box would toggle tools on every e and p.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

type Options = {
  /** Shortcuts stay dormant unless a screenshare is on the call. */
  enabled: boolean;
  tool: AnnotationTool;
  setTool: React.Dispatch<React.SetStateAction<AnnotationTool>>;
  onUndo: () => void;
};

/**
 * P toggles the pen, E the eraser, Escape puts the tool down, and Cmd/Ctrl-Z
 * undoes your last stroke.
 *
 * Single letters rather than the Cmd-Shift chords used elsewhere in the app: a
 * drawing tool gets switched constantly mid-gesture, and a chord makes that
 * two-handed. The trade is that they must yield to text fields, which is what
 * isTypingTarget is for.
 */
export function useAnnotationShortcuts({ enabled, tool, setTool, onUndo }: Options): void {
  React.useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        // Only claim undo while a tool is out, so the browser keeps its own
        // undo the rest of the time.
        if (tool === 'none') return;
        event.preventDefault();
        onUndo();
        return;
      }

      // Everything below is a bare key, so leave browser and OS chords alone.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'p':
          event.preventDefault();
          setTool((current) => (current === 'pen' ? 'none' : 'pen'));
          break;
        case 'e':
          event.preventDefault();
          setTool((current) => (current === 'eraser' ? 'none' : 'eraser'));
          break;
        case 'escape':
          setTool('none');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, tool, setTool, onUndo]);
}
