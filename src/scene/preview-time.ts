/** Retargetable preview clock. Routine clock ticks must not restart a phase transition. */
export class PreviewTime {
  private from: number;
  private target: number;
  private started = 0;
  private duration = 0;

  constructor(timestamp: number) { this.from = this.target = timestamp; }

  setTarget(timestamp: number, now: number, reduced = false, animateJump = true) {
    const current = this.sample(now);
    if (!reduced && animateJump && Math.abs(timestamp - this.target) > 72000) {
      this.from = current;
      this.started = now;
      this.duration = 1400;
    } else if (reduced || !this.active(now)) {
      this.from = timestamp;
      this.duration = 0;
    }
    this.target = timestamp;
  }

  active(now: number) { return this.duration > 0 && now - this.started < this.duration; }

  sample(now: number) {
    if (!this.active(now)) return this.target;
    const t = Math.max(0, (now - this.started) / this.duration);
    return this.from + (this.target - this.from) * t * t * (3 - 2 * t);
  }
}
