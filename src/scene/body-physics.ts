import { boatContactMaterial, moveWithCollisions } from './collision';
import { clearSegment, distance, inside, safe } from './navigation';
import type { BoatMotion, Bounds, Obstacle } from './navigation';
import type { Point } from '../config/islands';
import { lifeScale } from './shore-layout';
import { boatWorldScale } from './world-layout';

export type BodyKind = 'boat' | 'koi' | 'turtle' | 'youngTurtle' | 'frog' | 'tadpole' | 'swan';
interface Core { forward: number; y: number; radius: number; halfHeight: number }
interface Pose { x: number; y: number; z: number; pitch: number; yaw?: number; mode?: string }
export interface PondBody {
  id: string; kind: BodyKind; pose: Pose; motion: BoatMotion; cores: readonly Core[];
  canSetHeight?: (height: number) => boolean;
  canFollowArc?: (to: { x: number; y: number; z: number }, arcHeight: number) => boolean;
}
const core = (forward: number, y: number, radius: number, halfHeight: number): Core => ({ forward, y, radius, halfHeight });

/** Metres, measured against the model cores. Flexible fins, tails and limbs remain soft. */
export function bodyCores(kind: BodyKind, index = 0): Core[] {
  const scale = kind === 'boat' ? boatWorldScale : lifeScale;
  return authoredBodyCores(kind,index).map(c=>({forward:c.forward*scale,y:c.y*scale,radius:c.radius*scale,halfHeight:c.halfHeight*scale}));
}
function authoredBodyCores(kind: BodyKind, index = 0): Core[] {
  if (kind === 'swan') return [core(-.28,.10,.27,.24),core(.12,.10,.28,.24),core(.53,.34,.12,.30)];
  if (kind === 'boat') return [-.85, -.42, 0, .42, .85].map(f => core(f, -.025, .43, .11));
  if (kind === 'koi') {
    const scale = [1, .92, .88, .80, .96, .85, .91][index % 7];
    return [-.20, -.06, .08, .23].map(f => core(f * scale, 0, .08 * scale, .065 * scale));
  }
  if (kind === 'turtle' || kind === 'youngTurtle') {
    const scale = kind === 'youngTurtle' ? .53 : 1;
    return [core(0, .18, .32, .18), core(.50, .23, .15, .12)]
      .map(c => ({ forward: c.forward * scale, y: c.y * scale, radius: c.radius * scale, halfHeight: c.halfHeight * scale }));
  }
  if (kind === 'frog') return [core(0, .16, .18, .15), core(.20, .29, .12, .12)];
  const scale = .85 + index * .07;
  return [core(.025 * scale, 0, .044 * scale, .031 * scale)];
}

function scripted(body: PondBody) {
  const mode = body.pose.mode;
  return body.kind === 'frog' && (mode === 'jump' || mode === 'rest')
    || body.kind === 'youngTurtle' && (mode === 'climbBack' || mode === 'ride' || mode === 'dismount');
}
export function bodiesCanCollide(a: PondBody, b: PondBody) {
  if (a === b) return false;
  const young = a.kind === 'youngTurtle' ? a : b.kind === 'youngTurtle' ? b : undefined;
  const adult = a.kind === 'turtle' ? a : b.kind === 'turtle' ? b : undefined;
  // The complete supported approach is intentional contact, not just the final riding pose.
  const mode = young?.pose.mode;
  return !(adult?.pose.mode === 'bask' && (mode === 'climb' || mode === 'climbBack' || mode === 'ride' || mode === 'dismount'));
}

interface BodyFrame { x: number; z: number; yawSin: number; yawCos: number; pitchSin: number; pitchCos: number }

function measureBody(body: PondBody, supported = scripted(body)): BodyFrame {
  const yaw = supported && body.pose.yaw !== undefined ? -body.pose.yaw : body.motion.angle;
  return {
    x: supported ? body.pose.x : body.motion.position.x / 100,
    z: supported ? body.pose.z : body.motion.position.y / 100,
    yawSin: Math.sin(yaw), yawCos: Math.cos(yaw),
    pitchSin: Math.sin(body.pose.pitch), pitchCos: Math.cos(body.pose.pitch),
  };
}

