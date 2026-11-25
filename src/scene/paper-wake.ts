import { islandRadius } from './habitat-layout';
import { boatWorldScale, islandScale, worldIslands } from './world-layout';
import { outerShoreDistance } from './shore-layout';

// CSS pixels; the SVG tail is (16.3, 26.5), relative to its (3, 3) hotspot.
export const paperTailOffset = { x: 13.3, y: 23.5 };
export { PaperSkimGesture, paperSkimSettings } from '../components/paper-skim';

export const paperWakeCapacity = 96, paperWakeLifetime = 1.4;
export const paperWakeInterval = 1 / 60;
export interface PaperWakeRipple { x: number; z: number; born: number; strength: number; headingX: number; headingZ: number; stroke: number }

/** Timestamped contacts drive one shared water field; stroke boundaries never bridge islands. */
export class PaperWakeField {
  readonly events: PaperWakeRipple[] = Array.from({ length: paperWakeCapacity }, () => ({ x: 0, z: 0, born: -100, strength: 0, headingX: 0, headingZ: 0, stroke: 0 }));
  emitted = 0;
  private cursor = 0;
  private last: { x: number; z: number; time: number } | null = null;
  private nextAt = 0;
  private stroke = 0;
  stop() { this.last = null; }
  trace(x: number, z: number, time: number, pixelsPerSecond: number) {
    const previous = this.last;
    if (!previous || time - previous.time > .22) {
      this.stroke++;
      this.emit(x, z, time, pixelsPerSecond);
      this.nextAt = time + paperWakeInterval;
    } else if (time > previous.time) {
      const dx = x - previous.x, dz = z - previous.z, distance = Math.hypot(dx, dz);
      // Resample successive raw positions, not the chord from the last emitted ripple.
      // Keep each contact's actual time so a slow frame cannot delay its expansion.
      if (distance < .0001) this.nextAt = time + paperWakeInterval;
      while (this.nextAt <= time + 1e-8) {
        const t = Math.min(1, (this.nextAt - previous.time) / (time - previous.time));
        this.emit(previous.x + dx * t, previous.z + dz * t, this.nextAt, pixelsPerSecond, dx / distance, dz / distance);
        this.nextAt += paperWakeInterval;
      }
    }
    this.last = { x, z, time };
  }
  private emit(x: number, z: number, time: number, pixelsPerSecond: number, headingX = 0, headingZ = 0) {
    // Wave energy scales with amplitude squared; denser contacts need lighter impulses.
    Object.assign(this.events[this.cursor], { x, z, born: time, headingX, headingZ, stroke: this.stroke, strength: Math.min(.55, .22 + pixelsPerSecond / 1800) * Math.sqrt(paperWakeInterval / .09) });
    this.cursor = (this.cursor + 1) % paperWakeCapacity;
    this.emitted++;
  }
  active(time: number) { return this.events.filter(event => event.strength > 0 && time >= event.born && time - event.born < paperWakeLifetime); }
}

function nearIsland(x: number, z: number) {
  return islandRadius(x, z) < 1.18 || worldIslands.some(island =>
    Math.hypot((x - island.x) / (island.rx * islandScale), (z - island.z) / (island.rz * islandScale)) < 1.12);
}

/** With live geometry the wet boundary follows the same triangles as the wave mask. */
export function isOpenPondWater(x: number, z: number, boatX: number, boatZ: number,
  hullClearance = 1.3 * boatWorldScale, islandLandAt = nearIsland) {
  return outerShoreDistance(x,z) < -.08 && Math.hypot(x - boatX, z - boatZ) >= hullClearance && !islandLandAt(x, z);
}
