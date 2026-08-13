'use client';

import React from 'react';
import { decodePassphrase } from '@/lib/client-utils';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { ConnectionDetails } from '@/lib/types';
import {
  formatChatMessageLinks,
  LocalUserChoices,
  PreJoin,
  RoomContext,
  VideoConference,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  DeviceUnsupportedError,
  RoomConnectOptions,
  RoomEvent,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { useLowCPUOptimizer } from '@/lib/usePerfomanceOptimiser';
import { AnnotationLayer } from '@/lib/annotations/AnnotationLayer';
import { FeatureProvider, useFeatures } from '@/lib/config/FeatureFlags';
import type { PublicConfig } from '@/lib/config/types';
import { Captions } from '@/lib/captions/Captions';
import { ConnectionNotice } from '@/lib/network/ConnectionNotice';
import { DataModeControl } from '@/lib/network/DataModeControl';
import { DataSaver } from '@/lib/network/DataSaver';
import { useDataMode, type DataModeState } from '@/lib/network/useDataMode';
import { PanelProvider } from '@/lib/ui/PanelStack';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
  singlePeerConnection: boolean;
  featureConfig: PublicConfig;
}) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(
    undefined,
  );
  const preJoinDefaults = React.useMemo(() => {
    return {
      username: '',
      videoEnabled: true,
      audioEnabled: true,
    };
  }, []);
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
    undefined,
  );

  const handlePreJoinSubmit = React.useCallback(async (values: LocalUserChoices) => {
    setPreJoinChoices(values);
    const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
    url.searchParams.append('roomName', props.roomName);
    url.searchParams.append('participantName', values.username);
    if (props.region) {
      url.searchParams.append('region', props.region);
    }
    const connectionDetailsResp = await fetch(url.toString());
    const connectionDetailsData = await connectionDetailsResp.json();
    setConnectionDetails(connectionDetailsData);
  }, []);
  const handlePreJoinError = React.useCallback((e: any) => console.error(e), []);

  // Held here rather than inside the meeting so the choice is made before any
  // video starts, which is where the data is actually saved.
  const dataMode = useDataMode();
  const dataSaverEnabled = props.featureConfig.features.dataSaver;

  return (
    <FeatureProvider config={props.featureConfig}>
      <main data-lk-theme="default" style={{ height: '100%' }}>
        {connectionDetails === undefined || preJoinChoices === undefined ? (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              alignContent: 'center',
              gap: '1.5rem',
              height: '100%',
            }}
          >
            <PreJoin
              defaults={preJoinDefaults}
              onSubmit={handlePreJoinSubmit}
              onError={handlePreJoinError}
            />
            {dataSaverEnabled && (
              <div style={{ width: 'min(23rem, calc(100vw - 2rem))' }}>
                <DataModeControl mode={dataMode.mode} onChange={dataMode.choose} />
              </div>
            )}
          </div>
        ) : (
          <VideoConferenceComponent
            connectionDetails={connectionDetails}
            userChoices={preJoinChoices}
            dataMode={dataMode}
            options={{
              codec: props.codec,
              hq: props.hq,
              singlePeerConnection: props.singlePeerConnection,
            }}
          />
        )}
      </main>
    </FeatureProvider>
  );
}

