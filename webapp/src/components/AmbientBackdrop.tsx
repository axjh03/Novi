import styles from './AmbientBackdrop.module.css';

export default function AmbientBackdrop() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="none" focusable="false">
        <defs>
          <radialGradient id="novi-ambient-glow"><stop stopColor="#812944" stopOpacity=".2" /><stop offset="1" stopColor="#812944" stopOpacity="0" /></radialGradient>
          <linearGradient id="novi-ambient-line" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d08da4" stopOpacity="0" /><stop offset=".48" stopColor="#b76a87" stopOpacity=".38" /><stop offset="1" stopColor="#d08da4" stopOpacity="0" /></linearGradient>
        </defs>
        <ellipse className={styles.glow} cx="1340" cy="210" rx="510" ry="500" fill="url(#novi-ambient-glow)" />
        <g className={styles.contours} fill="none" stroke="url(#novi-ambient-line)" strokeWidth=".7">
          <path d="M950-100C1460 0 1010 210 1260 400S1810 480 1580 830" />
          <path d="M1010-100C1520 0 1070 210 1320 400S1870 480 1640 830" />
          <path d="M1070-100C1580 0 1130 210 1380 400S1930 480 1700 830" />
          <path d="M-180 190C250 200-70 560 170 690S460 910 130 1100" />
          <path d="M-220 230C210 240-110 600 130 730S420 950 90 1140" />
        </g>
        <g fill="none" stroke="#c47c97" strokeWidth="1" className={styles.signals}>
          <path d="M950-100C1460 0 1010 210 1260 400S1810 480 1580 830" />
          <path d="M-180 190C250 200-70 560 170 690S460 910 130 1100" />
        </g>
        <g className={styles.nodes} fill="#d29bb0"><circle cx="1215" cy="285" r="2" /><circle cx="1430" cy="490" r="1.5" /><circle cx="110" cy="440" r="2" /><circle cx="210" cy="760" r="1.5" /></g>
      </svg>
    </div>
  );
}
