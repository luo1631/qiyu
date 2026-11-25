import { Bone, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { TurtlePose } from './habitat-life';

type GroundHeight = (x: number, z: number) => number;
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const smooth = (x: number) => { const t=clamp(x,0,1); return t*t*(3-2*t); };
const turn = (from: number, to: number) => Math.atan2(Math.sin(to-from), Math.cos(to-from));
const flat = new Vector3(0, 1, 0);

export interface TurtleLeg {
  hip: Group;
  lower: Bone;
  foot: Bone;
  side: number;
  rear: boolean;
}

function articulatedLeg(leg: TurtleLeg) {
  const upper = leg.lower.position.clone(), lower = leg.foot.position.clone();
  const axis = upper.clone().add(lower).normalize();
  const bend = upper.clone().addScaledVector(axis, -upper.dot(axis)).normalize();
  const sole = new Vector3(leg.side*.026, -.020, (leg.rear ? 1 : -1)*.025);
  const phase = leg.side < 0 ? (leg.rear ? .74 : 0) : (leg.rear ? .24 : .50);
  return { ...leg, upperAxis: upper.clone().normalize(), lowerAxis: lower.clone().normalize(), a: upper.length(), b: lower.length(),
    bend, sole, phase, planted: new Vector3(), landing: new Vector3(), target: new Vector3(),
    groundNormal: new Vector3(), landingNormal: new Vector3(), normal: new Vector3(),
    heading: 0, nextHeading: 0, facing: 0, swinging: false };
}

/** Positions are in pond metres. A planted sole keeps its world position
 * while the shoulder and elbow follow the moving shell. */
export function makeTurtleSteps(root: Group, legs: TurtleLeg[]) {
  const rigs = legs.map(articulatedLeg);
  const inverse = new Quaternion(), footWorld = new Quaternion(), upper = new Quaternion(), lower = new Quaternion();
  const ankle = new Quaternion(), intoHip = new Quaternion(), intoShin = new Quaternion();
  const basis = new Matrix4();
  const right = new Vector3(), forward = new Vector3(), offset = new Vector3();
  const goal = new Vector3(), hipAt = new Vector3(), aim = new Vector3(), bend = new Vector3(), knee = new Vector3();
  const from = new Vector3();
  let lastTime = -Infinity, previousYaw = 0, progress = 0, active = false, basking = false;

  function place(rig: ReturnType<typeof articulatedLeg>, p: TurtlePose, yaw: number, stride: number,
    at: Vector3, normal: Vector3, ground: GroundHeight) {
    const scale = root.scale.x, side = rig.side * .316 * scale;
    const length = (rig.rear ? .306 : -.306) * scale - stride;
    const c=Math.cos(yaw), s=Math.sin(yaw);
    at.x = p.x + side * c + length * s;
    at.z = p.z - side * s + length * c;
    at.y = ground(at.x, at.z) + .001;
    const h = .026 * scale / .75;
    normal.set(ground(at.x-h,at.z)-ground(at.x+h,at.z), 2*h,
      ground(at.x,at.z-h)-ground(at.x,at.z+h)).normalize();
  }

  function solve(rig: ReturnType<typeof articulatedLeg>, weight: number) {
    const {hip, foot} = rig, scale = root.scale.x;
    right.set(Math.cos(rig.facing),0,-Math.sin(rig.facing));
    right.addScaledVector(rig.normal, -right.dot(rig.normal)).normalize();
    forward.crossVectors(right, rig.normal);
    footWorld.setFromRotationMatrix(basis.makeBasis(right,rig.normal,forward));
    offset.copy(rig.sole).applyQuaternion(footWorld).multiplyScalar(scale);
    goal.copy(rig.target).sub(offset).sub(root.position).applyQuaternion(inverse).divideScalar(scale);

    const edge = rig.a + rig.b - .0006;
    hipAt.set(rig.side*.215, .08, (rig.rear ? 1 : -1)*.235);
    const horizontal = (goal.x-hipAt.x)**2 + (goal.z-hipAt.z)**2;
    const vertical = Math.sqrt(Math.max(0, edge**2-horizontal));
    hipAt.y = clamp(clamp(hipAt.y, goal.y-vertical, goal.y+vertical), .015, .113);
    aim.subVectors(goal,hipAt);
    const length=aim.length();
    if (length < .0001) return;
    aim.multiplyScalar(1/length);
    const reach = clamp(length, Math.abs(rig.a-rig.b)+.001,edge);
    const along = (rig.a**2-rig.b**2+reach**2)/(2*reach);
    bend.copy(rig.bend).addScaledVector(aim, -rig.bend.dot(aim)).normalize();
    knee.copy(aim).multiplyScalar(along).addScaledVector(bend,Math.sqrt(Math.max(0,rig.a**2-along**2)));
    upper.setFromUnitVectors(rig.upperAxis,offset.copy(knee).normalize());
    intoHip.copy(upper).invert();
    offset.copy(aim).multiplyScalar(reach).sub(knee).normalize().applyQuaternion(intoHip);
    lower.setFromUnitVectors(rig.lowerAxis,offset);
    ankle.copy(intoShin.copy(lower).invert()).multiply(intoHip).multiply(inverse).multiply(footWorld);
    hip.position.lerp(hipAt,weight);
    hip.quaternion.slerp(upper,weight);
    rig.lower.quaternion.slerp(lower,weight);
    foot.quaternion.slerp(ankle,weight);
  }

  return { update(p: TurtlePose, time: number, ground: GroundHeight, weight: number) {
    if (weight <= 0) { active=false; return; }
    const scale = root.scale.x / .75, isRest = p.mode === 'bask';
    const dt = time-lastTime;
    const first = !active || dt < 0 || dt > .20;
    const yawDelta = first ? 0 : turn(previousYaw,p.yaw);
    const distance = first ? 0 : Math.hypot(p.x-from.x,p.z-from.z,yawDelta*.235*scale);
    if (first) progress=0;
    if (!isRest) progress += distance / (.103 * scale);
    const heading = p.yaw + (dt>0 ? clamp(yawDelta/dt*.16,-.14,.14) : 0);
    inverse.copy(root.quaternion).invert();
    for (const rig of rigs) {
      if (first) {
        place(rig,p,p.yaw,0,rig.planted,rig.groundNormal,ground);
        rig.target.copy(rig.planted); rig.normal.copy(rig.groundNormal);
        rig.heading=p.yaw; rig.facing=p.yaw; rig.swinging=false;
      }
      if (isRest) {
        if (!basking || first) {
          rig.planted.copy(rig.target);
          rig.planted.y=ground(rig.planted.x,rig.planted.z)+.001;
          rig.groundNormal.copy(rig.normal); rig.heading=rig.facing; rig.swinging=false;
        }
        rig.target.lerp(rig.planted, first ? 1 : Math.min(1,Math.max(0,dt)*12));
        rig.normal.copy(rig.groundNormal);
      } else {
        const phase = (progress+rig.phase)%1;
        const swing = phase >= .67;
        if (swing && !rig.swinging) {
          place(rig,p,heading,.035*scale*clamp(p.speed/.12,0,1),rig.landing,rig.landingNormal,ground);
          rig.nextHeading=heading;
        } else if (!swing && rig.swinging) {
          rig.planted.copy(rig.landing); rig.groundNormal.copy(rig.landingNormal); rig.heading=rig.nextHeading;
        }
        rig.swinging=swing;
        const t = swing ? (phase-.67)/.33 : 0, ease=smooth(t);
        rig.target.copy(rig.planted).lerp(rig.landing,ease);
        rig.target.y+=.036*scale*Math.sin(Math.PI*t)**1.3;
        rig.normal.copy(rig.groundNormal).lerp(rig.landingNormal,ease).normalize();
        if (rig.normal.lengthSq() < .25) rig.normal.copy(flat);
        rig.facing=rig.heading+turn(rig.heading,rig.nextHeading)*ease;
      }
      solve(rig,weight);
    }
    active=true; basking=isRest; lastTime=time; previousYaw=p.yaw; from.set(p.x,0,p.z);
  }};
}
