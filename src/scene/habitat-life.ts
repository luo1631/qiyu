import type { Point } from '../config/islands';
import { BoatMotion, clearSegment, distance, planRoute, safe } from './navigation';
import { animalIsland, frogFootHeight, turtleBackHeight, habitatPoint, islandHeight, islandRadius, lilyPads, padSurfaceHeight } from './habitat-layout';
import { lifeScale } from './shore-layout';
import { fishObstacles, worldBounds } from './world-layout';
import { RippleField, sampleSurface, seededRandom } from './pond-life';
import { bodyCores } from './body-physics';
import type { PondBody } from './body-physics';
import { SwimDrive, frogStroke } from './locomotion';
import type { SwimPose } from './locomotion';
import type { PadSupport, SurfaceSampler } from './PondSurface';

export type TurtleMode = 'swim' | 'shore' | 'climb' | 'bask' | 'follow' | 'climbBack' | 'ride' | 'dismount' | 'leave';
export interface AnimalPose extends SwimPose {
  x: number; y: number; z: number; yaw: number; pitch: number; speed: number; gait: number; reaction?: number;
}
export interface TurtlePose extends AnimalPose { mode: TurtleMode; groundContact?: number }
export interface FrogPose extends AnimalPose { mode: 'swim' | 'approach' | 'jump' | 'rest'; jump: number; padIndex: number; crouch?: number }
export interface TadpolePose extends AnimalPose { mode: 'follow' }
type XYZ = { x: number; y: number; z: number };
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const cm = (p: { x: number; z: number }): Point => ({ x: p.x * 100, y: p.z * 100 });
const landObstacles = fishObstacles.filter(o => Math.abs(o.x - animalIsland.x * 100) > .01 || Math.abs(o.y - animalIsland.z * 100) > .01);
const turtleObstacles=fishObstacles.map(o=>({...o,rx:o.rx+22,ry:o.ry+22}));
const turtleLandObstacles=landObstacles.map(o=>({...o,rx:o.rx+22,ry:o.ry+22}));
const body = (x: number, z: number, y: number): AnimalPose => ({ x, y, z, yaw: 0, pitch: 0, speed: 0, gait: 0 });
const habitatBody=(x:number,z:number,y:number)=>{const p=habitatPoint(x,z);return body(p.x,p.z,y);};

/** Find a short, clear water hop around a leaf. Search in alternating angular
 * offsets instead of pushing an invalid endpoint out of the bank mid-jump. */
export function frogWaterLanding(from: { x: number; z: number }, toward: { x: number; z: number }, reach: number): XYZ | null {
  const heading = Math.atan2(toward.z - from.z, toward.x - from.x);
  for (let step = 0; step <= 12; step++) {
    for (const side of step === 0 || step === 12 ? [1] : [1, -1]) {
      const angle = heading + side * step * Math.PI / 12;
      const landing = { x: from.x + Math.cos(angle) * reach, z: from.z + Math.sin(angle) * reach, y: -.10 };
      if (safe(cm(landing), fishObstacles, worldBounds, 6) && clearSegment(cm(from), cm(landing), fishObstacles, worldBounds)) return landing;
    }
  }
  return null;
}

/** Small independent state machines. Seconds/metres at the public boundary,
 * centimetres only inside the shared obstacle-aware navigator. */
