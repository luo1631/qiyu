import type { Point } from '../config/islands';
import { BoatMotion, clearSegment, distance, planRoute, safe } from './navigation';
import type { Bounds, Obstacle } from './navigation';
import { boatBayVisits, worldBounds } from './world-layout';
import { lotusObstacles } from './lotus-layout';
import { bodyCores } from './body-physics';
import type { PondBody } from './body-physics';
import { lifeScale } from './shore-layout';
import { lilyPads } from './habitat-layout';
import type { SurfaceSampler } from './PondSurface';
import { SwimDrive } from './locomotion';
import type { SwimPose } from './locomotion';

export function seededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

// Metres, seconds. The same small wind waves supply water normals and buoyancy.
export const windWaves = [
  { x: .94, z: .342, amplitude: .015, frequency: 1.8, speed: .65 },
  { x: -.45, z: .893, amplitude: .009, frequency: 2.9, speed: .91 },
] as const;
export function sampleSurface(x: number, z: number, time: number) {
  let height = 0, dx = 0, dz = 0;
  for (const w of windWaves) {
    const phase = (x * w.x + z * w.z) * w.frequency - time * w.speed;
    height += Math.sin(phase) * w.amplitude;
    const slope = Math.cos(phase) * w.amplitude * w.frequency;
    dx += slope * w.x; dz += slope * w.z;
  }
  return { height, dx, dz };
}

