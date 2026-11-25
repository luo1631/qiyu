import type { Point } from '../config/islands';
import { moveWithCollisions, segmentIntersectsEllipse } from './collision';
import type { CollisionMaterial } from './collision';
import { integrateHull } from './water-dynamics';
import type { SwimDrive } from './locomotion';
import type { HullHelm, HullState } from './water-dynamics';
export interface Obstacle { x: number; y: number; rx: number; ry: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }
/** Hull distances/speeds use centimetres; heading and turn rate use radians. */
export type { HullHelm } from './water-dynamics';
export const boatHelm: HullHelm = { turnRate: .30, angularAcceleration: .12, thrust: 18, brake: 28, lateralDrag: 3.8, turnRadius: 140 };
export const boatCruiseSpeed = 37.5;
export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export function inside(p: Point, o: Obstacle, margin = 0) {
  return ((p.x - o.x) / (o.rx + margin)) ** 2 + ((p.y - o.y) / (o.ry + margin)) ** 2 < 1;
}
export function safe(p: Point, obstacles: Obstacle[], b: Bounds, margin = 0) {
  return p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom && !obstacles.some(o => inside(p, o, margin));
}
export function clearSegment(a: Point, b: Point, obstacles: Obstacle[], bounds: Bounds) {
  return safe(a, [], bounds) && safe(b, [], bounds) && !obstacles.some(o => segmentIntersectsEllipse(a, b, o));
}

interface VisibilityGraph { anchors: Point[]; visibility: Int8Array }
const visibilityCache = new WeakMap<Obstacle[], { geometry: string; graphs: Map<string, VisibilityGraph> }>();

function shoreGraph(obstacles: Obstacle[], bounds: Bounds) {
  const geometry = obstacles.map(o => [o.x, o.y, o.rx, o.ry].join(',')).join(';');
  let entry = visibilityCache.get(obstacles);
  if (!entry || entry.geometry !== geometry) {
    entry = { geometry, graphs: new Map() };
    visibilityCache.set(obstacles, entry);
  }
  const key = [bounds.left, bounds.top, bounds.right, bounds.bottom].join(',');
  const cached = entry.graphs.get(key);
  if (cached) return cached;
  const anchors: Point[] = [];
  for (const o of obstacles) {
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2;
      const p = { x: o.x + (o.rx + 17) * Math.cos(a), y: o.y + (o.ry + 17) * Math.sin(a) };
      if (safe(p, obstacles, bounds)) anchors.push(p);
    }
  }
  const graph = { anchors, visibility: new Int8Array(anchors.length ** 2) };
  // A hull returning from a click can create transient bounds as it rejoins the patrol area.
  if (entry.graphs.size >= 4) entry.graphs.delete(entry.graphs.keys().next().value!);
  entry.graphs.set(key, graph);
  return graph;
}

// Reuse fixed shore links across searches. Each start, goal and rounded corner is checked live.
export function planRoute(start: Point, goal: Point, obstacles: Obstacle[], bounds: Bounds): Point[] {
  if (clearSegment(start, goal, obstacles, bounds)) return [start, goal];
  const { anchors, visibility } = shoreGraph(obstacles, bounds);
  const nodes = [start, goal, ...anchors];
  const visible = (from: number, to: number) => {
    if (from < 2 || to < 2) return clearSegment(nodes[from], nodes[to], obstacles, bounds);
    const link = (from - 2) * anchors.length + to - 2;
    if (!visibility[link]) visibility[link] = clearSegment(nodes[from], nodes[to], obstacles, bounds) ? 1 : -1;
    return visibility[link] === 1;
  };
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (u < 0 || costs[i] < costs[u])) u = i;
    if (u < 0 || !Number.isFinite(costs[u])) break;
    if (u === 1) {
      const route: Point[] = [];
      for (let v = 1; v !== -1; v = previous[v]) route.unshift(v < 2 ? nodes[v] : { ...nodes[v] });
      return smoothRoute(route, obstacles, bounds);
    }
    visited.add(u);
    for (let v = 0; v < nodes.length; v++) {
      if (v === u || visited.has(v)) continue;
      const cost = costs[u] + distance(nodes[u], nodes[v]);
      if (cost < costs[v] && visible(u, v)) { costs[v] = cost; previous[v] = u; }
    }
  }
  return [start]; // Never cut across an island if no safe route exists.
}
function smoothRoute(route: Point[], obstacles: Obstacle[], bounds: Bounds): Point[] {
  const result: Point[] = [route[0]];
  for (let i = 1; i < route.length - 1; i++) {
    const a = route[i - 1], b = route[i], c = route[i + 1];
    const amount = Math.min(24, distance(a, b) * .24, distance(b, c) * .24);
    const p = { x: b.x + (a.x - b.x) * amount / distance(a, b), y: b.y + (a.y - b.y) * amount / distance(a, b) };
    const q = { x: b.x + (c.x - b.x) * amount / distance(b, c), y: b.y + (c.y - b.y) * amount / distance(b, c) };
    const curve = Array.from({ length: 13 }, (_, n) => {
      const t = n / 12;
      return { x: (1-t)**2*p.x + 2*(1-t)*t*b.x + t*t*q.x, y: (1-t)**2*p.y + 2*(1-t)*t*b.y + t*t*q.y };
    });
    if (curve.every((v,n) => safe(v, obstacles, bounds) && (n === 0 || clearSegment(curve[n-1],v,obstacles,bounds)))) result.push(...curve);
    else result.push(b);
  }
  result.push(route[route.length - 1]);
  return result;
}

