import styles from './WorkspaceLoading.module.css';

export default function WorkspaceLoading() {
  return <div className={styles.loading} role="status" aria-live="polite" aria-label="Preparing your workspace">
    <div className={styles.mark} aria-hidden="true"><img src="/logo.svg" alt="" width={35} height={35} /><span /></div>
    <p>Preparing your workspace<span aria-hidden="true">…</span></p>
  </div>;
}
