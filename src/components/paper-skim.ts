export const paperSkimSettings = {
  startDistance: 420, distanceStep: 2, idleMs: 220,
} as const;

/** Continuous pointer travel starts a skim; speed only controls wave strength. */
export class PaperSkimGesture {
  active = false;
  distance = 0;
  speed = 0;
  private previous: { x: number; y: number; at: number } | null = null;
  private distancePoint: { x: number; y: number } | null = null;

  reset() {
    this.active = false; this.distance = 0; this.speed = 0;
    this.previous = null; this.distancePoint = null;
  }
  tick(now: number) {
    if (this.previous && now - this.previous.at >= paperSkimSettings.idleMs) this.reset();
    return this.active;
  }
  move(x: number, y: number, at: number): boolean {
    const previous = this.previous;
    if (!previous) {
      this.previous = { x, y, at }; this.distancePoint = this.previous;
      return false;
    }
    const dt = at - previous.at, length = Math.hypot(x - previous.x, y - previous.y);
    if (dt < 0) return this.active;
    if (dt >= paperSkimSettings.idleMs) {
      this.reset(); return this.move(x, y, at);
    }
    if (length === 0) return this.active;
    if (dt > 0) {
      const instantaneous = length / dt * 1000;
      this.speed += (instantaneous - this.speed) * (1 - Math.exp(-dt / 80));
    }
    this.previous = { x, y, at };
    if (!this.active && this.distancePoint) {
      // Compare to the last counted point so fine motion can build up without counting pointer jitter.
      const travel = Math.hypot(x - this.distancePoint.x, y - this.distancePoint.y);
      if (travel >= paperSkimSettings.distanceStep) {
        this.distance += travel;
        this.distancePoint = this.previous;
        this.active = this.distance >= paperSkimSettings.startDistance;
      }
    }
    return this.active;
  }
}