/** Clicks may lie in the hull's shore clearance or in a disconnected corner.
 * Keep reachable open-water targets exact; otherwise choose a nearby reachable
 * endpoint. All inputs/outputs are centimetres. Planning never changes momentum. */
export function planWaterRoute(start: Point, requested: Point, obstacles: Obstacle[], bounds: Bounds): Point[] {
  if (![start.x, start.y, requested.x, requested.y].every(Number.isFinite)) return [];
  const inset = 12;
  const inner = { left: bounds.left + inset, right: bounds.right - inset, top: bounds.top + inset, bottom: bounds.bottom - inset };
  if (inner.left > inner.right || inner.top > inner.bottom || !safe(start, obstacles, bounds)) return [];
  const goal = { x: Math.max(inner.left, Math.min(inner.right, requested.x)), y: Math.max(inner.top, Math.min(inner.bottom, requested.y)) };
  if (safe(goal, obstacles, inner, 8)) {
    const route = planRoute(start, goal, obstacles, bounds);
    if (route.length > 1) return route;
  }
  const candidates: Point[] = [];
  for (const o of obstacles) {
    const direction = Math.atan2((goal.y - o.y) / o.ry, (goal.x - o.x) / o.rx);
    for (let n = -1; n < 48; n++) {
      const angle = n < 0 ? direction : n * Math.PI * 2 / 48;
      candidates.push({ x: o.x + (o.rx + 20) * Math.cos(angle), y: o.y + (o.ry + 20) * Math.sin(angle) });
    }
  }
  for (const x of [inner.left, inner.right]) for (const y of [inner.top, inner.bottom]) candidates.push({ x, y });
  // The current component always has at least one reachable fallback, even if
  // islands meet the bounds and isolate the clicked corner of the water plane.
  candidates.push({ ...start });
  candidates.sort((a, b) => distance(a, goal) - distance(b, goal));
  for (const candidate of candidates) {
    if (!safe(candidate, obstacles, inner, 8)) continue;
    const route = planRoute(start, candidate, obstacles, bounds);
    if (route.length > 1) return route;
  }
  return [];
}

interface DepartureTurn {
  initialAngle: number;
  direction: number;
  sweep: number;
  reverseUntil: number;
  reverseSpeed: number;
  forwardSpeed: number;
  elapsed: number;
  forwardAt?: number;
}
const departureLimit = 16;
const departureTolerance = .12;

function departureAngleLeft(state: HullState, turn: DepartureTurn) {
  return turn.sweep - (state.angle - turn.initialAngle) * turn.direction;
}