function placeCore(frame: BodyFrame, core: Core, height: number, x = frame.x, z = frame.z) {
  const forward = core.forward * frame.pitchCos - core.y * frame.pitchSin;
  const dx = frame.yawSin * forward, dz = -frame.yawCos * forward;
  return { x: x + dx, z: z + dz, y: height + core.y * frame.pitchCos + core.forward * frame.pitchSin, dx, dz };
}

function horizontalReach(body: PondBody) {
  return body.cores.reduce((reach, c) => Math.max(reach, Math.hypot(c.forward, c.y) + c.radius), 0);
}

/** Sequential swept contacts before state machines commit their poses or landing transitions. */
export class PondBodyPhysics {
  contacts = 0;
  private readonly reaches = new Map<PondBody, number>();
  constructor(readonly bodies: readonly PondBody[]) {
    for (const body of bodies) {
      this.reaches.set(body, horizontalReach(body));
      body.motion.constrainMotion = (before, dt, obstacles, bounds) => this.constrain(body, before, dt, obstacles, bounds);
      body.canSetHeight = height => this.canSetHeight(body, height);
      body.canFollowArc = (to, height) => this.canFollowArc(body, to, height);
    }
  }
  dispose() { for (const body of this.bodies) { body.motion.constrainMotion = undefined; body.canSetHeight = undefined; body.canFollowArc = undefined; } }

  private reach(body: PondBody) { return this.reaches.get(body) ?? horizontalReach(body); }

