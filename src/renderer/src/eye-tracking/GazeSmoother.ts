/**
 * GazeSmoother: exponential moving average filter for raw gaze coordinates.
 * High alpha = more responsive but jittery.
 * Low alpha = smoother but lags behind fast eye movements.
 */
export class GazeSmoother {
  private sx: number | null = null;
  private sy: number | null = null;

  constructor(private alpha: number = 0.12) {}

  update(rawX: number, rawY: number): { x: number; y: number } {
    if (this.sx === null || this.sy === null) {
      this.sx = rawX;
      this.sy = rawY;
    } else {
      this.sx = this.sx + (rawX - this.sx) * this.alpha;
      this.sy = this.sy + (rawY - this.sy) * this.alpha;
    }
    return { x: this.sx, y: this.sy };
  }

  reset(): void {
    this.sx = null;
    this.sy = null;
  }

  setAlpha(alpha: number): void {
    this.alpha = Math.max(0.01, Math.min(1, alpha));
  }
}