export class HabitatLife {
  readonly turtles: [TurtlePose, TurtlePose] = [
    { ...habitatBody(-1.20, 1.75, -.13), mode: 'swim' },
    { ...habitatBody(-1.55, 2.33, -.10), mode: 'swim' },
  ];
  readonly frog: FrogPose = { ...habitatBody(-2.22, 2.01, -.10), mode: 'swim', jump: 0, padIndex: -1 };
  readonly tadpoles: TadpolePose[];
  readonly collisionBodies: PondBody[];
  readonly events = { landings: 0, rides: 0, frogJumps: 0, splashes: 0 };
  private random: () => number;
  private turtleMotion: [BoatMotion, BoatMotion];
  private turtleLift: [number, number] = [0, 0];
  private frogMotion: BoatMotion;
  private tadpoleMotion: BoatMotion[];
  private turtleDue: [number, number];
  private turtleWanderAt = [0, 0, 0];
  private recentWater:{x:number;z:number}[][]=[[],[],[]];
  private bay = habitatPoint(0,1.65);
  private beach = habitatPoint(0,.60);
  private smallStart: XYZ = { x: 0, y: 0, z: 0 };
  private smallEnd: XYZ = { x: 0, y: 0, z: 0 };
  private smallStarted = 0;
  private rideFinished = false;
  private frogDue = 4;
  private frogTarget = 0;
  private jumpStarted = 0;
  private jumpDuration = .9;
  private jumpFrom: XYZ = { x: 0, y: 0, z: 0 };
  private jumpTo: XYZ = { x: 0, y: 0, z: 0 };
  private jumpLanding: 'rest' | 'swim' = 'rest';
  private jumpYaw = 0;
  private crouchStarted: number | null = null;
  private launchCrouch = 0;
  private jumpRetryAt = 0;
  private tadpoleOffsets: { x: number; z: number; due: number }[];
  private evadeAt = [0, 0, 0];
  private interests = new Map<string, { x:number; z:number; until:number }>();

  notice(x:number,z:number,time:number,selected?:string){
    if(!Number.isFinite(x+z+time))return 0;
    const candidates=this.collisionBodies.map(b=>({b,d:Math.hypot(b.pose.x-x,b.pose.z-z)}))
      .filter(v=>selected?v.b.id===selected:v.d<2.7).sort((a,b)=>a.d-b.d).slice(0,2);
    for(const {b} of candidates){
      const p=b.pose as AnimalPose;p.reaction=1;
      if(selected || !('mode' in p) || (p.mode!=='swim' && b.kind!=='tadpole'))continue;
      const a=Math.atan2(p.z-z,p.x-x),target={x:x+Math.cos(a)*.65,z:z+Math.sin(a)*.65};
      if(!safe(cm(target),this.waterObstacles(b.motion!),worldBounds,12))continue;
      if(b.kind==='tadpole')this.interests.set(b.id,{...target,until:time+4});
      else if(this.route(b.motion!,target))this.turtleWanderAt[b.id==='frog'?2:Number(b.id.slice(-1))]=time+4;
    }
    return candidates.length;
  }

  constructor(seed = 9127, private surface: SurfaceSampler = sampleSurface, private support?: (index:number)=>PadSupport,
    private ground: (x: number, z: number) => number = islandHeight) {
    this.random = seededRandom(seed);
    this.turtleMotion = this.turtles.map(p => new BoatMotion(cm(p))) as [BoatMotion, BoatMotion];
    this.turtleMotion.forEach((motion,i) => { motion.swim = new SwimDrive('turtle', i); });
    this.frogMotion = new BoatMotion(cm(this.frog));
    this.frogMotion.swim = new SwimDrive('frog');
    this.turtleDue = [8 + this.random() * 4, 0];
    this.tadpoles = Array.from({ length: 6 }, (_, i) => {
      const a = this.random() * Math.PI * 2, r = .24 + this.random() * .18;
      return { ...body(this.frog.x + Math.cos(a) * r, this.frog.z + Math.sin(a) * r, -.22 - i % 3 * .045), mode: 'follow' as const };
    });
    this.tadpoleMotion = this.tadpoles.map((p,i) => {
      const motion = new BoatMotion(cm(p));
      motion.swim = new SwimDrive('tadpole', i + 3);
      return motion;
    });
    this.tadpoleOffsets = this.tadpoles.map(() => ({ x: 0, z: 0, due: 0 }));
    this.collisionBodies = [
      ...this.turtles.map((pose, i): PondBody => ({ id: `turtle-${i}`, kind: i ? 'youngTurtle' : 'turtle', pose, motion: this.turtleMotion[i], cores: bodyCores(i ? 'youngTurtle' : 'turtle') })),
      { id: 'frog', kind: 'frog', pose: this.frog, motion: this.frogMotion, cores: bodyCores('frog') },
      ...this.tadpoles.map((pose, i): PondBody => ({ id: `tadpole-${i}`, kind: 'tadpole', pose, motion: this.tadpoleMotion[i], cores: bodyCores('tadpole', i) })),
    ];
  }