  canFollowArc(body: PondBody, to: { x: number; y: number; z: number }, arcHeight: number) {
    const from = body.pose, frame = measureBody(body);
    const ownReach = this.reach(body);
    const minX = Math.min(from.x, to.x), maxX = Math.max(from.x, to.x);
    const minZ = Math.min(from.z, to.z), maxZ = Math.max(from.z, to.z);
    // A scripted action owns its support trajectory, but must reserve a clear path before takeoff.
    const steps = Math.max(24, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .025));
    const arc = body.cores.map(core => {
      return Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        return placeCore(frame, core, from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * arcHeight,
          from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t);
      });
    });
    for (const other of this.bodies) if (bodiesCanCollide(body, other)) {
      const targetFrame = measureBody(other);
      const reach = ownReach + this.reach(other);
      if (targetFrame.x < minX - reach || targetFrame.x > maxX + reach || targetFrame.z < minZ - reach || targetFrame.z > maxZ + reach) continue;
      for (const b of other.cores) for (let i = 0; i < body.cores.length; i++) {
        const target = placeCore(targetFrame, b, other.pose.y), a = body.cores[i];
        const r = a.radius + b.radius, h = a.halfHeight + b.halfHeight;
        let previous = Infinity;
        const samples = arc[i];
        for (let j = 0; j < samples.length; j++) {
          const point = samples[j];
          const score = ((point.x - target.x) ** 2 + (point.z - target.z) ** 2) / (r * r) + ((point.y - target.y) / h) ** 2;
          if (j > 0 && score < 1 && score < previous - 1e-8) return false;
          previous = score;
        }
      }
    }
    return true;
  }

  canSetHeight(body: PondBody, height: number) {
    if (height === body.pose.y) return true;
    const frame = measureBody(body);
    const ownReach = this.reach(body);
    const cores = body.cores.map(core => ({ core, current: placeCore(frame, core, body.pose.y), next: placeCore(frame, core, height).y }));
    for (const other of this.bodies) if (bodiesCanCollide(body, other)) {
      const targetFrame = measureBody(other);
      const reach = ownReach + this.reach(other);
      if ((frame.x - targetFrame.x) ** 2 + (frame.z - targetFrame.z) ** 2 > reach ** 2) continue;
      for (const b of other.cores) {
        const target = placeCore(targetFrame, b, other.pose.y);
        for (const { core, current, next } of cores) {
          const r = core.radius + b.radius, h = core.halfHeight + b.halfHeight;
          const horizontal = ((current.x - target.x) ** 2 + (current.z - target.z) ** 2) / (r * r);
          if (horizontal >= 1) continue;
          const future = horizontal + ((next - target.y) / h) ** 2;
          if (future < 1 && future < horizontal + ((current.y - target.y) / h) ** 2 - 1e-8) return false;
        }
      }
    }
    return true;
  }

  private constrain(body: PondBody, before: Point, dt: number, shores: Obstacle[], bounds: Bounds) {
    if (scripted(body) || dt <= 0) return;
    const dynamic: Obstacle[] = [];
    let overlapNormal: Point | undefined;
    const frame = measureBody(body, false), cores = body.cores.map(core => placeCore(frame, core, body.pose.y));
    const reach = this.reach(body) * 100 + distance(before, body.motion.position);
    for (const other of this.bodies) {
      if (!bodiesCanCollide(body, other)) continue;
      const supported = scripted(other);
      const otherPosition = supported ? { x: other.pose.x * 100, y: other.pose.z * 100 } : other.motion.position;
      if ((before.x - otherPosition.x) ** 2 + (before.y - otherPosition.y) ** 2 > (reach + this.reach(other) * 100) ** 2) continue;
      const targetFrame = measureBody(other, supported);
      const targets = other.cores.map(core => placeCore(targetFrame, core, other.pose.y));
      for (let i = 0; i < body.cores.length; i++) for (let j = 0; j < other.cores.length; j++) {
        const a = body.cores[i], b = other.cores[j], own = cores[i], target = targets[j];
        const vertical = (own.y - target.y) / (a.halfHeight + b.halfHeight);
        if (Math.abs(vertical) >= 1) continue;
        const radius = (a.radius + b.radius) * Math.sqrt(1 - vertical * vertical) * 100;
        if (radius < .01) continue;
        const obstacle = { x: (target.x - own.dx) * 100, y: (target.z - own.dz) * 100, rx: radius, ry: radius };
        if (inside(before, obstacle, .001)) {
          // Overlapping spawns or turns can separate before following their routes.
          if (distance(body.motion.position, obstacle) <= distance(before, obstacle) + 1e-7) {
            const dx = before.x - obstacle.x, dy = before.y - obstacle.y, length = Math.hypot(dx, dy);
            overlapNormal = length > 1e-6 ? { x: dx / length, y: dy / length } : { x: body.id < other.id ? -1 : 1, y: 0 };
          }
        } else dynamic.push(obstacle);
      }
    }
    if (!dynamic.length && !overlapNormal) return;
    const motion = body.motion;
    const velocity = { x: (motion.position.x - before.x) / dt, y: (motion.position.y - before.y) / dt };
    const result = moveWithCollisions(before, velocity, dt, [...shores, ...dynamic], bounds,
      body.kind === 'boat' ? boatContactMaterial : { restitution: 0, friction: .1 });
    const normal = overlapNormal ?? result.contacts[0]?.normal;
    if (!normal) return;
    this.contacts++;
    motion.position = overlapNormal ? before : result.position;
    motion.velocity = overlapNormal ? { x: 0, y: 0 } : result.velocity;
    motion.blockDrift(normal);
    // Keep this detour independent of AI routes, which paired fish and followers replace each frame.
    const goal = motion.route[motion.route.length - 1];
    const tangent = { x: -normal.y, y: normal.x };
    const sign = goal && (goal.x - before.x) * tangent.x + (goal.y - before.y) * tangent.y < 0 ? -1 : 1;
    const detourReach = body.kind === 'tadpole' ? 25 : body.kind === 'boat' ? 150 : 85;
    for (const side of [sign, -sign, 0]) {
      const detour = { x: before.x + (normal.x * .8 + tangent.x * side) * detourReach, y: before.y + (normal.y * .8 + tangent.y * side) * detourReach };
      if (safe(detour, shores, bounds) && clearSegment(before, detour, shores, bounds)) { motion.avoid(detour); break; }
    }
  }
}
