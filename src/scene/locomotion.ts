import type { Point } from '../config/islands';
import { integrateSwimStroke } from './water-dynamics';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (v: number) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

/** A stroke drives both frog propulsion and its visible kick/recovery/glide. */
export function frogStroke(gait: number) {
  const phase = ((gait / (Math.PI * 2)) % 1 + 1) % 1;
  const extension = phase < .22 ? smooth(phase / .22) : phase < .48 ? 1 - smooth((phase - .22) / .26) : 0;
  const drive = phase < .28 ? Math.sin(phase / .28 * Math.PI) : 0;
  return { extension, drive, glide: phase >= .48 };
}

export function turtlePaddle(phase: number, side: number, rear: boolean) {
  const angle = phase + (side > 0 ? Math.PI : 0) + (rear ? Math.PI * .77 : 0);
  const sweep = Math.cos(angle), velocity = Math.sin(angle);
  return { sweep, drive: Math.max(0, velocity), recovery: Math.max(0, -velocity) };
}

const swimmers = {
  koi: { cadence: 5.6, rate: 11, thrust: 96, side: 15, headway: .47 },
  turtle: { cadence: 2.9, rate: 2.6, thrust: 77, side: 14, headway: .46 },
  frog: { cadence: 4.2, rate: 0, thrust: 153, side: 19, headway: .37 },
  tadpole: { cadence: 9, rate: 10, thrust: 196, side: 19, headway: .42 },
  swan: { cadence: 3.3, rate: 3, thrust: 68, side: 11, headway: .42 },
};

export interface SwimPose { swimPhase?: number; swimTurn?: number; swimPower?: number }

/** A steering stroke keeps some headway, moves water sideways, and turns the
 * body. Phase and signed effort are also the inputs to the visible joints. */
export class SwimDrive {
  phase: number;
  turn = 0;
  power = 0;
  ground = 0;
  boost = 0;
  private rhythm: number;
  constructor(private readonly kind: keyof typeof swimmers, seed = 0) {
    this.phase = this.rhythm = seed * 2.37;
  }
  copy() { return Object.assign(new SwimDrive(this.kind), this); }
  pose(p: SwimPose) { p.swimPhase = this.phase; p.swimTurn = this.turn; p.swimPower = this.power; }

  step(state: { angle: number; velocity: Point }, error: number, limit: number, distance: number,
    dt: number, response: number, turnRate: number, active = true) {
    const style = swimmers[this.kind], swim = 1 - this.ground;
    const speed = Math.hypot(state.velocity.x, state.velocity.y);
    const desiredTurn = active ? clamp(error / .85, -1, 1) : 0;
    this.turn += (desiredTurn - this.turn) * (1 - Math.exp(-dt * 9));
    const steering = Math.abs(this.turn);
    const pace = smooth(Math.max(speed, active ? limit * .40 : 0) / 35);
    this.rhythm += dt * (this.kind === 'tadpole' ? 2.9 : 1.30);
    const wave = .62 + .38 * smooth((Math.cos(this.rhythm) + .48) / 1.28);
    const burst = this.kind === 'koi' || this.kind === 'tadpole' ? wave : 1;
    this.phase += dt * (style.cadence + style.rate * pace * burst + (this.kind === 'koi' ? 8 : 2.6) * steering + this.boost * 4)
      * (active ? 1 : .38 + .62 * pace);

    const outer = this.turn < 0 ? 1 : -1;
    const paddle = this.kind === 'turtle' || this.kind === 'swan';
    const front = paddle ? turtlePaddle(this.phase, outer, false) : null;
    const rear = paddle ? turtlePaddle(this.phase, outer, true) : null;
    const kick = this.kind === 'frog' ? frogStroke(this.phase).drive : Math.abs(Math.sin(this.phase)) ** 1.7;
    const outsideStroke = front && rear ? Math.max(front.drive, .66 * rear.drive) : kick;
    const propulsion = front && rear ? .46 + .48 * (Math.abs(Math.sin(this.phase)) + steering * outsideStroke) :
      this.kind === 'frog' ? kick : (.49 + .63 * kick) * burst;
    const power = active ? clamp(propulsion * (.40 + .46 * pace + .34 * steering) + .40 * this.boost, 0, 1) : 0;
    this.power += (power - this.power) * (1 - Math.exp(-dt * 13));

    if (active) {
      const angularStroke = 1 - swim * steering * (1 - outsideStroke) * .32;
      state.angle += clamp(error * (1 - Math.exp(-response * dt)), -turnRate * dt, turnRate * dt) * angularStroke;
    }
    const alignment = Math.max(style.headway * swim, Math.max(0, Math.cos(error)) ** 2);
    // Shorten the arc as a swimmer reaches a perch or bank. The navigator can
    // still reorient at a blocked edge without forcing a stroke through it.
    const goal = active ? Math.min((this.kind === 'koi' ? Math.min(48,limit) : limit) * alignment, distance * 1.45) : speed;
    const thrust = active ? style.thrust * (propulsion * swim + .72 * this.ground + .30 * steering + .34 * this.boost) : 0;
    const lateral = active ? style.side * this.turn * outsideStroke * smooth(distance / 36) * swim : 0;
    integrateSwimStroke(state, thrust, goal, dt, this.ground, lateral);
  }
}

/** Smoothed measured movement, shared across both quality levels; frozen scene time freezes it. */
export class MotionExpression {
  phase: number;
  turn = 0;
  effort = 0;
  attention = 0;
  private previous?: { time: number; yaw: number; speed: number };
  constructor(seed = 0) { this.phase = seed * 2.37; }
  sample(p: { yaw: number; speed: number; reaction?: number }, time: number) {
    if (!this.previous) { this.previous = { time, yaw: p.yaw, speed: p.speed }; return this; }
    const dt = Math.max(0, Math.min(.1, time - this.previous.time));
    if (dt === 0) return this;
    const turn = Math.atan2(Math.sin(p.yaw - this.previous.yaw), Math.cos(p.yaw - this.previous.yaw)) / dt;
    const acceleration = (p.speed - this.previous.speed) / dt;
    const blend = 1 - Math.exp(-dt * 7);
    this.turn += (clamp(turn, -2, 2) - this.turn) * blend;
    this.effort += (clamp(p.speed * 2.6 + Math.max(0, acceleration) * .15, 0, 1) - this.effort) * blend;
    this.attention += ((p.reaction ?? 0) - this.attention) * (1 - Math.exp(-dt * 12));
    this.phase += dt * (2.5 + this.effort * 7 + this.attention * 3);
    this.previous = { time, yaw: p.yaw, speed: p.speed };
    return this;
  }
}