  private waterObstacles(motion:BoatMotion){return this.turtleMotion.includes(motion)?turtleObstacles:fishObstacles;}
  private route(motion: BoatMotion, target: { x: number; z: number }, obstacles = this.waterObstacles(motion)) {
    const route = planRoute(motion.position, cm(target), obstacles, worldBounds);
    if (route.length < 2) return false;
    motion.setRoute(route); return true;
  }

  private advance(p: AnimalPose, motion: BoatMotion, dt: number, speed: number, turnRate: number, obstacles = this.waterObstacles(motion)) {
    const arrived = motion.update(dt, speed * 100, obstacles, worldBounds, 2.2, turnRate > 2 ? 5 : 3.4, turnRate);
    p.x = motion.position.x / 100; p.z = motion.position.y / 100;
    p.speed = Math.hypot(motion.velocity.x, motion.velocity.y) / 100;
    p.yaw = -motion.angle;
    motion.swim!.pose(p);
    if (p === this.frog) p.gait = p.swimPhase!;
    else p.gait += dt * 1.35 * Math.min(1, p.speed / .12);
    return arrived || !motion.route.length;
  }

  private wander(p: AnimalPose, motion: BoatMotion, index: number, time: number) {
    if (time < this.turtleWanderAt[index] && motion.route.length) return;
    const obstacles=this.waterObstacles(motion),candidates:{x:number;z:number;score:number}[]=[];
    for (let attempt = 0; attempt < 40; attempt++) {
      const target = { x:(worldBounds.left+65+this.random()*(worldBounds.right-worldBounds.left-130))/100,
        z:(worldBounds.top+65+this.random()*(worldBounds.bottom-worldBounds.top-130))/100 };
      const length=Math.hypot(target.x-p.x,target.z-p.z);
      if(length<2.5||length>10||!safe(cm(target),obstacles,worldBounds,12))continue;
      const familiarity=this.recentWater[index].reduce((sum,q)=>sum+Math.max(0,1-Math.hypot(q.x-target.x,q.z-target.z)/4),0);
      candidates.push({...target,score:this.random()+length*.075-familiarity*.8});
    }
    candidates.sort((a,b)=>b.score-a.score);
    for(const target of candidates)if(this.route(motion,target)){
      this.turtleWanderAt[index]=time+55+this.random()*25;
      this.recentWater[index].push({x:p.x,z:p.z});if(this.recentWater[index].length>3)this.recentWater[index].shift();break;
    }
  }

  private splash(p: AnimalPose, time: number, ripples: RippleField, strength = .35, spray = 0) {
    ripples.emit(p.x, p.z, time, strength, 'fish', -Math.sin(p.yaw), -Math.cos(p.yaw), spray); this.events.splashes++;
  }

