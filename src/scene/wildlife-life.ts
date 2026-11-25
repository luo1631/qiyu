import { BoatMotion, clearSegment, distance, planRoute, safe } from './navigation';
import type { Obstacle } from './navigation';
import type { Point } from '../config/islands';
import type { PondBody } from './body-physics';
import { bodyCores } from './body-physics';
import { boatCollisionRadius, islandShores, worldBounds } from './world-layout';
import { lilyPads } from './habitat-layout';
import type { RippleField } from './pond-life';
import { lifeScale, outerShoreObstacles } from './shore-layout';
import { lotusObstacles } from './lotus-layout';
import { westPierObstacles } from './pier-layout';
import type { SurfaceSampler } from './PondSurface';
import { advanceSwanFlight, makeSwanFlight, swanBuoyancy, swanCruiseOptions, swanFlightDistance } from './swan-flight';
import type { SwanFlightState } from './swan-flight';
import { SwimDrive } from './locomotion';
import type { SwimPose } from './locomotion';

// Read the live catalogue, including future islands. All navigation uses cm.
export const swanObstacles: Obstacle[] = [
  ...islandShores.map(s => ({ x:s.x*100,y:s.z*100,rx:(s.rx+.94*lifeScale)*100,ry:(s.rz+.94*lifeScale)*100 })),
  ...outerShoreObstacles(.94*lifeScale),
  ...lilyPads.map(p => ({x:p.x*100,y:p.z*100,rx:(p.radius+.82*lifeScale)*100,ry:(p.radius+.82*lifeScale)*100})),
  ...lotusObstacles(.82*lifeScale),...westPierObstacles(.94*lifeScale),
];
export const swanStart = {x:165,y:-40};
const visits = [{x:-90,y:-280},{x:-290,y:-645},{x:-185,y:-787},{x:176,y:-740},
  {x:735,y:-680},{x:886,y:-315},{x:825,y:-42},{x:330,y:155},{x:105,y:613},
  {x:-793,y:551},{x:-882,y:-107},{x:-396,y:-24}];
const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
const boatClearanceCm = boatCollisionRadius * 100;
const flightBounds = { left: worldBounds.left + 38, right: worldBounds.right - 38,
  top: worldBounds.top + 38, bottom: worldBounds.bottom - 38 };

export type SwanMode = 'glide' | 'rest' | 'turn' | 'takeoff' | 'flight' | 'land';
interface SwanPose extends SwimPose {
  x:number; y:number; z:number; waterHeight:number; yaw:number; pitch:number; roll:number; speed:number; mode:SwanMode;
  wingOpen:number; wingPower:number; brake:number; stroke:number; reach:number; feet:number; footPhase:number;
}
interface SwanFlight { heading: number; cruiseTime: number; readyBy: number; body: SwanFlightState | null }
const pointAhead=(p:Point,heading:number,cm:number):Point=>({x:p.x+Math.sin(heading)*cm,y:p.y-Math.cos(heading)*cm});
const headingError=(target:number,angle:number)=>Math.atan2(Math.sin(target-angle),Math.cos(target-angle));
const headway=(motion:BoatMotion)=>Math.max(0,(motion.velocity.x*Math.sin(motion.angle)-motion.velocity.y*Math.cos(motion.angle))/100);
const flightTurnStep=1/60, flightTurnLimit=4.8, flightAlignment=.021;
const flightRunway=(speed:number,cruise:number)=>swanFlightDistance(speed,cruise)*100+65;

