import styles from './download.module.css';

/* The install, drawn: a Mac desktop where the disk image downloads, its window opens, the app slides
   into Applications, and Novi appears in the menu bar. Pure CSS motion on a ten second loop; the
   reduced-motion page shows the finished desk. Everything is geometry in the page's own colours. */
export default function InstallScene() {
  return (
    <div className={styles.scene} aria-label="Animation: the Novi disk image downloads, the app is dragged into Applications, and Novi appears in the menu bar" role="img">
      <div className={styles.menuBar}>
        <span className={styles.menuApple} aria-hidden="true" />
        <span className={styles.menuApp}>Finder</span>
        <span>File</span><span>Edit</span><span>View</span><span>Go</span>
        <span className={styles.menuRight}>
          <span className={styles.menuNovi} aria-hidden="true"><img src="/logo.svg" alt="" width={16} height={16} /></span>
          <span>12:04</span>
        </span>
      </div>
      <div className={styles.desk}>
        {/* 1 · the download */}
        <div className={styles.download}>
          <div className={styles.downloadHead}><span className={styles.dmgIcon} aria-hidden="true" /><span><strong>Novi-0.2.2-arm64.dmg</strong><small>80.1 MB · <b className={styles.downloadSpeed} /></small></span></div>
          <div className={styles.downloadBar}><i /></div>
        </div>
        {/* 2 · the disk image window */}
        <div className={styles.finder}>
          <div className={styles.finderBar}><span className={styles.lights} aria-hidden="true"><i /><i /><i /></span><span>Novi</span></div>
          <div className={styles.finderBody}>
            <div className={styles.appIcon}><img src="/logo.svg" alt="" width={44} height={44} /><span>Novi</span></div>
            <span className={styles.dragArrow} aria-hidden="true" />
            <div className={styles.folder}><i aria-hidden="true" /><span>Applications</span></div>
            <div className={`${styles.appIcon} ${styles.appIconMoving}`} aria-hidden="true"><img src="/logo.svg" alt="" width={44} height={44} /></div>
          </div>
        </div>
        {/* 3 · installed */}
        <div className={styles.installed}><span className={styles.tick} aria-hidden="true" /><span>Installed. Novi is in your menu bar.</span></div>
        <div className={styles.dock} aria-hidden="true"><i /><i /><i /><i /><i /><i className={styles.dockNovi}><img src="/logo.svg" alt="" width={28} height={28} /></i></div>
      </div>
    </div>
  );
}
