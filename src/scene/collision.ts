import { Line3, Ray, Sphere, Vector3 } from 'three';
import type { Point } from '../config/islands';
import type { Bounds, Obstacle } from './navigation';

// Coordinates and clearance use the caller's units (navigation uses centimetres).
// Obstacles describe forbidden body-centre volumes, already expanded for each body.
const line = new Line3(), origin = new Vector3(), closest = new Vector3();
const ray = new Ray(), sphere = new Sphere(origin, 1), hitPoint = new Vector3();
function outsideEllipseBounds(minX: number, maxX: number, minY: number, maxY: number, o: Obstacle) {
  return maxX < o.x - o.rx || minX > o.x + o.rx || maxY < o.y - o.ry || minY > o.y + o.ry;
}

export function segmentIntersectsEllipse(a: Point, b: Point, o: Obstacle) {
  if (outsideEllipseBounds(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y), o)) return false;
  line.start.set((a.x - o.x) / o.rx, (a.y - o.y) / o.ry, 0);
  line.end.set((b.x - o.x) / o.rx, (b.y - o.y) / o.ry, 0);
  return line.closestPointToPoint(origin, true, closest).lengthSq() < 1;
}

export interface Contact { point: Point; normal: Point; impactSpeed: number }
export interface CollisionMaterial { restitution: number; friction: number }
export const boatContactMaterial: CollisionMaterial = { restitution: .18, friction: .12 };

/** Swept collision, then a normal impulse and tangential friction. No endpoint tunnelling. */
export function moveWithCollisions(position: Point, velocity: Point, dt: number, obstacles: Obstacle[], bounds: Bounds,
  material: CollisionMaterial = boatContactMaterial) {
  const p = { ...position }, v = { ...velocity }, contacts: Contact[] = [];
  let remaining = Math.max(0, dt);
  const restitution = Math.max(0, Math.min(1, material.restitution));
  const friction = Math.max(0, Math.min(1, material.friction));
  for (let iteration = 0; iteration < 4 && remaining > 1e-9; iteration++) {
    const dx = v.x * remaining, dy = v.y * remaining;
    if (Math.hypot(dx, dy) < 1e-9) break;
    let fraction = 1, normal: Point | undefined;
    const consider = (t: number, nx: number, ny: number) => {
      if (t >= -1e-9 && t <= fraction && v.x * nx + v.y * ny < -1e-9) {
        fraction = Math.max(0, t); normal = { x: nx, y: ny };
      }
    };
    if (dx < 0) consider((bounds.left - p.x) / dx, 1, 0);
    if (dx > 0) consider((bounds.right - p.x) / dx, -1, 0);
    if (dy < 0) consider((bounds.top - p.y) / dy, 0, 1);
    if (dy > 0) consider((bounds.bottom - p.y) / dy, 0, -1);
    const minX = Math.min(p.x, p.x + dx), maxX = Math.max(p.x, p.x + dx);
    const minY = Math.min(p.y, p.y + dy), maxY = Math.max(p.y, p.y + dy);
    for (const o of obstacles) {
      if (outsideEllipseBounds(minX, maxX, minY, maxY, o)) continue;
      ray.origin.set((p.x - o.x) / o.rx, (p.y - o.y) / o.ry, 0);
      ray.direction.set(dx / o.rx, dy / o.ry, 0);
      const length = ray.direction.length();
      ray.direction.multiplyScalar(1 / length);
      if (!ray.intersectSphere(sphere, hitPoint)) continue;
      const t = hitPoint.distanceTo(ray.origin) / length;
      const nx = hitPoint.x / o.rx, ny = hitPoint.y / o.ry, norm = Math.hypot(nx, ny);
      consider(t, nx / norm, ny / norm);
    }
    p.x += dx * fraction; p.y += dy * fraction;
    if (!normal) break;
    const n: Point = normal;
    const inward = v.x * n.x + v.y * n.y;
    contacts.push({ point: { ...p }, normal: n, impactSpeed: -inward });
    v.x = (v.x - inward * n.x) * (1 - friction) - inward * n.x * restitution;
    v.y = (v.y - inward * n.y) * (1 - friction) - inward * n.y * restitution;
    p.x += n.x * 1e-5; p.y += n.y * 1e-5;
    remaining *= 1 - fraction;
  }
  return { position: p, velocity: v, contacts };
}