/** Surface routes and occasional low flights share the navigable pond and body contacts. */
export class SwanLife {
  readonly motion = new BoatMotion(swanStart);
  readonly pose:SwanPose = {x:swanStart.x/100,y:0,z:swanStart.y/100,waterHeight:0,yaw:.92,pitch:0,roll:0,speed:0,mode:'glide',
    wingOpen:0,wingPower:0,brake:0,stroke:0,reach:0,feet:0,footPhase:0};
  readonly body:PondBody = {id:'swan',kind:'swan',motion:this.motion,pose:this.pose,cores:bodyCores('swan')};
  private target=0;
  private waitUntil=0;
  private yieldUntil=0;
  private nextWake=0;
  private nextFlight=26;
  private flight:SwanFlight | null = null;
  private surfaceSpeed = 0;
  destinations=0;
  flights=0;
  constructor(private readonly canFly = true) {
    this.motion.angle=-this.pose.yaw;
    this.motion.swim=new SwimDrive('swan');
  }
  update(dt:number,time:number,ripples?:RippleField,night=0,boat?:Point,surface?:SurfaceSampler,boatVelocity?:Point) {
    if(dt<=0)return;
    const steps=Math.max(1,Math.ceil(dt*60-1e-8)),slice=dt/steps;
    for(let n=0;n<steps;n++){
      // Keep route and flight deadlines stable across equivalent 30 and 60 Hz ticks.
      const sample=Math.round((time-(steps-1-n)*slice)*1e8)/1e8;
      this.step(slice,sample,ripples,night,boat,surface,boatVelocity);
    }
  }

  private step(dt:number,time:number,ripples: RippleField | undefined,night:number,boat: Point | undefined,surface:SurfaceSampler | undefined,
    boatVelocity:Point | undefined) {
    const yielding = !this.flight && this.yieldToBoat(time, boat, boatVelocity);
    if(this.canFly && !this.flight && !yielding && night<.48 && time>=this.nextFlight) {
      this.planFlight(time,boat);
    }
    if(this.flight) {
      this.updateFlight(dt,time,ripples,boat,surface);
      return;
    }
    if(!this.motion.route.length&&time>=this.waitUntil) {
      for(let i=0;i<visits.length;i++) {
        const goal=visits[this.target++%visits.length];
        if(!safe(goal,swanObstacles,worldBounds))continue;
        const route=planRoute(this.motion.position,goal,swanObstacles,worldBounds);
        if(route.length>1){this.motion.setRoute(route);this.destinations++;break;}
      }
    }
    const moving=this.motion.route.length>0;
    const goal=this.motion.route[this.motion.route.length-1];
    const remaining=goal?Math.hypot(goal.x-this.motion.position.x,goal.y-this.motion.position.y):0;
    // Rest within a natural patch of water, where the broad turns can finish.
    if(moving&&remaining<18&&Math.hypot(this.motion.velocity.x,this.motion.velocity.y)<7)this.motion.route=[];
    const cruise=yielding?33:night>.6?11:18+7*smooth(remaining/530);
    const speed=Math.min(cruise*(.92+.08*Math.sin(time*.19)),remaining*.45);
    const arrived=this.motion.update(dt,speed,swanObstacles,worldBounds,1.0,1.8,yielding?.88:.40);
    if(moving&&arrived){this.waitUntil=time+7+this.target%4;this.motion.velocity.x=this.motion.velocity.y=0;}
    const m=this.motion;
    Object.assign(this.pose,{x:m.position.x/100,z:m.position.y/100,yaw:-m.angle,
      speed:Math.hypot(m.velocity.x,m.velocity.y)/100,mode:m.route.length?'glide':'rest'});
    m.swim!.pose(this.pose);
    this.float(dt, surface?.(this.pose.x, this.pose.z, time).height ?? 0);
    this.pose.wingOpen *= Math.exp(-dt * 6);
    this.pose.reach *= Math.exp(-dt * 6);
    this.pose.pitch *= Math.exp(-dt * 6);
    this.pose.roll += (-m.swim!.turn*.056 - this.pose.roll) * (1-Math.exp(-dt*5));
    this.pose.wingPower = this.pose.brake = this.pose.feet = 0;
    // Use the existing shared ripple input, never another water simulation/shader.
    // Slow, low-energy disturbance; it propagates through the existing grass coupling.
    if(ripples&&this.pose.speed>.035&&time>=this.nextWake) {
      const hx=Math.sin(m.angle),hz=-Math.cos(m.angle);
      ripples.emit(this.pose.x-hx*.49*lifeScale,this.pose.z-hz*.49*lifeScale,time,.045,'fish');
      this.nextWake=time+1.8;
    }
  }