  private turtleHeight(p: TurtlePose, index: number, dt: number, time: number) {
    const wave = this.surface(p.x, p.z, time), draft = index ? -.10 : -.13;
    const waterY = draft + wave.height * (index ? .62 : .49);
    const ground = this.turtleGround(p.x, p.z);
    const support = ground + .015;
    let lift = this.turtleLift[index] + (53 * (waterY - p.y) - 13.4 * this.turtleLift[index]) * dt;
    const projected = p.y + lift * dt;
    const y = Math.max(projected, support);
    if (y > projected) lift = 0;
    if (this.collisionBodies[index].canSetHeight?.(y) !== false) {
      p.y = y; this.turtleLift[index] = lift;
    } else {
      this.turtleLift[index] = 0;
    }
    p.groundContact = smooth((Math.min(p.y, ground) - wave.height - .032) / .110);
    const aheadX = p.x - Math.sin(p.yaw) * .10, aheadZ = p.z - Math.cos(p.yaw) * .10;
    const slope = Math.atan2(Math.max(waterY, this.turtleGround(aheadX, aheadZ) + .015) - Math.max(waterY, support), .10)
      + (-wave.dx * Math.sin(p.yaw) - wave.dz * Math.cos(p.yaw)) * (1-p.groundContact) * .57;
    const stroke = (p.swimPower ?? 0) * Math.sin((p.swimPhase ?? 0) * 2 - .8) * .062 * (1 - p.groundContact);
    p.pitch += (Math.max(-.35, Math.min(.35, slope + stroke)) - p.pitch) * (1 - Math.exp(-dt * 5));
  }

  private turtleGround(x: number, z: number) {
    const height = islandHeight(x, z);
    return height > -.18 && this.ground !== islandHeight ? this.ground(x, z) : height;
  }

  private moveTurtle(p: TurtlePose, index: number, dt: number, speed: number, obstacles = turtleObstacles) {
    const motion = this.turtleMotion[index];
    motion.swim!.ground = p.groundContact ?? 0;
    return this.advance(p, motion, dt, speed, index ? 1.48 : 1.35, obstacles);
  }

  private evade(p: AnimalPose, motion: BoatMotion, index: number, time: number, boat: Point) {
    const dx = p.x - boat.x / 100, dz = p.z - boat.y / 100, d = Math.hypot(dx, dz);
    if (d > 1.25 || time < this.evadeAt[index]) return;
    this.evadeAt[index] = time + 2;
    const target = { x: p.x + dx / Math.max(d, .01) * 1.8, z: p.z + dz / Math.max(d, .01) * 1.8 };
    if (safe(cm(target), this.waterObstacles(motion), worldBounds, 10)) this.route(motion, target);
  }