function steerDeparture(state: HullState, helm: HullHelm, turn: DepartureTurn, dt: number, response: number) {
  turn.elapsed += dt;
  const angleLeft = departureAngleLeft(state, turn);
  if (turn.forwardAt === undefined && turn.sweep - angleLeft >= turn.reverseUntil) turn.forwardAt = turn.elapsed;
  // Once the oar changes direction it completes the stroke even as yaw slows down.
  const shiftingFor = turn.forwardAt === undefined ? 0 : turn.elapsed - turn.forwardAt;
  const ahead = Math.max(0, Math.min(1, (shiftingFor - .35) / 1.1));
  const waterX = state.velocity.x - state.driftVelocity.x, waterY = state.velocity.y - state.driftVelocity.y;
  const along = waterX * Math.sin(state.angle) - waterY * Math.cos(state.angle);
  const rate = Math.min(helm.turnRate, Math.abs(along) / (helm.turnRadius * .54), Math.max(0, angleLeft) * .8);
  const steering = along < 0 ? rate * Math.max(0, 1 - shiftingFor / .85) : rate;
  const speed = -turn.reverseSpeed + (turn.reverseSpeed + turn.forwardSpeed) * ahead;
  integrateHull(state, helm, dt, speed, turn.direction * steering, response);
}

/** At rest by a bank, test both backing arcs with the same forces used in live motion. */
function planDeparture(motion: BoatMotion, helm: HullHelm, target: Point, error: number, maxSpeed: number, response: number,
  obstacles: Obstacle[], bounds: Bounds) {
  const start = motion.position, initialDistance = distance(start, target);
  const forwardSpeed = Math.min(42, maxSpeed), preferred = Math.sign(error);
  const paddedBounds = { left: bounds.left + 6, right: bounds.right - 6, top: bounds.top + 6, bottom: bounds.bottom - 6 };
  // Check a buffer around the swept hull's centre. Its per-step travel is under 1 cm.
  let best: DepartureTurn | undefined, bestTime = Infinity;
  for (const direction of [preferred, -preferred]) {
    const sweep = direction === preferred ? Math.abs(error) : 2 * Math.PI - Math.abs(error);
    if (sweep > 4) continue;
    for (const reverseSpeed of [forwardSpeed, forwardSpeed * .76]) for (const fraction of [.34, .42]) {
      const turn = { initialAngle: motion.angle, direction, sweep, reverseUntil: sweep * fraction - .1, reverseSpeed, forwardSpeed, elapsed: 0 };
      const forecast: DepartureTurn = { ...turn };
      const state = { angle: motion.angle, velocity: motion.velocity, driftVelocity: motion.driftVelocity,
        yawRate: motion.yawRate, forwardAcceleration: motion.forwardAcceleration };
      let position = start;
      for (let step = 1; step <= 60 * departureLimit; step++) {
        steerDeparture(state, helm, forecast, 1 / 60, response);
        position = { x: position.x + state.velocity.x / 60, y: position.y + state.velocity.y / 60 };
        if (!safe(position, obstacles, paddedBounds, 6)) break;
        if (departureAngleLeft(state, forecast) > departureTolerance) continue;
        const remaining = distance(position, target);
        const heading = Math.atan2(target.x - position.x, position.y - target.y);
        const errorAtExit = heading - state.angle - state.yawRate * .6;
        const turnAtExit = Math.abs(Math.atan2(Math.sin(errorAtExit), Math.cos(errorAtExit)));
        const time = step / 60 + remaining / maxSpeed + turnAtExit / helm.turnRate;
        if (remaining < initialDistance - 35 && time < bestTime && clearSegment(position, target, obstacles, bounds)) {
          best = turn;
          bestTime = time;
        }
        break;
      }
    }
  }
  return best;
}

