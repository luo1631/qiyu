import type { Point } from '../config/islands';

export interface HullHelm {
  turnRate: number;
  angularAcceleration: number;
  thrust: number;
  brake: number;
  lateralDrag: number;
  turnRadius: number;
}

export interface HullState {
  angle: number;
  yawRate: number;
  velocity: Point;
  driftVelocity: Point;
  forwardAcceleration: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const yawDamping = .28;
const surgeResistance = (speed: number, yawRate = 0) => speed * (.075 + .00065 * Math.abs(speed) + .48 * Math.abs(yawRate));

/** Forces and torques per unit mass/inertia. Distances use centimetres and angles use radians. */
export function integrateHull(state: HullState, helm: HullHelm, dt: number, targetSpeed?: number, targetYawRate = 0, response = 1,
  targetAcross = 0) {
  const powered = targetSpeed !== undefined;
  const torqueLimit = helm.angularAcceleration + yawDamping * helm.turnRate;
  const rudderTorque = powered ? clamp((targetYawRate - state.yawRate) * 6 + yawDamping * targetYawRate, -torqueLimit, torqueLimit) : 0;
  const yawAcceleration = clamp(rudderTorque - yawDamping * state.yawRate, -helm.angularAcceleration, helm.angularAcceleration);
  state.yawRate += yawAcceleration * dt;
  if (!targetYawRate && Math.abs(state.yawRate) < .0001) state.yawRate = 0;
  state.angle += state.yawRate * dt;

  const fx = Math.sin(state.angle), fy = -Math.cos(state.angle);
  const sx = -fy, sy = fx;
  const waterX = state.velocity.x - state.driftVelocity.x, waterY = state.velocity.y - state.driftVelocity.y;
  const along = waterX * fx + waterY * fy;
  const lateral = waterX * sx + waterY * sy, decay = Math.exp(-helm.lateralDrag * dt);
  const sculling = targetAcross ? clamp(targetAcross * helm.lateralDrag + (targetAcross - lateral) * response, -70, 70) : 0;
  const across = lateral * decay + (sculling / Math.max(.1, helm.lateralDrag)) * (1 - decay);
  const trim = surgeResistance(targetSpeed ?? 0);
  const thrust = targetSpeed === undefined ? 0
    : clamp((targetSpeed - along) * response + trim, -helm.brake + Math.min(0, trim), helm.thrust + Math.max(0, trim));
  const acceleration = clamp(thrust - surgeResistance(along, state.yawRate), -helm.brake, helm.thrust);
  const forward = along + acceleration * dt;
  state.forwardAcceleration = acceleration;
  state.velocity = { x: fx * forward + sx * across + state.driftVelocity.x, y: fy * forward + sy * across + state.driftVelocity.y };
}

export function integrateSwimStroke(state: { angle: number; velocity: Point }, thrust: number, speedLimit: number, dt: number,
  groundContact = 0, lateralThrust = 0) {
  const fx = Math.sin(state.angle), fy = -Math.cos(state.angle), sx = -fy, sy = fx;
  const forward = state.velocity.x * fx + state.velocity.y * fy;
  const across = (state.velocity.x * sx + state.velocity.y * sy) * Math.exp(-(4.6 + groundContact * 5) * dt) + lateralThrust * dt;
  const power = clamp((speedLimit - forward) / Math.max(8, speedLimit * .3), 0, 1);
  const resistance = (.64 + .003 * Math.abs(forward) + groundContact * .88) * forward;
  const braking = Math.max(0, forward - speedLimit) * 3.8;
  const next = forward + (thrust * power - resistance - braking) * dt;
  state.velocity = { x: fx * next + sx * across, y: fy * next + sy * across };
}