  private updateTurtles(dt: number, time: number, ripples: RippleField, boat: Point) {
    const [big, small] = this.turtles, [bm, sm] = this.turtleMotion;
    if (big.mode === 'swim') {
      this.wander(big, bm, 0, time); this.evade(big, bm, 0, time, boat);
      if (time >= this.turtleDue[0]) {
        const angle = Math.PI * (.35 + this.random() * .30);
        this.bay = { x: animalIsland.x + Math.cos(angle) * animalIsland.rx * 1.65, z: animalIsland.z + Math.sin(angle) * animalIsland.rz * 1.65 };
        this.beach = { x: animalIsland.x + Math.cos(angle) * animalIsland.rx * .28, z: animalIsland.z + Math.sin(angle) * animalIsland.rz * .28 };
        if (this.route(bm, this.bay)) { big.mode = 'shore'; this.rideFinished = false; }
      }
    }
    if (big.mode === 'swim' || big.mode === 'shore') {
      const arrived = this.moveTurtle(big, 0, dt, .22);
      if (arrived && big.mode === 'shore' && this.route(bm,this.beach,turtleLandObstacles))big.mode='climb';
    } else if (big.mode === 'climb') {
      if (this.moveTurtle(big, 0, dt, .12, turtleLandObstacles)) {
        big.mode = 'bask'; big.speed = 0; this.turtleDue[0] = time + 14 + this.random() * 10; this.events.landings++;
      }
    } else if (big.mode === 'bask') {
      big.speed *= Math.exp(-dt * 5);
      const boarding=['climb','climbBack','ride','dismount'].includes(small.mode);
      if (time > this.turtleDue[0] && (this.rideFinished||(!boarding&&time>this.turtleDue[0]+65))) {
        if(this.route(bm,this.bay,turtleLandObstacles)){big.mode='leave';this.rideFinished=true;}
      }
    } else if (big.mode === 'leave' && this.moveTurtle(big, 0, dt, .15, turtleLandObstacles)) {
      big.mode = 'swim'; this.turtleDue[0] = time + 65 + this.random() * 45; this.turtleWanderAt[0] = 0; this.splash(big, time, ripples);
    }
    this.turtleHeight(big, 0, dt, time);

    if(small.mode==='follow'&&(big.mode==='swim'||big.mode==='leave')){
      small.mode='swim';sm.route=[];this.turtleWanderAt[1]=0;
    }
    if (small.mode === 'swim') {
      this.wander(small, sm, 1, time); this.evade(small, sm, 1, time, boat);
      if ((big.mode === 'shore' || big.mode === 'climb' || big.mode === 'bask') && !this.rideFinished) {
        if (this.route(sm, this.bay)) small.mode = 'follow';
      }
    }
    if (small.mode === 'swim' || small.mode === 'follow') {
      if (this.moveTurtle(small, 1, dt, small.mode === 'follow' ? .28 : .24) && small.mode === 'follow') {
        if(big.mode==='bask'){
          const behind = { x: big.x + Math.sin(big.yaw) * .68, z: big.z + Math.cos(big.yaw) * .68 };
          if (this.route(sm, behind, turtleLandObstacles)) small.mode = 'climb';
        }else{
          // While the adult climbs, circle through nearby open water instead
          // of waiting motionless at the rendezvous for almost a minute.
          const a=Math.atan2((this.bay.z-animalIsland.z)/animalIsland.rz,(this.bay.x-animalIsland.x)/animalIsland.rx);
          for(const offset of [(this.random()-.5)*.9,.5,-.5,0]){
            const target=habitatPoint(Math.cos(a+offset)*animalIsland.rx*1.95,Math.sin(a+offset)*animalIsland.rz*1.95);
            if(Math.hypot(target.x-small.x,target.z-small.z)>.45&&safe(cm(target),turtleObstacles,worldBounds,8)&&this.route(sm,target))break;
          }
        }
      }
    } else if (small.mode === 'climb') {
      if (this.moveTurtle(small, 1, dt, .14, turtleLandObstacles)) {
        const landing = { x: big.x + Math.sin(big.yaw) * .07 * lifeScale, y: big.y + turtleBackHeight, z: big.z + Math.cos(big.yaw) * .07 * lifeScale };
        if (this.collisionBodies[1].canFollowArc?.(landing, .025) === false) return;
        this.events.landings++;
        this.smallStart = { x: small.x, y: small.y, z: small.z };
        this.smallEnd = landing;
        this.smallStarted = time; small.mode = 'climbBack';
      }
    } else if (small.mode === 'climbBack' || small.mode === 'dismount') {
      const climbing = small.mode === 'climbBack', duration = climbing ? 3.6 : 3.2, t = Math.min(1, (time - this.smallStarted) / duration), e = smooth(t);
      small.x = this.smallStart.x + (this.smallEnd.x - this.smallStart.x) * e;
      small.z = this.smallStart.z + (this.smallEnd.z - this.smallStart.z) * e;
      small.y = this.smallStart.y + (this.smallEnd.y - this.smallStart.y) * e + Math.sin(Math.PI * t) * .025;
      small.yaw += angleDelta(big.yaw, small.yaw) * (1 - Math.exp(-dt * 3));
      small.pitch = Math.sin(Math.PI * t) * (climbing ? .35 : -.28); small.speed = .10 * Math.sin(Math.PI * t); small.gait += dt * 2.8;
      if (t >= 1) {
        small.pitch = 0; small.speed = 0;
        sm.position = cm(small); sm.velocity = { x: 0, y: 0 }; sm.angle = -small.yaw;
        if (climbing) { small.mode = 'ride'; this.turtleDue[1] = time + 7 + this.random() * 7; this.events.rides++; }
        else { small.mode = 'leave'; this.rideFinished = true; this.route(sm, this.bay, turtleLandObstacles); }
      }
    } else if (small.mode === 'ride') {
      small.y = big.y + turtleBackHeight; small.speed = 0;
      if (time > this.turtleDue[1]) {
        const x = big.x + Math.sin(big.yaw) * .74, z = big.z + Math.cos(big.yaw) * .74;
        const landing = { x, z, y: Math.max(-.10, this.turtleGround(x, z) + .015) };
        if (this.collisionBodies[1].canFollowArc?.(landing, .025) === false) return;
        this.smallStart = { x: small.x, y: small.y, z: small.z }; this.smallEnd = landing;
        this.smallStarted = time; small.mode = 'dismount';
      }
    } else if (small.mode === 'leave' && this.moveTurtle(small, 1, dt, .22, turtleLandObstacles)) {
      small.mode = 'swim'; this.turtleWanderAt[1] = 0; this.splash(small, time, ripples, .23);
    }
    if (!['climbBack', 'ride', 'dismount'].includes(small.mode)) this.turtleHeight(small, 1, dt, time);
  }

