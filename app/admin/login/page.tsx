import * as React from 'react';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/admin/session';
import styles from '../../../styles/Admin.module.css';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: 'Administrator sign-in',
};

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  // Already signed in: no reason to show the form again.
  if (await readSession()) redirect('/admin');

  return (
    <main data-lk-theme="default" className={styles.loginShell}>
      <div className={styles.loginCard}>
        <h1 className={styles.title}>Administrator sign-in</h1>
        <p className={styles.lede}>This area controls what meeting participants can use.</p>
        <LoginForm />
      </div>
    </main>
  );
}
