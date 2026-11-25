import { lifeScale } from './shore-layout';

type FlightStage = 'run' | 'climb' | 'cruise' | 'descent' | 'skim';
export const swanCruiseOptions = [4.6, 3.35] as const;

export interface SwanFlightState {
  stage: FlightStage;
  age: number;
  stageTime: number;
  speed: number;
  height: number;
  referenceHeight: number;
  verticalSpeed: number;
  stroke: number;
  footPhase: number;
  cruiseTime: number;
}

const gravity = 9.81 * lifeScale;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

export function makeSwanFlight(speed: number, height: number, cruiseTime: number): SwanFlightState {
  return { stage: 'run', age: 0, stageTime: 0, speed, height, referenceHeight: height, verticalSpeed: 0,
    stroke: 0, footPhase: 0, cruiseTime };
}

export const swanBuoyancy = (height: number, speed: number, water: number) => 57 * (water - height) - 13 * speed;

/** Forces per unit mass. Integrate forward speed and vertical speed before moving the bird. */
export function advanceSwanFlight(body: SwanFlightState, waterHeight: number, dt: number) {
  body.age += dt;
  body.stageTime += dt;
  const running = body.stage === 'run', onWater = running || body.stage === 'skim';
  const clearance = body.height - waterHeight;
  const spread = smooth((body.age - .13) / .70);
  const cruise = body.stage === 'cruise';
  const glide = cruise ? smooth((Math.sin(body.stageTime * 2.6 - .9) + .41) / 1.25)
    * smooth(body.stageTime / .4) * smooth((body.cruiseTime - body.stageTime) / .5) : 0;
  const braking = body.stage === 'descent' ? smooth((.70 - clearance) / .58)
    : body.stage === 'skim' ? 1 - smooth(body.stageTime / 1.05) : 0;
  body.stroke += dt * 2 * Math.PI * (onWater ? 2.65 : 2.50 - .40 * braking - 1.5 * glide);
  body.footPhase += dt * 2 * Math.PI * 1.92;
  const downstroke = Math.max(0, -Math.cos(body.stroke));
  const footDrive = Math.cos(body.footPhase) ** 2;
  const thrust = running ? 1.62 * (.62 + .38 * footDrive) + .37 * spread * downstroke
    : onWater ? 0 : (.57 + .16 * downstroke) * (1 - .76 * braking - .48 * glide);
  const drag = running ? (.29 + .21 * body.speed) * body.speed
    : onWater ? (1.46 + 1.21 * body.speed) * body.speed : (.26 + .53 * braking - .092 * glide) * body.speed ** 2;
  const previousSpeed = body.speed;
  body.speed = Math.max(0, body.speed + (thrust - drag) * dt);

  if (running && spread > .91 && body.speed > 1.32
    && (body.speed / 1.32) ** 2 * spread * (1 + .12 * downstroke) > 1.045) {
    body.stage = 'climb'; body.stageTime = 0; body.referenceHeight = waterHeight;
  } else if (body.stage === 'climb' && ((clearance > 1.05 && body.stageTime > 1.14) || body.stageTime > 2.02)) {
    body.stage = 'cruise'; body.stageTime = 0;
  } else if (cruise && body.stageTime >= body.cruiseTime) {
    body.stage = 'descent'; body.stageTime = 0;
  }

  let contact = false;
  if (body.stage === 'run' || body.stage === 'skim') {
    body.verticalSpeed += swanBuoyancy(body.height, body.verticalSpeed, waterHeight) * dt;
  } else {
    const targetHeight = body.referenceHeight + (body.stage === 'climb' ? 1.26 : body.stage === 'cruise' ? 1.17 - .092 * glide : -.22);
    const steering = clamp(5.4 * (targetHeight - body.height) - 2.65 * body.verticalSpeed, -4.3, 3.0);
    const lift = gravity + steering + .70 * (downstroke - .31) * (1 - .7 * braking) * (1 - .88 * glide);
    body.verticalSpeed += (lift - gravity) * dt;
  }
  body.height += body.verticalSpeed * dt;
  if (body.stage === 'descent' && body.height <= waterHeight && body.verticalSpeed < 0) {
    body.stage = 'skim'; body.stageTime = 0;
    body.verticalSpeed *= .24;
    body.speed *= .96;
    contact = true;
  }
  return { distance: (previousSpeed + body.speed) * .5 * dt, contact, braking, spread, glide,
    done: body.stage === 'skim' && body.stageTime >= 1.3 && body.speed <= .14 };
}

/** Use the same force model when reserving a straight, unobstructed run and landing. */
export function swanFlightDistance(speed: number, cruiseTime: number) {
  const body = makeSwanFlight(speed, 0, cruiseTime);
  let span = 0;
  for (let step = 0; step < 15 * 60; step++) {
    const result = advanceSwanFlight(body, 0, 1 / 60);
    span += result.distance;
    if (result.done) break;
  }
  return span;
}
