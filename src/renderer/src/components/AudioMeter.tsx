export function AudioMeter({ level }: { level: number }) {
  return <span className="audio-meter" role="meter" aria-label="Input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
    {[0.5, 0.8, 1, 0.7, 0.45].map((scale, index) =>
      <span key={index} aria-hidden="true" style={{ height: `${3 + Math.round(level * scale * 0.19)}px` }} />)}
  </span>;
}