  private choosePad() {
    // Prefer nearby reachable pads, with enough variation to avoid a fixed itinerary.
    const candidates = lilyPads.map((p, i) => ({ i, score: Math.hypot(p.x - this.frog.x, p.z - this.frog.z) * (.65 + this.random()) }))
      .filter(p => p.i !== this.frog.padIndex).sort((a, b) => a.score - b.score);
    this.frogTarget = candidates[Math.floor(this.random() * Math.min(4, candidates.length))].i;
  }

  private approachPad() {
    const pad = lilyPads[this.frogTarget], p = this.frog;
    const approach = frogWaterLanding(pad, p, pad.radius + .22);
    if (approach && this.route(this.frogMotion, approach)) p.mode = 'approach';
  }

  private padSupport(index:number,time:number) {
    const pad=lilyPads[index];
    return this.support?.(index)??{...pad,height:padSurfaceHeight(this.surface(pad.x,pad.z,time).height,true),dx:0,dz:0};
  }

  private beginJump(to: XYZ, landing: 'rest' | 'swim', time: number, ripples: RippleField) {
    const p = this.frog;
    if (time < this.jumpRetryAt) return;
    if (this.collisionBodies[2].canFollowArc?.(to, .48) === false) {
      this.jumpRetryAt = time + 1; this.crouchStarted = null; this.choosePad();
      if (p.mode === 'approach') { p.mode = 'swim'; this.frogDue = time + 1; }
      return;
    }
    this.jumpFrom = { x: p.x, y: p.y, z: p.z }; this.jumpTo = to;
    this.jumpStarted = time; this.jumpDuration = .80 + Math.hypot(p.x - to.x, p.z - to.z) * .13;
    this.jumpLanding = landing; p.mode = 'jump'; p.jump = 0; this.events.frogJumps++;
    this.launchCrouch = p.crouch ?? 0; this.crouchStarted = null;
    this.jumpYaw = Math.atan2(p.x - to.x, p.z - to.z);
    this.frogMotion.velocity = { x: 0, y: 0 };
    if (this.jumpFrom.y < 0) this.splash(p, time, ripples, .28, .34);
  }

