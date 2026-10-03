/**
 * DwellDetector — detects when the user has held gaze in one place long enough
 * to "select" that location (like a hover without a mouse).
 */
export class DwellDetector {
  private anchorX: number | null = null;
  private anchorY: number | null = null;
  private anchorTime: number | null = null;
  private lastFiredX: number | null = null;
  private lastFiredY: number | null = null;
  private dwellMs: number;

  constructor(
    /** Max px radius counted as "same location" */
    private readonly radiusPx: number = 80,
    /** How long (ms) to stay in radius before firing */
    dwellMs: number = 450,
  ) {
    this.dwellMs = dwellMs;
  }

  /**
   * Feed the latest smoothed gaze point.
   * Returns the stable dwell point if the threshold is crossed, otherwise null.
   */
  update(x: number, y: number, now = performance.now()): { x: number; y: number } | null {
    if (this.anchorX === null || this.anchorY === null || this.anchorTime === null) {
      this.anchorX = x;
      this.anchorY = y;
      this.anchorTime = now;
      return null;
    }

    const dist = Math.hypot(x - this.anchorX, y - this.anchorY);
    if (dist > this.radiusPx) {
      // Moved — reset anchor
      this.anchorX = x;
      this.anchorY = y;
      this.anchorTime = now;
      return null;
    }

    const elapsed = now - this.anchorTime;
    if (elapsed >= this.dwellMs) {
      const dx = this.lastFiredX === null ? Infinity : Math.abs(x - this.lastFiredX);
      const dy = this.lastFiredY === null ? Infinity : Math.abs(y - this.lastFiredY);
      // Suppress repeated fires unless gaze moved significantly
      if (dx > this.radiusPx * 1.5 || dy > this.radiusPx * 1.5) {
        this.lastFiredX = x;
        this.lastFiredY = y;
        return { x, y };
      }
    }
    return null;
  }

  reset(): void {
    this.anchorX = null;
    this.anchorY = null;
    this.anchorTime = null;
    this.lastFiredX = null;
    this.lastFiredY = null;
  }

  setDwellMs(ms: number): void {
    this.dwellMs = Math.max(100, ms);
  }
}