export class BoatMotion {
  position: Point;
  velocity: Point = { x: 0, y: 0 };
  angle = -.3;
  route: Point[] = [];
  // Only the scene boat opts into impact response; swimmers retain their steering.
  collisionMaterial?: CollisionMaterial;
  collisions = 0;
  helm?: HullHelm;
  swim?: SwimDrive;
  yawRate = 0;
  forwardAcceleration = 0;
  // Centimetres/second, opt-in for the scene boat. `velocity` always includes
  // this drift, including while collision checks and click handoffs read it.
  readonly driftVelocity: Point = { x: 0, y: 0 };
  constrainMotion?: (before: Point, dt: number, obstacles: Obstacle[], bounds: Bounds) => void;
  private avoidance?: { point: Point; seconds: number };
  private departure?: DepartureTurn;
  private departurePending = false;
  constructor(position: Point) { this.position = { ...position }; }
  setRoute(route: Point[]) {
    this.route = route.slice(1);
    this.departure = undefined;
    this.departurePending = this.route.length > 0;
  }
  setDriftVelocity(next: Point) {
    this.velocity.x+=next.x-this.driftVelocity.x;this.velocity.y+=next.y-this.driftVelocity.y;
    this.driftVelocity.x=next.x;this.driftVelocity.y=next.y;
  }
  releaseDrift() {
    // Keep world momentum: the existing rudder/brakes take over this velocity.
    this.driftVelocity.x=0;this.driftVelocity.y=0;
  }
  blockDrift(normal: Point) {
    const inward=this.driftVelocity.x*normal.x+this.driftVelocity.y*normal.y;
    if(inward<0){this.driftVelocity.x-=inward*normal.x;this.driftVelocity.y-=inward*normal.y;}
  }
  avoid(point: Point, seconds = 3) {
    // Give a body time to turn. Replacing this on every contact can flip its escape direction forever.
    this.avoidance ??= { point, seconds };
  }

  private dampTurnOnContact(before: Point, heading: number, intended: number) {
    const travelled = distance(before, this.position);
    if (intended <= 1e-6 || travelled >= intended * .8) return;
    // Contact takes energy out of the turning stroke along with its lost travel.
    const fraction = travelled / intended;
    this.angle = heading + (this.angle - heading) * fraction;
    this.yawRate *= fraction;
  }

