import * as React from 'react';
import { requireAdmin } from '@/lib/admin/auth';
import { readConfig } from '@/lib/config/store';
import styles from '../../styles/Admin.module.css';
import { SettingsForm } from './SettingsForm';

export const metadata = {
  title: 'Administration',
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  // Redirects to the sign-in page when there is no valid session.
  const admin = await requireAdmin();
  const config = await readConfig();

  return (
    <main data-lk-theme="default" className={styles.shell}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <h1 className={styles.title}>Administration</h1>
          <span className={styles.who}>Signed in as {admin.username}</span>
        </header>
        <p className={styles.lede}>
          These settings decide what participants see in a meeting. Changes take effect for meetings
          joined from now on.
        </p>
        <SettingsForm initial={config} />
      </div>
    </main>
  );
}