  private yieldToBoat(time: number, boat: Point | undefined, velocity: Point | undefined) {
    const here = this.motion.position;
    if (!boat) return false;
    const gap = distance(here, boat);
    const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
    const forward = velocity && speed > 10 ? { x:velocity.x/speed, y:velocity.y/speed } : undefined;
    const offset = { x: here.x - boat.x, y: here.y - boat.y };
    const cross = forward ? forward.x*offset.y - forward.y*offset.x : 0;
    const approaching = forward && Math.abs(cross) < boatClearanceCm && offset.x*forward.x + offset.y*forward.y > 0;
    const destination = this.motion.route.at(-1);
    // A short sidestep beside a lotus can end while the hull is still closing.
    // Continue around the shelter before the swimmer slows to a stop.
    if (time < this.yieldUntil && destination && (!approaching || distance(here, destination) > 42)) return true;
    if (gap > boatClearanceCm + (approaching ? 139 : 65)) return false;
    const away = Math.atan2(offset.y, offset.x);
    const heading = this.motion.angle - Math.PI / 2;
    const turns = approaching ? [0,.55,-.55,1.05,-1.05,1.57,-1.57,2.09,-2.09] : [0,.55,-.55,1.05,-1.05];
    turns.sort((a, b) => Math.cos(away + b - heading) - Math.cos(away + a - heading));
    let best: Point | undefined, bestScore = -Infinity;
    // Take the easiest turn that opens a gap and keeps the bird clear of the bank.
    for (const reach of [155, 95]) for (const turn of turns) {
      const angle = away + turn;
      const goal = { x: here.x + Math.cos(angle) * reach, y: here.y + Math.sin(angle) * reach };
      if (!clearSegment(here, goal, swanObstacles, worldBounds)) continue;
      if (!approaching) {
        this.motion.setRoute([here, goal]);
        this.yieldUntil = time + 6.5;
        return true;
      }
      if (distance(goal, boat) < gap + 10) continue;
      // Two bodies travelling in the same direction can still collide at the inlet.
      // Favour crossing out of the hull's approach rather than swimming ahead of it.
      const separation = (forward.x*(goal.y-here.y) - forward.y*(goal.x-here.x)) * (Math.sign(cross) || 1);
      const score = separation + 42 * Math.cos(angle - heading);
      if (score > bestScore) { best = goal; bestScore = score; }
    }
    if (!best) return false;
    this.motion.setRoute([here, best]);
    this.yieldUntil = time + 6.5;
    return true;
  }

  private float(dt: number, height: number) {
    const p = this.pose;
    p.waterHeight = height;
    this.surfaceSpeed += swanBuoyancy(p.y, this.surfaceSpeed, height) * dt;
    const y = p.y + this.surfaceSpeed * dt;
    const settled = Math.abs(y - height) < .00008 && Math.abs(this.surfaceSpeed) < .0005;
    const next = settled ? height : y;
    if (this.body.canSetHeight?.(next) !== false) p.y = next;
    else {
      this.surfaceSpeed = 0;
    }
    if (settled) this.surfaceSpeed = 0;
  }

  private routeClear(start:Point,heading:number,runway:number,boat?:Point) {
    const stop = pointAhead(start, heading, runway);
    if (!clearSegment(start, stop, swanObstacles, flightBounds)) return false;
    const runwayClearance = boatClearanceCm + 33;
    return !boat || clearSegment(start, stop, [{ ...boat, rx: runwayClearance, ry: runwayClearance }], flightBounds);
  }

  private turnForFlight(motion:BoatMotion,heading:number,dt:number) {
    const error=headingError(heading,motion.angle);
    motion.swim!.step(motion,error,23,120,dt,4.6,1.17);
    const before=motion.position, next={x:before.x+motion.velocity.x*dt,y:before.y+motion.velocity.y*dt};
    if (!clearSegment(before,next,swanObstacles,flightBounds)) return false;
    motion.position=next;
    motion.constrainMotion?.(before,dt,swanObstacles,flightBounds);
    return distance(before,motion.position)>=distance(before,next)*.45;
  }

