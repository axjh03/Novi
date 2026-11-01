import Laptop3D from '@/components/Laptop3D';
import styles from './download.module.css';

/* The install, in 3D: the Novi package is a cube that spins down into a laptop while the download
   bar on its screen fills, then Novi shows up in the menu bar. Pure CSS on a nine second loop; the
   reduced-motion page shows the installed desk with the package resting above it. */
const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
export default function InstallScene() {
  return (
    <div className={styles.scene} role="img" aria-label="Animation: the Novi package spins down into a laptop, the download finishes, and Novi appears in the menu bar.">
      <div className={styles.drop} aria-hidden="true">
        <div className={styles.cube}>
          {faces.map(face => <div key={face} className={`${styles.cubeFace} ${styles[face]}`}>{face !== 'top' && face !== 'bottom' && <img src="/logo.svg" alt="" width={48} height={48} />}</div>)}
        </div>
      </div>
      <div className={styles.laptop}><Laptop3D rest={[-10, -9]} tilt={false}>
        <div className={styles.desktop}>
          <div className={styles.menuBar}>
            <span className={styles.menuApple} aria-hidden="true" />
            <span className={styles.menuApp}>Finder</span><span>File</span><span>Edit</span><span>View</span>
            <span className={styles.menuRight}><span className={styles.menuNovi} aria-hidden="true"><img src="/logo.svg" alt="" width={16} height={16} /></span><span>12:04</span></span>
          </div>
          <div className={styles.download}>
            <div className={styles.downloadHead}><span className={styles.dmgIcon} aria-hidden="true" /><span><strong>Novi-0.2.2-arm64.dmg</strong><small>80.1 MB · 12.4 MB/s</small></span></div>
            <div className={styles.downloadBar}><i /></div>
          </div>
          <div className={styles.installed}><img src="/logo.svg" alt="" width={44} height={44} /><strong>Installed.</strong><span>Novi is in your menu bar.</span></div>
          <div className={styles.dock} aria-hidden="true"><i /><i /><i /><i /><i className={styles.dockNovi}><img src="/logo.svg" alt="" width={20} height={20} /></i></div>
        </div>
      </Laptop3D></div>
    </div>
  );
}
