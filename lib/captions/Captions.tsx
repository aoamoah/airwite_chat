'use client';

import * as React from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import styles from '../../styles/Captions.module.css';
import { DragHandle } from '../ui/DragHandle';
import { usePanel } from '../ui/PanelStack';
import { useDraggable } from '../ui/useDraggable';
import { CaptionOverlay } from './CaptionOverlay';
import { transcribe, TranscriptionError } from './transcribe';
import { CAPTION_LANGUAGE_LABELS, type CaptionLanguage } from './types';
import { useCaptions } from './useCaptions';
import { useUtteranceCapture, type Utterance } from './useUtteranceCapture';
import { encodeWav } from './wav';

const LANGUAGES: CaptionLanguage[] = ['twi', 'eng'];

/**
 * How many utterances may be in flight at once.
 *
 * On a slow connection requests would otherwise queue up behind each other, and
 * captions would arrive further and further behind the speaker while still
 * costing a call each. Dropping the newest is better than showing text from a
 * minute ago.
 */
const MAX_IN_FLIGHT = 3;

/**
 * The first call of a session took several seconds against a service that then
 * settled to about one. Sending a scrap of silence when captions are switched
 * on pays that cost while nobody is waiting, so the first real sentence is not
 * the slow one.
 */
async function warmUp(participantToken: string, language: CaptionLanguage): Promise<void> {
  try {
    await transcribe(encodeWav(new Float32Array(4_800)), language, participantToken);
  } catch {
    // Nothing depends on this; a real utterance will report any real problem.
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Live captions for the meeting.
 *
 * Captions from other people are always shown; transcribing *your own* voice is
 * a separate choice, because it sends your audio to an outside service.
 */
export function Captions({ participantToken }: { participantToken: string }) {
  const room = useRoomContext();
  const { microphoneTrack } = useLocalParticipant();
  const { visible, publish } = useCaptions(room);

  const [enabled, setEnabled] = React.useState(false);
  const [language, setLanguage] = React.useState<CaptionLanguage>('twi');
  const [error, setError] = React.useState<string | null>(null);
  const [uploaded, setUploaded] = React.useState(0);

  const panel = usePanel('captions');
  const drag = useDraggable('yehyia:captions');

  const inFlight = React.useRef(0);

  const micTrack = microphoneTrack?.track?.mediaStreamTrack;
  const micMuted = microphoneTrack?.isMuted ?? true;
  // No point listening to a muted microphone, and doing so would spend data on
  // silence.
  const listening = enabled && !micMuted;

  /**
   * Whether the compressed recording is worth sending.
   *
   * Opus is roughly an eighth the size of WAV, which matters both for data
   * cost and for how long the upload takes before transcription can start. The
   * service documents Ogg but not WebM, so the first rejection settles it for
   * the session and every later utterance goes straight to WAV.
   */
  const compressedAccepted = React.useRef(true);

  const handleUtterance = React.useCallback(
    async (utterance: Utterance) => {
      if (inFlight.current >= MAX_IN_FLIGHT) return;
      inFlight.current++;

      const useCompressed = utterance.fallback !== undefined && compressedAccepted.current;
      const first = useCompressed ? utterance.audio : (utterance.fallback ?? utterance.audio);

      const send = async (clip: Blob) => {
        setUploaded((total) => total + clip.size);
        return transcribe(clip, language, participantToken);
      };

      try {
        let text: string;
        try {
          text = await send(first);
        } catch (cause) {
          // A refused format is worth one retry with the uncompressed copy; a
          // network or server problem is not, since WAV would fail the same way.
          const refused = cause instanceof TranscriptionError && !cause.retryable && useCompressed;
          if (!refused || !utterance.fallback) throw cause;
          console.warn('[captions] compressed audio refused, falling back to WAV');
          compressedAccepted.current = false;
          text = await send(utterance.fallback);
        }

        if (text) {
          publish(text, language);
          setError(null);
        }
      } catch (cause) {
        const message =
          cause instanceof TranscriptionError ? cause.message : 'Captions stopped working.';
        setError(message);
        console.error('[captions] transcription failed', cause);
      } finally {
        inFlight.current--;
      }
    },
    [language, participantToken, publish],
  );

  const capture = useUtteranceCapture(micTrack, listening, handleUtterance);

  // Turning captions on claims the single open panel slot; losing it should not
  // silently keep sending audio, so it stops transcribing too.
  const { isOpen, open, close } = panel;
  React.useEffect(() => {
    if (!isOpen && enabled) setEnabled(false);
  }, [isOpen, enabled]);

  const setRunning = (next: boolean) => {
    setEnabled(next);
    setError(null);
    if (next) {
      open();
      void warmUp(participantToken, language);
    } else {
      close();
    }
  };

  return (
    <>
      <CaptionOverlay captions={visible} />

      <div className={styles.control} ref={drag.ref} style={drag.style} data-lk-theme="default">
        <div className={styles.row}>
          <DragHandle drag={drag} label="the captions panel" />
          <button
            className="lk-button"
            onClick={() => setRunning(!enabled)}
            aria-pressed={enabled}
            data-lk-active={enabled}
            title="Have your speech written out for the meeting"
          >
            Captions
          </button>
          {listening && (
            <span
              className={styles.listening}
              data-lk-speaking={capture.speaking}
              aria-hidden="true"
            />
          )}
        </div>

        {enabled && (
          <>
            <div className={styles.languages} role="group" aria-label="Caption language">
              {LANGUAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.language}
                  aria-pressed={language === option}
                  onClick={() => setLanguage(option)}
                >
                  {CAPTION_LANGUAGE_LABELS[option]}
                </button>
              ))}
            </div>

            <span className={styles.note}>
              Your speech is sent to an outside service to be written out.
              {uploaded > 0 && ` ${formatBytes(uploaded)} used so far.`}
            </span>

            {micMuted && (
              <span className={styles.warning}>
                Your microphone is off, so there is nothing to caption.
              </span>
            )}
            {capture.error && <span className={styles.error}>{capture.error}</span>}
            {error && <span className={styles.error}>{error}</span>}
          </>
        )}
      </div>
    </>
  );
}
