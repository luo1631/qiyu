import { CatmullRomCurve3, MathUtils, Vector2, Vector3 } from 'three';
import { dogSite, islandPoint, visitorSite } from './terrain';

export type Activity = 'walk' | 'watch' | 'sniff' | 'rest' | 'swim';

export interface HabitatPose {
  x: number; z: number; yaw: number; pace: number; stride: number; activity: Activity; hold: number;
}

type Pause = { at: Vector2; seconds: number; yaw: number; activity: 'watch' | 'sniff' | 'rest' };
type Walk = { points: readonly Vector2[]; seconds: number; activity: 'walk' | 'swim' };
type Cue = Pause | Walk;

function heading(point: Vector3) {
  return Math.atan2(point.x, point.z);
}

function turnBetween(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

export function makeCircuit(cues: readonly Cue[]) {
  let period = 0, totalDistance = 0;
  const legs = cues.map(cue => {
    const path = 'points' in cue ? new CatmullRomCurve3(cue.points.map(p => new Vector3(p.x, 0, p.y))) : null;
    const length = path?.getLength() ?? 0;
    const yaw = 'yaw' in cue ? cue.yaw : heading(path!.getTangentAt(1));
    const start = period, stride = totalDistance;
    totalDistance += length;
    period += cue.seconds;
    return { cue, path, yaw, start, stride, end: period, length };
  });
  const point = new Vector3(), tangent = new Vector3();
  return {
    period,
    sample(time: number, pose: HabitatPose) {
      const elapsed = MathUtils.euclideanModulo(time, period);
      const index = legs.findIndex(leg => elapsed < leg.end);
      const leg = legs[index], cue = leg.cue;
      const previous = legs[(index + legs.length - 1) % legs.length];
      const since = elapsed - leg.start;
      const turning = MathUtils.smoothstep(since, 0, .78);
      pose.activity = cue.activity;
      pose.hold = MathUtils.smoothstep(since, 0, .56) * MathUtils.smoothstep(cue.seconds - since, 0, .49);
      if (!leg.path && 'at' in cue) {
        pose.x = cue.at.x;
        pose.z = cue.at.y;
        pose.yaw = turnBetween(previous.yaw, cue.yaw, turning);
        pose.pace = 0;
        pose.stride = leg.stride;
      } else if (leg.path) {
        // Accelerate gently at departure and brake at the next stop.
        const t = since / cue.seconds;
        const ramp = Math.min(.21, .87 / cue.seconds);
        const travelled = t < ramp ? t * t / (2 * ramp) : t > 1 - ramp
          ? 1 - ramp - (1 - t) ** 2 / (2 * ramp) : t - ramp / 2;
        const progress = MathUtils.clamp(travelled / (1 - ramp), 0, 1);
        leg.path.getPointAt(progress, point);
        leg.path.getTangentAt(progress, tangent);
        pose.x = point.x;
        pose.z = point.z;
        pose.yaw = turnBetween(previous.yaw, heading(tangent), turning);
        pose.pace = Math.min(1, t / ramp, (1 - t) / ramp);
        pose.stride = leg.stride + leg.length * progress;
      }
    },
  };
}

export const emptyPose = (): HabitatPose => ({ x: 0, z: 0, yaw: 0, pace: 0, stride: 0, activity: 'rest', hold: 0 });

const visitorPath = [visitorSite, islandPoint(1.72, 3.22), islandPoint(1.98, 2.91),
  islandPoint(2.12, 2.59), islandPoint(2.07, 2.35)];
const visitorView = visitorPath[visitorPath.length - 1];

export const visitorCircuit = makeCircuit([
  { at: visitorSite, seconds: 2.6, yaw: -1.1, activity: 'watch' },
  { points: visitorPath, seconds: 5.3, activity: 'walk' },
  { at: visitorView, seconds: 8.1, yaw: -1.37, activity: 'watch' },
  { points: visitorPath.slice().reverse(), seconds: 5.4, activity: 'walk' },
  { at: visitorSite, seconds: 6.6, yaw: -1.1, activity: 'rest' },
]);

const dogLook = islandPoint(1.60, 2.90);
const dogGrass = islandPoint(1.08, 3.42);
const dogFollow = [dogSite, islandPoint(1.19, 3.34), islandPoint(1.41, 3.18), dogLook];

export const dogCircuit = makeCircuit([
  { at: dogSite, seconds: 3.2, yaw: 1.34, activity: 'watch' },
  { points: dogFollow, seconds: 5.1, activity: 'walk' },
  { at: dogLook, seconds: 3.0, yaw: .93, activity: 'watch' },
  { points: [dogLook, islandPoint(1.43, 3.16), dogGrass], seconds: 2.2, activity: 'walk' },
  { at: dogGrass, seconds: 4.3, yaw: -1.95, activity: 'sniff' },
  { points: [dogGrass, islandPoint(.94, 3.62), dogSite], seconds: 5.4, activity: 'walk' },
  { at: dogSite, seconds: 4.8, yaw: 1.34, activity: 'rest' },
]);

const catHome = islandPoint(3.26, .63);
const catPath = [catHome, islandPoint(2.95, .75), islandPoint(2.52, .77), islandPoint(2.07, .88), islandPoint(1.72, 1.03)];
const catLook = catPath[catPath.length - 1];

export const catCircuit = makeCircuit([
  { at: catHome, seconds: 6.2, yaw: -.51, activity: 'rest' },
  { points: catPath, seconds: 7.0, activity: 'walk' },
  { at: catLook, seconds: 9.8, yaw: -1.55, activity: 'watch' },
  { points: catPath.slice().reverse(), seconds: 7.6, activity: 'walk' },
  { at: catHome, seconds: 7.3, yaw: -.52, activity: 'rest' },
]);

const swanHome = islandPoint(-3.72, .49);
const swanTurn = islandPoint(-3.05, -.61);

export const swanCircuit = makeCircuit([
  { at: swanHome, seconds: 2.4, yaw: -2.3, activity: 'rest' },
  { points: [swanHome, islandPoint(-4.22, .08), islandPoint(-4.03, -.48), swanTurn], seconds: 10.4, activity: 'swim' },
  { at: swanTurn, seconds: 3.0, yaw: 1.82, activity: 'rest' },
  { points: [swanTurn, islandPoint(-2.77, -.08), islandPoint(-3.08, .49), swanHome], seconds: 10.2, activity: 'swim' },
]);
