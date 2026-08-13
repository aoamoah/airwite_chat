import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { Room } from 'livekit-client';
import { RoomContext } from '@livekit/components-react';
import { describe, expect, it } from 'vitest';
import { ConnectionNotice } from './ConnectionNotice';
import { DataSaver } from './DataSaver';
import type { DataModeState } from './useDataMode';

/**
 * These components live beside <VideoConference>, in the room but not inside
 * any participant tile.
 *
 * That distinction is not cosmetic: several LiveKit hooks resolve a participant
 * from React context and throw outright when there is none, which took down the
 * whole meeting rather than degrading. Rendering them exactly where they are
 * mounted is the cheapest way to keep that from coming back.
 */
function inRoom(node: React.ReactNode) {
  const room = new Room();
  return () => renderToString(React.createElement(RoomContext.Provider, { value: room }, node));
}

const state: DataModeState = {
  mode: 'full',
  choose: () => {},
  applyAutomatic: () => {},
};

describe('mounting outside a participant context', () => {
  it('renders the connection notice', () => {
    expect(inRoom(React.createElement(ConnectionNotice))).not.toThrow();
  });

  it('renders the data saver control', () => {
    expect(inRoom(React.createElement(DataSaver, { state }))).not.toThrow();
  });
});