  private previewLaunch(heading:number,boat?:Point) {
    const m=this.motion, preview=new BoatMotion(m.position);
    preview.angle=m.angle;preview.velocity={...m.velocity};preview.swim=m.swim!.copy();
    const clearance=boatClearanceCm+33;
    for(let time=0;time<=flightTurnLimit;time+=flightTurnStep){
      if(Math.abs(headingError(heading,preview.angle))<=flightAlignment)return preview;
      if(!this.turnForFlight(preview,heading,flightTurnStep)||boat&&distance(boat,preview.position)<clearance)return null;
    }
    return null;
  }

  private planFlight(time:number,boat?:Point) {
    const m = this.motion;
    let candidate:SwanFlight|null=null;
    const minimumReach=flightRunway(0,swanCruiseOptions[1])-110;
    // Reserve the run, cruise and landing in one corridor. Check the moving
    // approach too; the launch point will be offset by the turn in the water.
    for (let step = 0; step <= 40; step++) {
      const heading = m.angle + Math.ceil(step / 2) * (step % 2 ? 1 : -1) * Math.PI / 20;
      if (!this.routeClear(m.position,heading,minimumReach,boat)) continue;
      const preview=this.previewLaunch(heading,boat);
      if(!preview)continue;
      const speed=headway(preview);
      const option=swanCruiseOptions.findIndex(cruise=>this.routeClear(preview.position,preview.angle,flightRunway(speed,cruise),boat));
      if(option<0)continue;
      const plan={heading,cruiseTime:swanCruiseOptions[option],readyBy:time+flightTurnLimit,body:null};
      candidate ??= plan;
      if (option===0) {candidate=plan;break;}
    }
    if(candidate){
      this.flight=candidate;
      m.route = [];
      return;
    }
    this.nextFlight = time + 3;
  }