export class FloatSpring {
  value = 0;
  velocity = 0;
  constructor(private readonly dynamics = { inertia: 1, stiffness: 16, damping: 7 }) {}
  update(target: number, dt: number) {
    const { inertia, stiffness, damping } = this.dynamics;
    this.velocity += ((target - this.value) * stiffness - this.velocity * damping) / inertia * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

interface WanderStyle { speed: number; response: number; turnResponse: number; turnRate: number; edge: number; legSeconds: number; bays?: readonly Point[] }
const boatStyle: WanderStyle = { speed: 17, response: .85, turnResponse: 1.1, turnRate: .55, edge: 47, legSeconds: 24, bays:boatBayVisits };
const fishStyle: WanderStyle = { speed: 30, response: 2.2, turnResponse: 3, turnRate: 1.2, edge: 70, legSeconds: 14 };
const inset = (bounds: Bounds, amount: number): Bounds => ({
  left: bounds.left + amount, right: bounds.right - amount,
  top: bounds.top + amount, bottom: bounds.bottom - amount,
});

/** Independent destinations, gentle open-water arcs, and an inset shore buffer.
 * All positions remain in centimetres and use the same solver as click navigation. */
class WanderCourse {
  private random: () => number;
  private retryAt = 0;
  private changeAt = 0;
  private paceAt = 0;
  private pace = 1;
  private desiredPace = 1;
  private recent: Point[] = [];
  private stalledFor = 0;
  destinations = 0;
  constructor(seed: number, private style: WanderStyle) { this.random = seededRandom(seed); }
  resume() { this.retryAt = 0; this.changeAt = 0; this.stalledFor = 0; }
  update(motion: BoatMotion, dt: number, time: number, obstacles: Obstacle[], bounds: Bounds, activity = 1) {
    const inner = inset(bounds, this.style.edge);
    // A click can leave the boat outside the idle buffer. Return from its actual
    // position without teleporting or allowing it to travel farther outwards.
    const movementBounds = {
      left: Math.min(inner.left, motion.position.x), right: Math.max(inner.right, motion.position.x),
      top: Math.min(inner.top, motion.position.y), bottom: Math.max(inner.bottom, motion.position.y),
    };
    if (this.stalledFor > .35 && activity > .3) {
      // A new island can create a very narrow tangency where all distant paths
      // initially turn into the bank. First make a short, safe outward arc.
      for (const offset of [.42, -.42, .75, -.75, 1.1, -1.1]) {
        const angle = motion.angle + offset;
        const goal = { x: motion.position.x + Math.sin(angle) * 95, y: motion.position.y - Math.cos(angle) * 95 };
        const route = [motion.position, goal];
        if (!safe(goal, obstacles, movementBounds, 12) || !clearSegment(motion.position, goal, obstacles, movementBounds)) continue;
        if (!this.canTurnInto(motion, route, obstacles, movementBounds, activity)) continue;
        motion.setRoute(route); this.changeAt = time + 4; this.retryAt = time + 3; this.stalledFor = 0;
        break;
      }
    }
    const remaining = motion.route.reduce((sum, p, i, route) => sum + distance(i ? route[i - 1] : motion.position, p), 0);
    if (time >= this.retryAt && (remaining < 55 || time >= this.changeAt)) {
      const goals = inset(bounds, this.style.edge + 65);
      const heading = Math.hypot(motion.velocity.x, motion.velocity.y) > 1
        ? Math.atan2(motion.velocity.y, motion.velocity.x) : motion.angle - Math.PI / 2;
      const candidates: { goal: Point; score: number }[] = [];
      const bays=this.style.bays,visit=bays?.[this.destinations%bays.length];
      if(visit&&distance(motion.position,visit)>160&&safe(visit,obstacles,inner,27))candidates.push({goal:visit,score:2});
      for (let n = 0; n < 24; n++) {
        const goal = { x: goals.left + this.random() * (goals.right - goals.left), y: goals.top + this.random() * (goals.bottom - goals.top) };
        const length = distance(motion.position, goal);
        if (length < 200 || !safe(goal, obstacles, inner, 25)) continue;
        const alignment = Math.cos(Math.atan2(goal.y - motion.position.y, goal.x - motion.position.x) - heading);
        const familiarity = this.recent.reduce((sum, p) => sum + Math.max(0, 1 - distance(p, goal) / 350), 0);
        // A slight preference for continuing ahead, without a fixed turning side
        // or a perimeter itinerary. Recent water is less likely to be revisited.
        const score = this.random() + alignment * .28 - familiarity * .28;
        candidates.push({ goal, score });
      }
      candidates.sort((a, b) => b.score - a.score);
      const nearBank = !safe(motion.position, obstacles, bounds, 90);
      for (const { goal } of candidates.slice(0, 8)) {
        let route = planRoute(motion.position, goal, obstacles, movementBounds);
        if (route.length < 2) continue;
        if (route.length === 2) {
          const start = motion.position, bend = (this.random() - .5) * .5;
          const control = { x: (start.x + goal.x) / 2 - (goal.y - start.y) * bend, y: (start.y + goal.y) / 2 + (goal.x - start.x) * bend };
          const arc = Array.from({ length: 13 }, (_, n) => {
            const t = n / 12, u = 1 - t;
            return { x: u * u * start.x + 2 * u * t * control.x + t * t * goal.x, y: u * u * start.y + 2 * u * t * control.y + t * t * goal.y };
          });
          if (arc.every((p, n) => n === 0 || clearSegment(arc[n - 1], p, obstacles, movementBounds))) route = arc;
        }
        if (nearBank && !this.canTurnInto(motion, route, obstacles, movementBounds, activity)) continue;
        motion.setRoute(route); this.destinations++;
        this.recent.push({ ...motion.position });
        if (this.recent.length > 4) this.recent.shift();
        const leg=this.style.legSeconds*(.75+this.random()*.75);
        const span=route.reduce((sum,p,i)=>i?sum+distance(route[i-1],p):sum,0);
        this.changeAt=time+(goal===visit?Math.max(leg,span/(this.style.speed*.72)+6):leg);
        break;
      }
      this.retryAt = time + 1.5;
    }
    if (time >= this.paceAt) {
      this.desiredPace = .65 + this.random() * .55;
      this.paceAt = time + 5 + this.random() * 9;
    }
    this.pace += (this.desiredPace - this.pace) * (1 - Math.exp(-dt * .5));
    if (dt > 0) {
      const before = motion.position;
      motion.update(dt, this.style.speed * this.pace * activity, obstacles, movementBounds, this.style.response, this.style.turnResponse, this.style.turnRate);
      this.stalledFor = activity > .3 && motion.route.length && distance(before, motion.position) < .001 ? this.stalledFor + dt : 0;
    }
  }
  private canTurnInto(motion: BoatMotion, route: Point[], obstacles: Obstacle[], bounds: Bounds, activity: number) {
    // Reuse the real steering rules for a short look ahead, rather than forcing
    // a preferred turning direction near islands. Reject turns that would stall.
    const preview = new BoatMotion(motion.position);
    preview.setDriftVelocity(motion.driftVelocity);
    preview.velocity = { ...motion.velocity }; preview.angle = motion.angle; preview.setRoute(route);
    preview.helm = motion.helm; preview.yawRate = motion.yawRate; preview.swim = motion.swim?.copy();
    const step = motion.helm || motion.swim ? 1 / 60 : .1;
    for (let n = 0; n < 4 / step; n++) {
      const before = preview.position, speed = Math.hypot(preview.velocity.x, preview.velocity.y);
      preview.update(step, this.style.speed * this.pace * activity, obstacles, bounds, this.style.response, this.style.turnResponse, this.style.turnRate);
      if (speed > 2 && distance(before, preview.position) < .00001) return false;
    }
    return true;
  }
}

/** Wander through open water; clicking can still take over the existing motion. */
export class BoatWander {
  private course: WanderCourse;
  get destinations() { return this.course.destinations; }
  constructor(seed: number) { this.course = new WanderCourse(seed, boatStyle); }
  resume() { this.course.resume(); }
  update(motion: BoatMotion, dt: number, time: number, obstacles: Obstacle[], bounds: Bounds) {
    this.course.update(motion, dt, time, obstacles, bounds);
  }
}

export const rippleCapacity = 16, rippleLifetime = 7;
export interface Ripple { x: number; z: number; born: number; strength: number; kind: 'boat' | 'fish' | 'touch'; headingX: number; headingZ: number; spray?: number }
export class RippleField {
  readonly events: Ripple[] = Array.from({ length: rippleCapacity }, () => ({ x: 0, z: 0, born: -100, strength: 0, kind: 'boat', headingX: 0, headingZ: 1 }));
  private cursor = 0;
  private lastWake: Point | null = null;
  private lastWakeAt = -1;
  boatEvents = 0;
  fishEvents = 0;
  touchEvents = 0;
  emit(x: number, z: number, time: number, strength: number, kind: Ripple['kind'], headingX = 0, headingZ = 1, spray = 0) {
    Object.assign(this.events[this.cursor], { x, z, born: time, strength, kind, headingX, headingZ, spray });
    this.cursor = (this.cursor + 1) % rippleCapacity;
    if (kind === 'boat') this.boatEvents++; else if (kind === 'fish') this.fishEvents++; else this.touchEvents++;
  }
  trail(x: number, z: number, headingX: number, headingZ: number, speed: number, time: number, reach = .88 * lifeScale) {
    if (speed < .06 || time - this.lastWakeAt < .65) return;
    const stern = { x: x - headingX * reach, y: z - headingZ * reach };
    if (this.lastWake && distance(stern, this.lastWake) < .24) return;
    this.emit(stern.x, stern.y, time, Math.min(.35, .10 + speed * .32), 'boat', headingX, headingZ);
    this.lastWake = stern; this.lastWakeAt = time;
  }
  active(time: number) { return this.events.filter(event => time >= event.born && time - event.born < rippleLifetime); }
}

export interface FishPose extends SwimPose {
  x: number; z: number; y: number; yaw: number; pitch: number; surfacing: boolean; speed: number; reaction?: number;
  leapPhase?: 'rise' | 'air' | 'dive'; leapBend?: number;
}
export interface HeartEvent { x: number; z: number; born: number; seed: number }
const koiDepths = [-.46, -.72, -.60, -.84, -.51, -.76, -.64];
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const koiRiseTime = 1.10, koiLaunchDepth = .23, koiLaunchSpeed = 1.62;
const koiPushTime = 2 * koiLaunchDepth / koiLaunchSpeed;
const koiGravity = 9.81 * lifeScale, koiWaterDrag = 6;
const koiDiveTime = .82;
const surfaceRiseTime = 2.35, surfaceDiveStart = 3.15, surfaceVisitTime = 5.0;
const lotusLeapClearance = lotusObstacles(.72);
interface KoiLeap { depth: number; velocity: number; launched: boolean; waterContact: number | null }

/** One quiet surfacing event at a time, separated by 8–15 seconds. */
export class FishSchool {
  readonly poses: FishPose[];
  readonly collisionBodies: PondBody[];
  /** World-space events: a heart stays where it was emitted, not glued to a fish. */
  readonly hearts: HeartEvent[] = [];
  heartEvents = 0;
  private swimmers: { motion: BoatMotion; course: WanderCourse }[];
  private swimmingDepths: number[];
  private lastSurface: number[];
  private avoidance: ({ goal: Point; until: number } | null)[];
  private random: () => number;
  private socialRandom: () => number;
  private pairGuide: BoatMotion | null = null;
  private pairCourse: WanderCourse;
  private pairObstacles: Obstacle[];
  private pairPhase = .6;
  private desiredPairPhase = .6;
  private nextPairChange = 0;
  private nextHeart = 10;
  private nextVisit = 5;
  private nextLeap = 12;
  private leap: KoiLeap | null = null;
  private visitor = -1;
  private visitStart = 0;
  private diveStart = -1;
  private diveFrom = 0;
  private entered = false;
  private departed = false;
  visits = 0;
  leaps = 0;
  visibleCount: number;
  private interests = new Map<number, { goal: Point; until: number }>();
  /** Nearby free swimmers investigate briefly; the social pair acknowledges without splitting up. */
  notice(x: number, z: number, time: number, selected?: number) {
    if (!Number.isFinite(x + z + time)) return 0;
    const candidates = this.poses.map((p,i)=>({p,i,d:Math.hypot(p.x-x,p.z-z)}))
      .filter(v=>v.i<this.visibleCount && (selected === undefined ? v.d<3.2 : v.i===selected)).sort((a,b)=>a.d-b.d).slice(0,3);
    for(const {p,i} of candidates){
      p.reaction=1;
      if(i<2 || selected!==undefined) continue;
      const a=Math.atan2(p.z-z,p.x-x),goal={x:(x+Math.cos(a)*.55)*100,y:(z+Math.sin(a)*.55)*100};
      if(clearSegment(this.swimmers[i].motion.position,goal,this.obstacles,inset(this.bounds,fishStyle.edge)))
        this.interests.set(i,{goal,until:time+5});
    }
    return candidates.length;
  }
  constructor(count: number, seed: number, private obstacles: Obstacle[] = [], private bounds: Bounds = worldBounds) {
    this.visibleCount = count;
    this.random = seededRandom(seed);
    this.socialRandom = seededRandom(seed + 27183);
    this.pairCourse = new WanderCourse(seed + 4261, { ...fishStyle, speed: 22, edge: 145, legSeconds: 20 });
    // The guide reserves enough room for two independent swimmers to exchange sides.
    this.pairObstacles = obstacles.map(o => ({ ...o, rx: o.rx + 65, ry: o.ry + 65 }));
    const spawnRandom = seededRandom(seed + 191), spawnBounds = inset(bounds, fishStyle.edge + 65);
    if (count >= 2) {
      for (let n = 0; n < 300; n++) {
        const point = { x: spawnBounds.left + spawnRandom() * (spawnBounds.right - spawnBounds.left), y: spawnBounds.top + spawnRandom() * (spawnBounds.bottom - spawnBounds.top) };
        if (!safe(point, this.pairObstacles, inset(bounds, 205), 25)) continue;
        this.pairGuide = new BoatMotion(point);
        this.pairCourse.update(this.pairGuide, 0, 0, this.pairObstacles, bounds);
        const target = this.pairGuide.route[0];
        if (target) this.pairGuide.angle = Math.atan2(target.y - point.y, target.x - point.x) + Math.PI / 2;
        break;
      }
      if (!this.pairGuide) throw new Error('No open water for the koi pair');
    }
    const starts: Point[] = [];
    this.swimmers = Array.from({ length: count }, (_, i) => {
      let start: Point | undefined;
      if (i < 2 && this.pairGuide) {
        const angle = this.pairGuide.angle + this.pairPhase + i * Math.PI;
        start = { x: this.pairGuide.position.x + Math.cos(angle) * 43, y: this.pairGuide.position.y + Math.sin(angle) * 43 };
      }
      for (let attempt = 0; !start && attempt < 200; attempt++) {
        const candidate = { x: spawnBounds.left + spawnRandom() * (spawnBounds.right - spawnBounds.left), y: spawnBounds.top + spawnRandom() * (spawnBounds.bottom - spawnBounds.top) };
        if (safe(candidate, obstacles, spawnBounds, 20) && starts.every(p => distance(p, candidate) > 100)) { start = candidate; break; }
      }
      if (!start) throw new Error('No open water for fish');
      starts.push(start);
      const motion = new BoatMotion(start);
      motion.swim = new SwimDrive('koi', i + 1);
      motion.angle = spawnRandom() * Math.PI * 2;
      const course = new WanderCourse(seed + (i + 1) * 7919, { ...fishStyle, speed: 24 + spawnRandom() * 12 });
      course.update(motion, 0, 0, obstacles, bounds);
      if (motion.route[0]) motion.angle = Math.atan2(motion.route[0].y - start.y, motion.route[0].x - start.x) + Math.PI / 2;
      if (i < 2 && this.pairGuide) motion.angle = this.pairGuide.angle;
      return { motion, course };
    });
    this.poses = this.swimmers.map(({ motion }, i) => ({ x: motion.position.x / 100, z: motion.position.y / 100, y: koiDepths[i % 7], yaw: -motion.angle, pitch: 0, surfacing: false, speed: 0 }));
    this.collisionBodies = this.poses.map((pose, i) => ({ id: `koi-${i}`, kind: 'koi', pose, motion: this.swimmers[i].motion, cores: bodyCores('koi', i) }));
    this.swimmingDepths = this.poses.map(p => p.y);
    this.lastSurface = this.poses.map(() => -Infinity);
    this.avoidance = this.poses.map(() => null);
    this.update(0, 0, new RippleField(), { x: 0, y: 0 });
  }
  update(dt: number, time: number, ripples: RippleField, boat: Point, surface: SurfaceSampler = sampleSurface) {
    if (dt <= 0) return;
    this.poses.forEach(p=>{if(p.reaction!==undefined)p.reaction*=Math.exp(-dt*1.2);});
    for(const [i,interest] of this.interests)if(time>=interest.until)this.interests.delete(i);
    this.updateSwimmingDepths(dt);
    if (this.visitor >= this.visibleCount) { this.visitor = -1; this.leap = null; this.nextVisit = time + 8; }
    if (this.visibleCount > 0 && this.visitor < 0 && time >= this.nextVisit) {
      const free = time >= this.nextLeap ? this.poses.flatMap((_, i) =>
        i >= (this.pairGuide ? 2 : 0) && i < this.visibleCount && this.clearForLeap(i, boat) ? [i] : []) : [];
      const choose = this.random();
      const choice = free.length ? free[Math.floor(choose * free.length)] : this.surfaceVisitor(choose,boat);
      const p = this.poses[choice];
      // Do not surface underneath the passing boat.
      if (p) {
        this.visitor = choice; this.visitStart = time; this.diveStart = -1; this.entered = this.departed = false; this.visits++;
        this.leap = free.length ? { depth: p.y, velocity: koiLaunchSpeed, launched: false, waterContact: null } : null;
      } else this.nextVisit = time + 2;
    }
    const surfaceEffort = this.poses.map((p, i) => {
      const visitor = i === this.visitor, age = time - this.visitStart;
      const depth = this.swimmingDepths[i];
      if (visitor && this.leap) {
        if (age >= koiRiseTime || this.clearForLeap(i, boat)) {
          this.updateLeap(p, i, this.leap, age, time, dt, ripples, surface);
          return p.leapPhase === 'rise' ? .6 + .4 * Math.abs(p.leapBend ?? 0) : 0;
        }
        this.leap = null;
        this.diveStart = time; this.diveFrom = (p.y - depth) / (-.10 - depth);
      }
      p.leapPhase = undefined; p.leapBend = undefined;
      if (visitor && this.diveStart < 0 && Math.hypot(p.x - boat.x / 100, p.z - boat.y / 100) < 1.5) {
        this.diveStart = time; this.diveFrom = (p.y - depth) / (-.10 - depth);
      }
      const diving = visitor && this.diveStart >= 0;
      const lift = visitor ? diving ? this.diveFrom * (1 - smooth((time - this.diveStart) / .8))
        : smooth(age / surfaceRiseTime) * (1 - smooth((age - surfaceDiveStart) / (surfaceVisitTime - surfaceDiveStart))) : 0;
      const water = visitor ? surface(p.x,p.z,time).height : 0;
      const targetY = depth + (water - .10 - depth) * lift;
      const beforeY = p.y;
      // A stalled fish cannot climb straight up. The same forward stroke sets
      // the maximum slope of its ordinary approach to the surface.
      const riseSpeed = visitor && !diving ? Math.min(1.35,1.35 * p.speed) : 1.35;
      const nextY = p.y + Math.max(-dt * 1.35, Math.min(dt * riseSpeed, targetY - p.y));
      this.setDepth(i, nextY);
      const verticalSpeed = (p.y - beforeY) / dt;
      const pitch = .89 * Math.atan2(verticalSpeed, Math.max(.20, p.speed));
      p.pitch += (pitch - p.pitch) * (1 - Math.exp(-dt * 7));
      p.surfacing = lift > .8 && p.y > water - .22;
      if (visitor && !diving && p.surfacing && !this.entered) {
        const hx = -Math.sin(p.yaw), hz = -Math.cos(p.yaw);
        this.lastSurface[i] = time;
        ripples.emit(p.x + hx * .18, p.z + hz * .18, time, .72, 'fish', hx, hz); this.entered = true;
      }
      if (visitor && this.entered && !p.surfacing && !this.departed) {
        ripples.emit(p.x, p.z, time, .48, 'fish'); this.departed = true;
      }
      if (visitor && (age >= surfaceVisitTime || diving && time - this.diveStart >= .8)) { this.visitor = -1; p.surfacing = false; this.nextVisit = time + 8 + this.random() * 7; }
      return visitor ? Math.min(1, Math.abs(verticalSpeed) / .37) : 0;
    });
    const swimmingBounds = inset(this.bounds, fishStyle.edge);
    const steps = Math.max(1, Math.ceil(dt * 60)), step = dt / steps;
    for (let n = 0; n < steps; n++) {
      if (this.pairGuide) this.updatePair(step, time, surfaceEffort);
      for (let i = this.pairGuide ? 2 : 0; i < this.swimmers.length; i++) {
        const swimmer = this.swimmers[i], p = swimmer.motion.position;
        const effort = surfaceEffort[i];
        swimmer.motion.swim!.boost = effort;
        // Yield gently to a fish crossing ahead. Distinct swimming depths let a
        // school cross without a hard planar collision or a sideways shove.
        let yielding = 1;
        for (let j = 0; j < this.swimmers.length; j++) {
          if (i === j || Math.abs(this.poses[i].y - this.poses[j].y) > .16) continue;
          const other = this.swimmers[j].motion.position, d = distance(p, other);
          const forward = (other.x - p.x) * Math.sin(swimmer.motion.angle) - (other.y - p.y) * Math.cos(swimmer.motion.angle);
          if (d < 75 && forward > 0) yielding = Math.min(yielding, .45 + .55 * smooth((d - 24) / 51));
        }
        const detour = this.avoidance[i];
        if (detour && (time >= detour.until || distance(p, detour.goal) < 12)) this.avoidance[i] = null;
        this.advanceFish(i, time, () => {
          if (this.poses[i].leapPhase === 'air') {
            const { motion } = swimmer;
            const next = { x: p.x + motion.velocity.x * step, y: p.y + motion.velocity.y * step };
            if (clearSegment(p, next, this.obstacles, swimmingBounds)) motion.position = next;
            else motion.velocity = { x: 0, y: 0 };
            motion.constrainMotion?.(p, step, this.obstacles, swimmingBounds);
          } else if (this.avoidance[i]) {
            swimmer.motion.setRoute([p, this.avoidance[i]!.goal]);
            swimmer.motion.update(step, 24, this.obstacles, swimmingBounds, 2.2, 3, fishStyle.turnRate);
          } else if(this.interests.has(i)) {
            const interest=this.interests.get(i)!;
            swimmer.motion.setRoute([p,interest.goal]);
            swimmer.motion.update(step,24*(1+effort*.35)*yielding,this.obstacles,swimmingBounds,2.2,3,fishStyle.turnRate);
          } else {
            swimmer.course.update(swimmer.motion, step, time, this.obstacles, this.bounds, (1 + effort * .44) * yielding);
          }
        });
      }
    }
    this.poses.forEach((p, i) => {
      const { motion } = this.swimmers[i];
      p.x = motion.position.x / 100; p.z = motion.position.y / 100;
      p.yaw = -motion.angle;
      p.speed = Math.hypot(motion.velocity.x, motion.velocity.y) / 100;
      motion.swim!.pose(p);
    });
    while (this.hearts.length && time - this.hearts[0].born > 3.4) this.hearts.shift();
    if (this.pairGuide && time >= this.nextHeart) {
      const [a, b] = this.poses;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1.65 && this.socialRandom() < .65) {
        this.hearts.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, born: time, seed: this.socialRandom() });
        this.heartEvents++;
      }
      this.nextHeart = time + 20 + this.socialRandom() * 25;
    }
  }
  private surfaceVisitor(random: number,boat: Point) {
    const count=Math.min(this.visibleCount,this.poses.length),offset=Math.floor(random*count);
    let choice=-1;
    for(let n=0;n<count;n++){
      const i=(offset+n)%count, p=this.poses[i];
      if(p.speed<.10 || Math.hypot(p.x-boat.x/100,p.z-boat.y/100)<=1.5 ||
        !this.poses.every((other,j)=>j===i||Math.hypot(other.x-p.x,other.z-p.z)>.8))continue;
      // Break ties with the seeded offset, but leave room for each fish to visit.
      if(choice<0||this.lastSurface[i]<this.lastSurface[choice])choice=i;
    }
    return choice;
  }
  private clearForLeap(index: number, boat: Point) {
    const p = this.poses[index];
    const point = this.swimmers[index].motion.position;
    return distance(point, boat) > 215 && safe(point, lotusLeapClearance, this.bounds) &&
      lilyPads.every(pad => Math.hypot(pad.x - p.x, pad.z - p.z) > pad.radius + .72) &&
      this.poses.every((other, j) => j === index || Math.hypot(other.x - p.x, other.z - p.z) > 1.05);
  }

  private setDepth(index: number, height: number) {
    const p = this.poses[index];
    // Let a neighbour pass before changing depth instead of projecting either fish sideways.
    const blocked = this.poses.some((other, i) => i !== index && Math.abs(height - other.y) < Math.abs(p.y - other.y) &&
      Math.hypot(other.x - p.x, other.z - p.z, height - other.y) < .25);
    if (!blocked && this.collisionBodies[index].canSetHeight?.(height) !== false) p.y = height;
  }


  private updateLeap(p: FishPose, index: number, leap: KoiLeap, age: number, time: number, dt: number, ripples: RippleField, surface: SurfaceSampler) {
    const water = surface(p.x, p.z, time).height;
    const airborne = age - koiRiseTime - koiPushTime;
    let y: number, pitch: number, bend: number;
    if (age < koiRiseTime) {
      const t = smooth(age / koiRiseTime);
      p.leapPhase = 'rise'; y = leap.depth * (1 - t) + (water - koiLaunchDepth) * t;
      pitch = .29 * t; bend = .18 * Math.sin(age * 13) * Math.sin(t * Math.PI);
    } else if (airborne < 0) {
      const t = 1 + airborne / koiPushTime;
      p.leapPhase = 'rise'; y = water - koiLaunchDepth * (1 - t * t);
      pitch = .29 + .67 * Math.atan2(koiLaunchSpeed * t, .63);
      bend = .86 * Math.sin(t * Math.PI * 1.9);
    } else {
      if (leap.waterContact === null) {
        const step = leap.launched ? dt : Math.min(dt, airborne);
        const height = leap.launched ? p.y : water;
        y = height + leap.velocity * step - .5 * koiGravity * step * step;
        leap.velocity -= koiGravity * step;
        leap.launched = true;
        p.leapPhase = 'air';
      } else {
        const decay = Math.exp(-koiWaterDrag * dt);
        y = p.y + leap.velocity * (1 - decay) / koiWaterDrag;
        leap.velocity *= decay;
        p.leapPhase = 'dive';
      }
      const direction = Math.max(-1, Math.min(1, leap.velocity / koiLaunchSpeed));
      pitch = .29 * direction + .67 * Math.atan2(leap.velocity, .63);
      bend = -.26 * Math.sin(direction * Math.PI * .5);
    }
    const maxChange = 1.88 * dt;
    p.pitch = pitch; p.leapBend = bend;
    this.setDepth(index, p.y + Math.max(-maxChange, Math.min(maxChange, y - p.y)));
    p.surfacing = false;
    // Disturb the surface at the two crossings. Each jump has its own quiet interval.
    if (!this.entered && p.y >= water - .022 && age > koiRiseTime) {
      this.entered = true; this.leaps++;
      ripples.emit(p.x, p.z, time, .55, 'fish', -Math.sin(p.yaw), -Math.cos(p.yaw), .44);
    }
    if (leap.launched && leap.waterContact === null && leap.velocity < 0 && p.y <= water) {
      leap.waterContact = time;
      p.leapPhase = 'dive';
      this.departed = true;
      const hx = -Math.sin(p.yaw), hz = -Math.cos(p.yaw);
      ripples.emit(p.x + hx * .14, p.z + hz * .14, time, .74, 'fish', hx, hz, .67);
    }
    if (leap.waterContact !== null && time - leap.waterContact >= koiDiveTime) {
      this.visitor = -1; this.leap = null; this.nextVisit = time + 8 + this.random() * 7;
      this.nextLeap = time + 35 + this.random() * 20;
    }
  }
  private advanceFish(index: number, time: number, advance: () => void) {
    const motion = this.swimmers[index].motion, before = motion.position;
    advance();
    const blocked = this.swimmers.some(({ motion: other }, j) => {
      if (j === index) return false;
      const y = (this.poses[index].y - this.poses[j].y) * 100;
      const priorDistance = Math.hypot(before.x - other.position.x, before.y - other.position.y, y);
      const nextDistance = Math.hypot(motion.position.x - other.position.x, motion.position.y - other.position.y, y);
      return nextDistance < 25 && nextDistance < priorDistance;
    });
    if (blocked) {
      motion.position = before;
      motion.velocity.x *= .3; motion.velocity.y *= .3;
      if (!this.avoidance[index] || time >= this.avoidance[index]!.until) {
        let awayX = 0, awayZ = 0;
        this.swimmers.forEach(({ motion: other }, j) => {
          if (j === index || Math.abs(this.poses[index].y - this.poses[j].y) > .34) return;
          const d = distance(before, other.position);
          if (d < 85) { awayX += (before.x - other.position.x) / Math.max(1, d); awayZ += (before.y - other.position.y) / Math.max(1, d); }
        });
        const heading = Math.atan2(awayZ, awayX);
        for (const offset of [0, .5, -.5, 1, -1, 1.5, -1.5]) {
          const angle = heading + offset, reach = index < 2 ? 55 : 85;
          const goal = { x: before.x + Math.cos(angle) * reach, y: before.y + Math.sin(angle) * reach };
          if (clearSegment(before, goal, this.obstacles, inset(this.bounds, fishStyle.edge))) {
            this.avoidance[index] = { goal, until: time + 4 }; break;
          }
        }
      }
    }
  }
  private updateSwimmingDepths(dt: number) {
    const desired = this.swimmingDepths.map((_, i) => koiDepths[i % 7]);
    for (let i = 2; i < this.swimmers.length; i++) {
      const own = this.swimmers[i].motion;
      const neighbors: number[] = [];
      for (let j = 0; j < i; j++) {
        const other = this.swimmers[j].motion;
        const dx = own.position.x - other.position.x, dz = own.position.y - other.position.y;
        const vx = own.velocity.x - other.velocity.x, vz = own.velocity.y - other.velocity.y;
        const closestTime = Math.max(0, Math.min(2.4, -(dx * vx + dz * vz) / Math.max(1, vx * vx + vz * vz)));
        if (Math.hypot(dx, dz) < 200 && Math.hypot(dx + vx * closestTime, dz + vz * closestTime) < 95) neighbors.push(j === this.visitor ? this.poses[j].y : desired[j]);
      }
      if (neighbors.length) {
        // Fish pass above/below one another before contact instead of sliding
        // sideways or being projected apart after intersecting. The priority is
        // stable so two approaching fish do not mirror each other's avoidance.
        const candidates = [desired[i], -.36, -.46, -.60, -.73, -.88, -1.04];
        candidates.sort((a, b) => {
          const score = (depth: number) => Math.abs(depth - koiDepths[i % 7]) + neighbors.reduce((cost, y) => cost + Math.max(0, .29 - Math.abs(depth - y)) * 12, 0);
          return score(a) - score(b);
        });
        desired[i] = candidates[0];
      }
    }
    for (let i = 0; i < desired.length; i++) {
      const change = (desired[i] - this.swimmingDepths[i]) * (1 - Math.exp(-dt * 2.2));
      this.swimmingDepths[i] += Math.max(-.4 * dt, Math.min(.4 * dt, change));
    }
  }
  private updatePair(dt: number, time: number, surfaceEffort: number[]) {
    const guide = this.pairGuide!;
    const pair = this.swimmers.slice(0, 2);
    if (time >= this.nextPairChange) {
      // Nonperiodic, gradual changes put either fish ahead, behind or at a side.
      this.desiredPairPhase = this.pairPhase + (this.socialRandom() < .5 ? -1 : 1) * (.9 + this.socialRandom() * 1.5);
      this.nextPairChange = time + 12 + this.socialRandom() * 12;
    }
    this.pairPhase += Math.max(-.12 * dt, Math.min(.12 * dt, (this.desiredPairPhase - this.pairPhase) * dt * .25));
    const lag = Math.max(...pair.map(p => distance(p.motion.position, guide.position)));
    const together = 1 - smooth((lag - 65) / 60);
    const surfacing = Math.max(surfaceEffort[0], surfaceEffort[1]);
    this.pairCourse.update(guide, dt, time, this.pairObstacles, this.bounds, together * (1 + surfacing * .18));
    for (let i = 0; i < 2; i++) {
      const { motion } = pair[i], other = pair[1 - i].motion.position;
      const angle = guide.angle + this.pairPhase + i * Math.PI;
      const radius = 43 + Math.sin(time * .17 + i * 2.7) * 7;
      let goal = { x: guide.position.x + Math.cos(angle) * radius, y: guide.position.y + Math.sin(angle) * radius };
      const d = distance(motion.position, other);
      if (d < 85) {
        const separation = (85 - d) * 1.35 / Math.max(1, d);
        goal.x += (motion.position.x - other.x) * separation;
        goal.y += (motion.position.y - other.y) * separation;
      }
      const detour = this.avoidance[i];
      if (detour && (time >= detour.until || distance(motion.position, detour.goal) < 12)) this.avoidance[i] = null;
      if (this.avoidance[i]) goal = this.avoidance[i]!.goal;
      const inner = inset(this.bounds, fishStyle.edge);
      if (clearSegment(motion.position, goal, this.obstacles, inner)) motion.setRoute([motion.position, goal]);
      else if (motion.route.length === 0 || distance(motion.route[motion.route.length - 1], goal) > 20) motion.setRoute(planRoute(motion.position, goal, this.obstacles, inner));
      const approaching = ((other.x - motion.position.x) * Math.sin(motion.angle) - (other.y - motion.position.y) * Math.cos(motion.angle)) / Math.max(1, d);
      const yielding = approaching > .25 ? .12 + .88 * smooth((d - 25) / 40) : 1;
      motion.swim!.boost = surfaceEffort[i];
      this.advanceFish(i, time, () => motion.update(dt, (43 + surfaceEffort[i] * 5) * yielding, this.obstacles, inner, 2.2, 3, fishStyle.turnRate));
    }
  }
}
