'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../styles/Admin.module.css';
import type { AppConfig, DebugConfig, FeatureConfig } from '@/lib/config/types';

type Row<K> = {
  key: K;
  label: string;
  hint: string;
};

const FEATURE_ROWS: Row<keyof FeatureConfig>[] = [
  {
    key: 'annotation',
    label: 'Annotation',
    hint: 'Lets participants draw on shared screens and camera tiles.',
  },
  {
    key: 'airwrite',
    label: 'AirWrite',
    hint: 'Experimental. Draw with your hand in front of the camera. Needs a capable device, and is not required for a meeting to work.',
  },
  {
    key: 'dataSaver',
    label: 'Data Saver',
    hint: 'Lets participants choose Low data or Audio only, and steps video down automatically when a connection cannot keep up.',
  },
  {
    key: 'networkIndicator',
    label: 'Connection warnings',
    hint: 'Shows a short message when a participant’s connection is weak or dropping. Hidden while the connection is fine.',
  },
];

const DEBUG_ROWS: Row<keyof DebugConfig>[] = [
  {
    key: 'enabled',
    label: 'Debug mode',
    hint: 'Master switch for the technical readouts below.',
  },
  {
    key: 'showConnectionStats',
    label: 'Connection statistics',
    hint: 'Show live connection quality figures.',
  },
  {
    key: 'showAirWriteDiagnostics',
    label: 'AirWrite diagnostics',
    hint: 'Show the model picker, recognition confidence, and frame timings next to the AirWrite button.',
  },
];

export function SettingsForm({ initial }: { initial: AppConfig }) {
  const router = useRouter();
  const [config, setConfig] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const dirty = JSON.stringify(config) !== JSON.stringify(saved);

  const setFeature = (key: keyof FeatureConfig, value: boolean) =>
    setConfig((current) => ({ ...current, features: { ...current.features, [key]: value } }));

  const setDebug = (key: keyof DebugConfig, value: boolean) =>
    setConfig((current) => ({ ...current, debug: { ...current.debug, [key]: value } }));

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? 'Could not save.');
        return;
      }
      // Trust what the server stored, not what was sent: it may have dropped
      // a value the application would not accept.
      const stored: AppConfig = await response.json();
      setConfig(stored);
      setSaved(stored);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  };

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Meeting features</h2>
        {FEATURE_ROWS.map((row) => (
          <div className={styles.row} key={row.key}>
            <span className={styles.rowText}>
              <label className={styles.rowLabel} htmlFor={`feature-${row.key}`}>
                {row.label}
              </label>
              <span className={styles.rowHint}>{row.hint}</span>
            </span>
            <input
              id={`feature-${row.key}`}
              className={styles.toggle}
              type="checkbox"
              checked={config.features[row.key]}
              onChange={(event) => setFeature(row.key, event.target.checked)}
              disabled={busy}
            />
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Diagnostics</h2>
        {DEBUG_ROWS.map((row) => {
          // The individual flags do nothing while the master switch is off, so
          // they are disabled rather than left looking effective.
          const gated = row.key !== 'enabled' && !config.debug.enabled;
          return (
            <div className={styles.row} key={row.key}>
              <span className={styles.rowText}>
                <label className={styles.rowLabel} htmlFor={`debug-${row.key}`}>
                  {row.label}
                </label>
                <span className={styles.rowHint}>{row.hint}</span>
              </span>
              <input
                id={`debug-${row.key}`}
                className={styles.toggle}
                type="checkbox"
                checked={config.debug[row.key]}
                onChange={(event) => setDebug(row.key, event.target.checked)}
                disabled={busy || gated}
              />
            </div>
          );
        })}
      </section>

      <div className={styles.actions}>
        <button className="lk-button" onClick={handleSave} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button className="lk-button" onClick={handleSignOut} disabled={busy}>
          Sign out
        </button>
        {error ? (
          <span className={styles.error} role="alert">
            {error}
          </span>
        ) : (
          <span className={styles.status}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        )}
      </div>
    </>
  );
}