function VideoConferenceComponent(props: {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  dataMode: DataModeState;
  options: {
    hq: boolean;
    codec: VideoCodec;
    singlePeerConnection: boolean;
  };
}) {
  const keyProvider = new ExternalE2EEKeyProvider();
  const { worker, e2eePassphrase } = useSetupE2EE();
  const e2eeEnabled = !!(e2eePassphrase && worker);

  const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);

  /**
   * The data mode as it stood when this meeting was joined.
   *
   * Capture settings are fixed when the Room is constructed and the connect
   * effect must not re-run, so both read this rather than the live value. A
   * mode changed mid-meeting is applied by useApplyDataMode instead.
   */
  const joinMode = React.useRef(props.dataMode.mode).current;

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }
    // Capturing small in the first place is what saves data — a stream that is
    // never encoded at 720p costs nothing to not send.
    const lowData = joinMode !== 'full';
    const videoCaptureDefaults: VideoCaptureOptions = {
      deviceId: props.userChoices.videoDeviceId ?? undefined,
      resolution: lowData
        ? VideoPresets.h180
        : props.options.hq
          ? VideoPresets.h2160
          : VideoPresets.h720,
    };
    const publishDefaults: TrackPublishDefaults = {
      dtx: false,
      // Simulcast publishes several encodings of the same camera at once. That
      // is the right trade when upstream bandwidth is plentiful, and precisely
      // the wrong one here, so low-data sends a single small stream.
      simulcast: !lowData,
      videoSimulcastLayers: lowData
        ? undefined
        : props.options.hq
          ? [VideoPresets.h1080, VideoPresets.h720]
          : [VideoPresets.h540, VideoPresets.h216],
      red: !e2eeEnabled,
      videoCodec,
    };
    return {
      videoCaptureDefaults: videoCaptureDefaults,
      publishDefaults: publishDefaults,
      audioCaptureDefaults: {
        deviceId: props.userChoices.audioDeviceId ?? undefined,
      },
      adaptiveStream: true,
      dynacast: true,
      e2ee: keyProvider && worker && e2eeEnabled ? { keyProvider, worker } : undefined,
      singlePeerConnection: props.options.singlePeerConnection,
    };
  }, [props.userChoices, props.options.hq, props.options.codec]);

  const room = React.useMemo(() => new Room(roomOptions), []);

  React.useEffect(() => {
    if (e2eeEnabled) {
      keyProvider
        .setKey(decodePassphrase(e2eePassphrase))
        .then(() => {
          room.setE2EEEnabled(true).catch((e) => {
            if (e instanceof DeviceUnsupportedError) {
              alert(
                `You're trying to join an encrypted meeting, but your browser does not support it. Please update it to the latest version and try again.`,
              );
              console.error(e);
            } else {
              throw e;
            }
          });
        })
        .then(() => setE2eeSetupComplete(true));
    } else {
      setE2eeSetupComplete(true);
    }
  }, [e2eeEnabled, room, e2eePassphrase]);

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  React.useEffect(() => {
    room.on(RoomEvent.Disconnected, handleOnLeave);
    room.on(RoomEvent.EncryptionError, handleEncryptionError);
    room.on(RoomEvent.MediaDevicesError, handleError);

    if (e2eeSetupComplete) {
      room
        .connect(
          props.connectionDetails.serverUrl,
          props.connectionDetails.participantToken,
          connectOptions,
        )
        .catch((error) => {
          handleError(error);
        });
      // Audio only means the camera never starts, rather than starting and
      // being switched off a moment later.
      if (props.userChoices.videoEnabled && joinMode !== 'audio-only') {
        room.localParticipant.setCameraEnabled(true).catch((error) => {
          handleError(error);
        });
      }
      if (props.userChoices.audioEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch((error) => {
          handleError(error);
        });
      }
    }
    return () => {
      room.off(RoomEvent.Disconnected, handleOnLeave);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
      room.off(RoomEvent.MediaDevicesError, handleError);
    };
  }, [e2eeSetupComplete, room, props.connectionDetails, props.userChoices]);

  const { features, diagnostics } = useFeatures();
  const lowPowerMode = useLowCPUOptimizer(room);

  const router = useRouter();
  const handleOnLeave = React.useCallback(() => router.push('/'), [router]);
  const handleError = React.useCallback((error: Error) => {
    console.error(error);
    alert(`Encountered an unexpected error, check the console logs for details: ${error.message}`);
  }, []);
  const handleEncryptionError = React.useCallback((error: Error) => {
    console.error(error);
    alert(
      `Encountered an unexpected encryption error, check the console logs for details: ${error.message}`,
    );
  }, []);

  React.useEffect(() => {
    if (lowPowerMode) {
      console.warn('Low power mode enabled');
    }
  }, [lowPowerMode]);

  return (
    <div className="lk-room-container">
      <RoomContext.Provider value={room}>
        {/* Every floating panel shares one open slot, so none can cover another. */}
        <PanelProvider>
          <KeyboardShortcuts />
          <VideoConference
            chatMessageFormatter={formatChatMessageLinks}
            SettingsComponent={SHOW_SETTINGS_MENU ? SettingsMenu : undefined}
          />
          {features.captions && (
            <Captions participantToken={props.connectionDetails.participantToken} />
          )}
          {features.dataSaver && <DataSaver state={props.dataMode} />}
          {features.networkIndicator && <ConnectionNotice />}
          {features.annotation && <AnnotationLayer />}
          {/* Not mounted otherwise: it raises the client log level, exposes the
              room on `window`, and re-renders every second for every participant. */}
          {diagnostics.connectionStats && <DebugMode />}
          <RecordingIndicator />
        </PanelProvider>
      </RoomContext.Provider>
    </div>
  );
}