  private updateFlight(dt:number,time:number,ripples?:RippleField,boat?:Point,surface?:SurfaceSampler) {
    const f = this.flight!, p = this.pose, motion = this.motion;
    if (!f.body) {
      if (Math.abs(headingError(f.heading,motion.angle))>flightAlignment) {
        const clear=this.turnForFlight(motion,f.heading,dt);
        p.x = motion.position.x / 100; p.z = motion.position.y / 100;
        p.mode = 'turn'; p.speed = Math.hypot(motion.velocity.x,motion.velocity.y)/100; p.yaw = -motion.angle;
        motion.swim!.pose(p);
        p.roll += (-motion.swim!.turn*.094 - p.roll) * (1-Math.exp(-dt*6));
        p.pitch *= Math.exp(-dt*6);
        this.float(dt, surface?.(p.x, p.z, time).height ?? 0);
        if(!clear||time>f.readyBy){this.flight=null;this.nextFlight=time+3;}
        return;
      }
      f.heading=motion.angle;
      const speed=headway(motion);
      if (!this.routeClear(motion.position,f.heading,flightRunway(speed,f.cruiseTime),boat)) {
        this.flight = null; this.nextFlight = time + 3;
        return;
      }
      f.body = makeSwanFlight(speed, p.y, f.cruiseTime);
      f.body.verticalSpeed = this.surfaceSpeed;
    }
    const body = f.body, stepBefore = Math.floor(body.footPhase / Math.PI);
    const waterHeight = surface?.(p.x, p.z, time).height ?? 0;
    p.waterHeight = waterHeight;
    const flight = advanceSwanFlight(body, waterHeight, dt);
    let touchdown = flight.contact;
    if (this.body.canSetHeight?.(body.height) !== false) {
      p.y = body.height;
    } else {
      body.height = p.y; body.verticalSpeed = 0;
      if (touchdown) { body.stage = 'descent'; body.stageTime = 0; touchdown = false; }
    }
    const running = body.stage === 'run', skimming = body.stage === 'skim';
    const air = !running && !skimming, clearance = Math.max(0, p.y - waterHeight);
    const fold = skimming ? 1 - smooth(body.stageTime / 1.26) : 1;
    const brake = flight.braking, drive = smooth(body.speed / 1.35);
    p.mode = running ? 'takeoff' : body.stage === 'climb' || body.stage === 'cruise' ? 'flight' : 'land';
    const pitch = running ? .15 * drive : air
      ? .40 * Math.atan2(body.verticalSpeed, Math.max(.75, body.speed)) + .22 * brake : .14 * brake;
    p.pitch += (pitch - p.pitch) * (1 - Math.exp(-dt * 8));
    const roll=air ? (.042 * Math.sin(body.stroke) * (1-flight.glide) + .027 * Math.sin(body.age*2.8))*smooth(clearance/.65) : 0;
    p.roll += (roll-p.roll)*(1-Math.exp(-dt*12));
    p.wingOpen = flight.spread * fold;
    p.wingPower = (running ? .95 * drive : .62 + .26 * smooth(clearance / .65)) * (1 - brake) * (1-.91*flight.glide) * fold;
    p.stroke = body.stroke; p.footPhase = body.footPhase;
    p.reach = smooth(body.age / 1.3) * (1 - .26 * brake) * fold;
    p.feet = running ? -.90 * drive : skimming ? -.69 * fold : -.82 + 1.65 * smooth(clearance / .59) - .58 * brake;

    const span = flight.distance * 100;
    const before = motion.position;
    motion.angle = f.heading;
    const ahead = pointAhead(before, f.heading, span);
    motion.position = clearSegment(before, ahead, swanObstacles, worldBounds) ? ahead : before;
    const moved = distance(before, motion.position);
    motion.velocity = pointAhead({ x: 0, y: 0 }, f.heading, moved > 0 ? body.speed * 100 : 0);
    if (span > 0) motion.constrainMotion?.(before, dt, swanObstacles, worldBounds);
    p.x = motion.position.x / 100; p.z = motion.position.y / 100; p.yaw = -motion.angle;
    p.speed = body.speed = Math.max(0, (motion.velocity.x*Math.sin(f.heading) - motion.velocity.y*Math.cos(f.heading)) / 100);
    if (running && (body.age > 3.2 || (span > 0 && distance(before, motion.position) < span * .4))) {
      this.surfaceSpeed = body.verticalSpeed;
      this.flight = null; this.nextFlight = time + 7;
      return;
    }
    const stepAfter = Math.floor(body.footPhase / Math.PI);
    if (ripples && running && drive > .28 && stepAfter > stepBefore) {
      const heel = pointAhead(motion.position, f.heading, -29 * lifeScale);
      const side = (stepAfter % 2 ? -1 : 1) * .091;
      const hx = Math.sin(f.heading), hz = -Math.cos(f.heading);
      ripples.emit(heel.x/100-hz*side,heel.y/100+hx*side,time,.15+.20*drive,'fish',-hx,-hz,.30+.16*drive);
    }
    if (touchdown) ripples?.emit(p.x,p.z,time,.63,'fish',Math.sin(f.heading),-Math.cos(f.heading),.88);
    if (flight.done && skimming) {
      this.surfaceSpeed = body.verticalSpeed;
      this.flights++;
      this.flight = null; this.nextFlight = time + 81;
      this.waitUntil = time + 2.4;
    }
  }
}

export const dragonflyScale = 1.14 * lifeScale;
export const dragonflyVisits = [
  { pad: 5, offset: [.177, -.130], yaw: .60, phase: 4, center: [-3.5, -2.1] },
  { pad: 0, offset: [-.208, .170], yaw: -.80, phase: 12, center: [3.1, -5.5] },
  { pad: 4, offset: [-.223, -.145], yaw: 1.20, phase: 30, center: [7.1, -3.6] },
] as const;