  private updateFrog(dt: number, time: number, ripples: RippleField, boat: Point) {
    const p = this.frog;
    if (p.mode === 'swim') {
      this.wander(p,this.frogMotion,2,time);
      if (time >= this.frogDue) { this.choosePad(); this.approachPad(); }
    }
    if (p.mode === 'swim' || p.mode === 'approach') {
      // Avoid approaching the hull; a landing attempt can wait for open water.
      this.evade(p, this.frogMotion, 2, time, boat);
      const arrived = this.advance(p, this.frogMotion, dt, .43, 2.05);
      const kick = frogStroke(p.gait).extension, activity = Math.min(1,p.speed/.24);
      const targetY = -.10 + (.024 * kick - .011) * activity;
      if (this.collisionBodies[2].canSetHeight?.(targetY) !== false) p.y += (targetY - p.y) * (1 - Math.exp(-dt * 10));
      p.pitch += ((kick * .16 - .046) * activity - p.pitch) * (1 - Math.exp(-dt * 9));
      if (arrived && p.mode === 'approach') {
        const pad = lilyPads[this.frogTarget];
        const support=this.padSupport(this.frogTarget,time);
        if (Math.hypot(p.x - pad.x, p.z - pad.z) < pad.radius + .34 && clearSegment(cm(p), cm(support), fishObstacles, worldBounds)) {
          this.crouchStarted ??= time;
          p.crouch = smooth((time - this.crouchStarted) / .23);
          const aim = Math.atan2(p.x - support.x, p.z - support.z);
          p.yaw += Math.max(-3 * dt, Math.min(3 * dt, angleDelta(aim, p.yaw)));
          this.frogMotion.angle = -p.yaw;
          if (p.crouch >= 1) this.beginJump({ x: support.x, y: support.height - frogFootHeight, z: support.z }, 'rest', time, ripples);
        } else { this.crouchStarted = null; this.approachPad(); }
      } else {
        this.crouchStarted = null;
        p.crouch = (p.crouch ?? 0) * Math.exp(-dt * 12);
      }
    } else if (p.mode === 'jump') {
      const t = Math.min(1, (time - this.jumpStarted) / this.jumpDuration);
      if (this.jumpLanding === 'rest') {
        const support=this.padSupport(this.frogTarget,time);
        this.jumpTo={x:support.x,y:support.height-frogFootHeight,z:support.z};
      }
      p.jump = t; p.x = this.jumpFrom.x + (this.jumpTo.x - this.jumpFrom.x) * t;
      p.crouch = this.launchCrouch * (1 - smooth(t / .18));
      p.z = this.jumpFrom.z + (this.jumpTo.z - this.jumpFrom.z) * t;
      p.y = this.jumpFrom.y + (this.jumpTo.y - this.jumpFrom.y) * t + Math.sin(t * Math.PI) * .48;
      p.yaw += Math.max(-3 * dt, Math.min(3 * dt, angleDelta(this.jumpYaw, p.yaw)));
      p.pitch = Math.sin(t * Math.PI * 2) * .38; p.speed = .6; p.gait += dt * 3;
      if (t >= 1) {
        p.mode = this.jumpLanding; p.pitch = 0; p.speed = 0; p.jump = 0;
        this.frogMotion.position = cm(p); this.frogMotion.velocity = { x: 0, y: 0 }; this.frogMotion.route = []; this.frogMotion.angle = -p.yaw;
        if (p.mode === 'rest') { p.padIndex = this.frogTarget; this.frogDue = time + 5 + this.random() * 10; this.choosePad(); }
        else { p.padIndex = -1; this.frogDue = time + 24 + this.random() * 20; this.turtleWanderAt[2]=0;this.splash(p, time, ripples, .38, .46); }
      }
    } else if (p.mode === 'rest') {
      const support=this.padSupport(p.padIndex,time);
      p.x=support.x;p.z=support.z;p.y=support.height-frogFootHeight;this.frogMotion.position=cm(p);
      p.crouch = smooth((time - this.frogDue + .26) / .26);
      const bx = p.x - boat.x / 100, bz = p.z - boat.y / 100, boatDistance = Math.hypot(bx, bz);
      if (boatDistance < 1.25) {
        const reach = lilyPads[p.padIndex].radius + .27;
        const away = frogWaterLanding(p, { x: p.x + (boatDistance > .01 ? bx : 1), z: p.z + bz }, reach);
        if (away) { this.beginJump(away, 'swim', time, ripples); return; }
      }
      const next = lilyPads[this.frogTarget];
      p.yaw += Math.max(-.8 * dt, Math.min(.8 * dt, angleDelta(Math.atan2(p.x - next.x, p.z - next.z), p.yaw)));
      if (time >= this.frogDue) {
        const reach = lilyPads[p.padIndex].radius + .27;
        const landing = frogWaterLanding(p, lilyPads[this.frogTarget], reach);
        if (landing) this.beginJump(landing, 'swim', time, ripples);
        else { this.choosePad(); this.frogDue = time + 1; }
      }
    }
  }