  update(dt: number, maxSpeed: number, obstacles: Obstacle[], bounds: Bounds, response = 2.5, turnResponse = 1.7, forwardTurnRate = 0): boolean {
    if (dt <= 0) return this.route.length === 0;
    // The hull's acceleration and rudder use the same step at 30 and 60 FPS.
    // Swimmers keep their existing integration and steering behaviour.
    if (this.helm && dt > 1 / 60 + 1e-9) {
      const steps = Math.ceil(dt * 60);
      let arrived = false;
      for (let n = 0; n < steps; n++) arrived = this.update(dt / steps, maxSpeed, obstacles, bounds, response, turnResponse, forwardTurnRate);
      return arrived;
    }
    if (this.avoidance && ((this.avoidance.seconds -= dt) <= 0 || distance(this.position, this.avoidance.point) < 8)) this.avoidance = undefined;
    const before = { ...this.position };
    const beforeAngle = this.angle;
    const lookAhead = this.helm ? Math.max(12, Math.hypot(this.velocity.x, this.velocity.y) / this.helm.turnRate * .7)
      : forwardTurnRate > 0 ? Math.max(12, maxSpeed / forwardTurnRate * 1.35) : 7;
    while (this.route.length > 1 && distance(this.position, this.route[0]) < lookAhead && clearSegment(this.position,this.route[1],obstacles,bounds)) this.route.shift();
    const target = this.avoidance?.point ?? this.route[0];
    if (!target) {
      this.departure = undefined;
      this.departurePending = false;
      if (this.helm && (this.velocity.x || this.velocity.y || this.yawRate)) {
        integrateHull(this, this.helm, dt);
      } else if (this.swim) {
        this.swim.step(this, 0, 0, 0, dt, 0, 0, false);
        if (Math.hypot(this.velocity.x, this.velocity.y) < .03) { this.velocity = { x: 0, y: 0 }; return true; }
      } else if (this.driftVelocity.x || this.driftVelocity.y) {
        const decay=Math.exp(-dt*1.4);
        this.velocity={x:(this.velocity.x-this.driftVelocity.x)*decay+this.driftVelocity.x,
          y:(this.velocity.y-this.driftVelocity.y)*decay+this.driftVelocity.y};
      } else return true;
      const intended = Math.hypot(this.velocity.x, this.velocity.y) * dt;
      const result=moveWithCollisions(this.position,this.velocity,dt,obstacles,bounds,this.collisionMaterial);
      this.position=result.position;this.velocity=result.velocity;this.collisions+=result.contacts.length;
      result.contacts.forEach(contact=>this.blockDrift(contact.normal));
      this.constrainMotion?.(before,dt,obstacles,bounds);
      if (this.helm) this.dampTurnOnContact(before, beforeAngle, intended);
      return true;
    }
    const d = distance(this.position, target);
    let remaining = d;
    for (let i=1;i<this.route.length;i++) remaining += distance(this.route[i-1],this.route[i]);
    const speed = Math.min(maxSpeed, Math.sqrt(Math.max(0, remaining) * 22));
    const desired = { x: (target.x-this.position.x)/Math.max(d,.01)*speed, y: (target.y-this.position.y)/Math.max(d,.01)*speed };
    const blend = 1-Math.exp(-dt*response);
    if (this.helm) {
      const helm = this.helm, rateLimit = Math.min(helm.turnRate, forwardTurnRate || helm.turnRate);
      const forward = { x: Math.sin(this.angle), y: -Math.cos(this.angle) };
      const desiredAngle = Math.atan2(desired.y, desired.x) + Math.PI / 2;
      const error = Math.atan2(Math.sin(desiredAngle - this.angle), Math.cos(desiredAngle - this.angle));
      const settling = !this.avoidance && this.route.length===1 && d<2.2 && Math.hypot(this.velocity.x,this.velocity.y)<7;
      // Water-relative headway sets the steering arc. The tighter shore turn
      // can also use the motion from a reverse or lateral stroke.
      const shoreClearance = Math.min(this.position.x - bounds.left, bounds.right - this.position.x,
        this.position.y - bounds.top, bounds.bottom - this.position.y,
        ...obstacles.map(o => (Math.hypot((this.position.x-o.x)/o.rx, (this.position.y-o.y)/o.ry)-1) * Math.min(o.rx,o.ry)));
      const close = !this.avoidance && this.route.length === 1 && d < 56;
      const bow = { x: this.position.x + forward.x*52, y: this.position.y + forward.y*52 };
      const inShallows = shoreClearance < 98 && (Math.abs(error) > .72 || !clearSegment(this.position, bow, obstacles, bounds));
      const radius = Math.max(helm.turnRadius * .52, Math.min(helm.turnRadius, shoreClearance * 2));
      const waterX = this.velocity.x - this.driftVelocity.x, waterY = this.velocity.y - this.driftVelocity.y;
      const headwaySpeed = waterX*forward.x + waterY*forward.y;
      const movingRate = (inShallows ? Math.hypot(waterX, waterY) : Math.max(0, headwaySpeed)) / radius;
      const brakingRate = Math.sqrt(2 * helm.angularAcceleration * Math.abs(error)) * .85;
      const desiredRate = close ? 0
        : Math.sign(error) * Math.min(rateLimit, movingRate, Math.abs(error) * .7, brakingRate);
      // A drifting hull keeps making headway through a turn. Scale that floor
      // down near the endpoint so a tight arrival does not become an endless orbit.
      const headway = Math.min(d * .12, maxSpeed * .6);
      // Keep final approach slower than heading correction (.7 rad/s per rad).
      // Otherwise the target bearing can run ahead of the rudder near arrival.
      const arrivalSpeed = !this.avoidance && this.route.length === 1 ? Math.min(speed, d * .45) : speed;
      if (this.departurePending) {
        this.departurePending = false;
        if (!forwardTurnRate && !this.avoidance && inShallows && d > 180 && Math.abs(error) > 1.65
          && Math.hypot(waterX, waterY) < 14 && Math.abs(this.yawRate) < .12 && maxSpeed >= 29) {
          this.departure = planDeparture(this, helm, target, error, maxSpeed, response, obstacles, bounds);
        }
      }
      if (this.departure && (this.avoidance || this.departure.elapsed >= departureLimit
        || departureAngleLeft(this, this.departure) <= departureTolerance)) this.departure = undefined;
      if (this.departure) {
        steerDeparture(this, helm, this.departure, dt, response);
      } else if (close || inShallows) {
        // Short reverse and side strokes shift the hull into room for a wider turn.
        const dx = target.x - this.position.x, dy = target.y - this.position.y;
        const across = -dx*forward.y + dy*forward.x;
        const speedCap = Math.min(maxSpeed, close ? 26 : 34), lateralCap = close ? 11.4 : 15.8;
        const gain = settling ? 0 : Math.min(.55, speedCap / Math.max(d, .01), lateralCap / Math.max(.01, Math.abs(across)));
        const side = across * gain;
        // During autonomous cruising, bank recovery remains mainly along the hull.
        const sideSpeed = forwardTurnRate && !close ? Math.max(-2, Math.min(2, side)) : side;
        integrateHull(this, helm, dt, (dx*forward.x + dy*forward.y)*gain, desiredRate, response, sideSpeed);
      } else {
        const targetSpeed = Math.max(headway, arrivalSpeed * Math.max(0, Math.cos(error)) ** 3);
        integrateHull(this, helm, dt, targetSpeed, desiredRate, response);
      }
    } else if (forwardTurnRate > 0) {
      const desiredAngle = Math.atan2(desired.y, desired.x) + Math.PI / 2;
      const diff = d < .05 ? 0 : Math.atan2(Math.sin(desiredAngle - this.angle), Math.cos(desiredAngle - this.angle));
      if (this.swim) {
        this.swim.step(this, diff, speed, remaining, dt, turnResponse, forwardTurnRate);
      } else {
        this.angle += Math.max(-forwardTurnRate * dt, Math.min(forwardTurnRate * dt, diff * (1 - Math.exp(-dt * turnResponse))));
        const targetSpeed = speed * Math.max(0, Math.cos(diff)) ** 2;
        const currentSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const forwardSpeed = currentSpeed + (targetSpeed - currentSpeed) * blend;
        this.velocity.x = Math.sin(this.angle) * forwardSpeed;
        this.velocity.y = -Math.cos(this.angle) * forwardSpeed;
      }
    } else {
      this.velocity.x += (desired.x-this.velocity.x)*blend;
      this.velocity.y += (desired.y-this.velocity.y)*blend;
    }
    const next = { x: this.position.x+this.velocity.x*dt, y: this.position.y+this.velocity.y*dt };
    if (clearSegment(this.position,next,obstacles,bounds)) this.position = next;
    else {
      if (this.collisionMaterial) {
        const result = moveWithCollisions(this.position, this.velocity, dt, obstacles, bounds, this.collisionMaterial);
        this.position = result.position; this.velocity = result.velocity;
        this.collisions += result.contacts.length;
        result.contacts.forEach(contact=>this.blockDrift(contact.normal));
      }
      // Inertia can bring us closer to a shore than the planned curve. Re-route
      // from the actual position rather than repeatedly steering into its edge.
      const goal=this.route[this.route.length-1] ?? target;
      const replanned=planRoute(this.position,goal,obstacles,bounds);
      if(replanned.length>1)this.route=replanned.slice(1);
      if (!this.collisionMaterial) { this.velocity.x *= .4; this.velocity.y *= .4; }
      if (!forwardTurnRate && !this.collisionMaterial && !this.helm) {
        const waypoint=this.route[0],length=distance(this.position,waypoint);
        const step=Math.min(length,Math.min(20,maxSpeed)*dt);
        const recovery={x:this.position.x+(waypoint.x-this.position.x)*step/Math.max(length,.01),y:this.position.y+(waypoint.y-this.position.y)*step/Math.max(length,.01)};
        if(clearSegment(this.position,recovery,obstacles,bounds)){
          this.velocity={x:(recovery.x-this.position.x)/dt,y:(recovery.y-this.position.y)/dt};
          this.position=recovery;
        }
      }
    }
    this.constrainMotion?.(before, dt, obstacles, bounds);
    if (this.departure && distance(next, this.position) > .01) this.departure = undefined;
    if (this.helm) this.dampTurnOnContact(before, beforeAngle, distance(before, next));
    const v = Math.hypot(this.velocity.x,this.velocity.y);
    if (v > .5 && !forwardTurnRate && !this.helm) {
      const targetAngle = Math.atan2(this.velocity.y,this.velocity.x)+Math.PI/2;
      const diff = Math.atan2(Math.sin(targetAngle-this.angle),Math.cos(targetAngle-this.angle));
      this.angle += diff*(1-Math.exp(-dt*turnResponse));
    }
    if (!this.avoidance && this.route.length===1 && distance(this.position,target)<2.2 && v<7 && (!this.helm || this.yawRate===0)) {
      this.route=[]; this.velocity={...this.driftVelocity}; this.forwardAcceleration=0; return true;
    }
    return false;
  }
}