export interface DragonflyPose {
  x: number; y: number; z: number; yaw: number; bank: number; pitch: number;
  flight: number; tuck: number; reach: number; compression: number; wingPower: number;
}
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
function orbitAngle(time: number, index: number) {
  const angle = time * (.31 + index * .036) + index * 2.2;
  return angle + .48 * Math.sin(angle) + .228 * Math.sin(angle * 2 + index);
}
function nearHeading(heading: number, reference: number) {
  const turn = heading - reference;
  return reference + Math.atan2(Math.sin(turn), Math.cos(turn));
}

function dragonflyTrack(angle: number, index: number) {
  const [centerX, centerZ] = dragonflyVisits[index].center;
  const r = .62 + index * .10, flit = 2 * angle + .6 * index;
  const vx = -r * Math.sin(angle) - .21 * Math.sin(flit), vz = .49 * Math.cos(angle) + .16 * Math.cos(flit);
  return { x: centerX + r * Math.cos(angle) + .105 * Math.cos(flit),
    z: centerZ + .49 * Math.sin(angle) + .08 * Math.sin(flit),
    yaw: nearHeading(Math.atan2(-vx,-vz),Math.PI-angle) };
}

/** Separate climb and descent from lateral travel so balancing happens over the leaf. */
export function dragonflyPose(index: number, time: number, night: number,
  perch: { x: number; y: number; z: number }): DragonflyPose {
  const visit = dragonflyVisits[index];
  const phase = (time + visit.phase) % 38, lapStart = time - phase;
  const daylight = 1 - smooth((night - .25) / .5);
  const lift = smooth((phase - .18) / .82), descent = smooth((phase - 24.05) / .72);
  const flight = lift * (1 - descent) * daylight;
  const away = smooth((phase - .54) / 2.02), returnToPad = smooth((phase - 21.6) / 2.25);
  const travel = away * (1 - returnToPad) * daylight;
  const entry = orbitAngle(lapStart + 2.56, index), angle = orbitAngle(time, index);
  const path = dragonflyTrack(angle,index), start = dragonflyTrack(entry,index);
  const entryYaw = nearHeading(start.yaw, visit.yaw);
  const cruiseYaw = mix(visit.yaw, entryYaw + (path.yaw - start.yaw) * daylight, daylight);
  const exitAngle = orbitAngle(lapStart + 23.85, index);
  const exit = dragonflyTrack(exitAngle,index);
  const exitHeading = mix(visit.yaw, entryYaw + (exit.yaw - start.yaw) * daylight, daylight);
  const restYaw = nearHeading(visit.yaw,exitHeading);
  const outbound = headingError(Math.atan2(perch.x-start.x,perch.z-start.z),entryYaw);
  const inbound = headingError(Math.atan2(exit.x-perch.x,exit.z-perch.z),exitHeading);
  const travelLean = Math.sin(Math.PI * away) * Math.sin(outbound) + Math.sin(Math.PI * returnToPad) * Math.sin(inbound);
  const yaw = mix(mix(visit.yaw, cruiseYaw, away), restYaw, returnToPad) + travelLean * .67 * daylight;
  const height = .38 + index * .14 + Math.sin(angle * 1.4) * .096;
  const preload = smooth(phase / .085) * (1 - smooth((phase - .085) / .095));
  const settle = smooth((phase - 24.77) / .085) * (1 - smooth((phase - 24.855) / .27));
  return {
    x: mix(perch.x, path.x, travel), y: mix(perch.y, height, flight), z: mix(perch.z, path.z, travel), yaw,
    bank: (.22 * Math.sin(angle) + .092 * travelLean) * travel,
    pitch: flight * (-.12 * (1 - away) + .14 * returnToPad - (.065+.055*Math.cos(angle*2)) * travel),
    flight,
    tuck: smooth((phase - .38) / .64) * (1 - smooth((phase - 23.10) / .58)) * daylight,
    reach: smooth((phase - 23.30) / .51) * (1 - smooth((phase - 24.10) / .48)) * daylight,
    compression: Math.max(preload * .0028, settle * .005) * daylight,
    wingPower: smooth(phase / .20) * (1 - smooth((phase - 24.64) / .43)) * daylight,
  };
}
