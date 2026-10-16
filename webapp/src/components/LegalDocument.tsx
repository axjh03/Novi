import type { ReactNode } from 'react';
import PublicNavbar from './PublicNavbar';
import SiteFooter from './SiteFooter';
import styles from './LegalDocument.module.css';

export default function LegalDocument({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return <div className={styles.page}>
    <PublicNavbar />
    <main className={styles.main}>
      <span className={styles.eyebrow}>NOVI · LEGAL</span>
      <h1>{title}</h1>
      <p className={styles.updated}>Last updated {updated}</p>
      <div className={styles.content}>{children}</div>
    </main>
    <SiteFooter />
  </div>;
}