  private updateTadpoles(dt: number, time: number) {
    this.tadpoles.forEach((p, i) => {
      const offset = this.tadpoleOffsets[i], motion = this.tadpoleMotion[i];
      if (time >= offset.due) {
        const a = this.random() * Math.PI * 2, radius = .22 + this.random() * .35;
        offset.x = Math.cos(a) * radius; offset.z = Math.sin(a) * radius; offset.due = time + 1.6 + this.random() * 2.8;
      }
      let x = this.frog.x + offset.x, z = this.frog.z + offset.z;
      const interest=this.interests.get(`tadpole-${i}`);
      if(interest){x=interest.x+offset.x*.3;z=interest.z+offset.z*.3;}
      // A tadpole can gather at a leaf's edge, but cannot follow a frog onto dry ground.
      if (islandRadius(x, z) < 1.45) {
        const a = Math.atan2((z - animalIsland.z) / animalIsland.rz, (x - animalIsland.x) / animalIsland.rx);
        x = animalIsland.x + Math.cos(a) * animalIsland.rx * 1.45; z = animalIsland.z + Math.sin(a) * animalIsland.rz * 1.45;
      }
      for (let j = 0; j < this.tadpoles.length; j++) if (i !== j) {
        const other = this.tadpoles[j], dx = p.x - other.x, dz = p.z - other.z, d = Math.hypot(dx, dz);
        if (d < .15 && d > .001) { x += dx / d * (.15 - d); z += dz / d * (.15 - d); }
      }
      let target = { x, z };
      if (!safe(cm(target), fishObstacles, worldBounds)) {
        // Keep pace with the frog when the preferred side of the group is inside a bank.
        const frog = this.frog;
        const waterSide = { x: frog.x + (frog.x - x) * .5, z: frog.z + (frog.z - z) * .5 };
        target = safe(cm(waterSide), fishObstacles, worldBounds) ? waterSide : frog;
      }
      const currentGoal = motion.route.at(-1);
      const goal = cm(target);
      if ((!currentGoal || distance(currentGoal, goal) > 8) && safe(goal, fishObstacles, worldBounds)) {
        this.route(motion, target);
      }
      this.advance(p, motion, dt, .70 + i * .013, 4.2);
      p.y = -.24 - (i % 3) * .035 + Math.sin(time * 1.5 + i) * .015;
      p.pitch = Math.sin(time * 1.7 + i) * .04;
    });
  }

  update(dt: number, time: number, ripples: RippleField, boat: Point) {
    if (dt <= 0) return;
    for(const b of this.collisionBodies){const p=b.pose as AnimalPose;if(p.reaction!==undefined)p.reaction*=Math.exp(-dt*1.2);}
    for(const [id,interest] of this.interests)if(time>=interest.until)this.interests.delete(id);
    const steps = Math.max(1, Math.ceil(dt * 60)), step = dt / steps;
    for (let n = 0; n < steps; n++) {
      const t = time - dt + (n + 1) * step;
      this.updateTurtles(step, t, ripples, boat);
      this.updateFrog(step, t, ripples, boat);
      this.updateTadpoles(step, t);
    }
  }
}
