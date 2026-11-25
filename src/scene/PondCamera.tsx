import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, MOUSE, TOUCH, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Point } from '../config/islands';
import { pondFraming } from './world-layout';

type Props = {
  interactive: boolean;
  reduced: boolean;
  label?: string;
  reset?: number;
  focus?: PondView;
  getBoatPose: () => { position: Point; angle: number } | null;
  onChange?: (awayFromOverview: boolean) => void;
  onRide?: (active: boolean) => void;
  onFramed?: () => void;
};

export type PondCameraTarget = {
  lookAt: [number, number, number];
  offset: [number, number, number];
};
export type PondView = PondCameraTarget | { boat: true };

type CameraMove = {
  from: Vector3; to: Vector3;
  fromTarget: Vector3; toTarget: Vector3;
  fromFov: number; toFov: number;
  started: number;
};

type RetainedView = { target: Vector3; offset: Vector3; fit: number; aboard: boolean };
const up = new Vector3(0, 1, 0);

export function PondCamera({ interactive, reduced, label, reset, focus, getBoatPose, onChange, onRide, onFramed }: Props) {
  const { camera, gl, size, invalidate } = useThree();
  const rig = useRef<{ go: (target?: PondView) => void; advance: (dt: number) => void }>(null);
  const retained = useRef<RetainedView | null>(null);
  const skipMotion = useRef(reduced);
  skipMotion.current = reduced;

  useEffect(() => {
    const view = camera as PerspectiveCamera;
    const canvas = gl.domElement;
    const { position, fov } = pondFraming(size.width, size.height);
    const centre = new Vector3(0, .5, 0);
    const portrait = size.width < size.height * .82;
    const rideFov = portrait ? 55 : 51;
    const rideFit = MathUtils.clamp(.77 / view.aspect, 1, 1.75);
    // On a phone the outer bays extend into the pannable area, giving the
    // four islands and the central channel more of the initial viewport.
    view.position.set(position[0], portrait ? centre.y + (position[1]-centre.y)*.82 : position[1],
      portrait ? position[2]*.72 : position[2]);
    view.fov = fov;
    view.lookAt(centre);
    view.updateProjectionMatrix();
    view.updateMatrixWorld();
    onFramed?.();
    invalidate();
    if (!interactive) return;

    const orbit = new OrbitControls(view, canvas);
    const overview = view.position.clone();
    const overviewDistance = overview.distanceTo(centre);
    const frameWidth = Math.min(.90, view.aspect) * Math.tan(fov * Math.PI / 360);
    const previous = retained.current;
    const anchor = new Vector3(), shift = new Vector3();
    let aboard = previous?.aboard ?? false;
    let move: CameraMove | null = null;

    const readAnchor = (pose: NonNullable<ReturnType<Props['getBoatPose']>>) =>
      anchor.set(pose.position.x / 100, .62, pose.position.y / 100);
    const setFov = (value: number) => {
      if (view.fov === value) return;
      view.fov = value;
      view.updateProjectionMatrix();
    };
    const configure = () => {
      orbit.minPolarAngle = aboard ? .83 : .29;
      orbit.maxPolarAngle = aboard ? 1.445 : .98;
      orbit.minAzimuthAngle = aboard ? -Infinity : -.94;
      orbit.maxAzimuthAngle = aboard ? Infinity : .94;
      orbit.minDistance = aboard ? 2.65 * Math.sqrt(rideFit) : Math.min(4.85, overviewDistance * .36);
      orbit.maxDistance = aboard ? 6.65 * Math.sqrt(rideFit) : overviewDistance;
      orbit.enablePan = !aboard;
      orbit.rotateSpeed = aboard ? .62 : 1;
      orbit.zoomToCursor = !aboard;
      orbit.mouseButtons = { LEFT: null, MIDDLE: aboard ? null : MOUSE.PAN, RIGHT: aboard ? MOUSE.ROTATE : MOUSE.PAN };
      orbit.touches = { ONE: null, TWO: aboard ? TOUCH.DOLLY_ROTATE : TOUCH.DOLLY_PAN };
      orbit.maxTargetRadius = aboard ? Infinity : 10;
    };
    orbit.screenSpacePanning = false;
    orbit.cursor.copy(centre);
    orbit.target.copy(centre);
    const initialBoat = aboard ? getBoatPose() : null;
    if (previous?.aboard && initialBoat) {
      orbit.target.copy(readAnchor(initialBoat));
      view.position.copy(anchor).addScaledVector(previous.offset, rideFit / previous.fit);
      setFov(rideFov);
    } else if (previous) {
      aboard = false;
      orbit.target.copy(previous.target);
      view.position.copy(previous.target).addScaledVector(previous.offset, previous.fit / frameWidth);
    }
    configure();
    orbit.update();
    const isAway = () => aboard || orbit.target.distanceToSquared(centre) > .005 || view.position.distanceToSquared(overview) > .008;
    let away = isAway();
    onChange?.(away);
    const publishMode = () => {
      canvas.dataset.pondView = aboard ? 'boat' : 'pond';
      onRide?.(aboard);
    };
    publishMode();
    const update = () => {
      const next = isAway();
      if (next !== away) { away = next; onChange?.(away); }
      invalidate();
    };
    const cancel = () => {
      if (!move) return;
      move = null;
      // Dragging during the transition should pick up from the frame on screen.
      const offset = new Vector3().subVectors(view.position, orbit.target);
      const radius = offset.length(), azimuth = Math.atan2(offset.x, offset.z);
      const polar = Math.acos(MathUtils.clamp(offset.y / Math.max(radius, .01), -1, 1));
      orbit.minDistance = Math.min(orbit.minDistance, radius);
      orbit.maxDistance = Math.max(orbit.maxDistance, radius);
      orbit.minPolarAngle = Math.min(orbit.minPolarAngle, polar);
      orbit.maxPolarAngle = Math.max(orbit.maxPolarAngle, polar);
      orbit.minAzimuthAngle = Math.min(orbit.minAzimuthAngle, azimuth);
      orbit.maxAzimuthAngle = Math.max(orbit.maxAzimuthAngle, azimuth);
    };
    const go = (detail?: PondView) => {
      const target = centre.clone(), destination = overview.clone();
      if (detail && 'boat' in detail) {
        const pose = getBoatPose();
        if (!pose) return;
        target.copy(readAnchor(pose));
        destination.set(-2.35, .50, 2.58).applyAxisAngle(up, -pose.angle).multiplyScalar(rideFit).add(target);
        aboard = true;
      } else {
        aboard = false;
        if (detail) {
          target.set(...detail.lookAt);
          destination.set(...detail.offset).multiplyScalar(Math.max(1, .72 / view.aspect)).add(target);
        }
      }
      configure();
      publishMode();
      move = { from: view.position.clone(), to: destination, fromTarget: orbit.target.clone(), toTarget: target,
        fromFov: view.fov, toFov: aboard ? rideFov : fov, started: performance.now() };
      if (skipMotion.current) advance(0);
      update();
    };
    const advance = (dt: number) => {
      const pose = aboard ? getBoatPose() : null;
      if (pose) {
        // Follow the hull's position while keeping the horizon and the user's gaze steady.
        const follow = skipMotion.current ? 1 : 1 - Math.exp(-Math.min(dt, .08) * 8.5);
        shift.set(pose.position.x / 100 - anchor.x, 0, pose.position.y / 100 - anchor.z).multiplyScalar(follow);
        anchor.add(shift);
      } else shift.set(0, 0, 0);
      if (move) {
        move.to.add(shift);
        move.toTarget.add(shift);
        const t = skipMotion.current ? 1 : Math.min(1, (performance.now() - move.started) / 730);
        const blend = t * t * (3 - 2 * t);
        view.position.lerpVectors(move.from, move.to, blend);
        orbit.target.lerpVectors(move.fromTarget, move.toTarget, blend);
        view.lookAt(orbit.target);
        setFov(MathUtils.lerp(move.fromFov, move.toFov, blend));
        if (t === 1) {
          move = null;
          orbit.update();
        }
        update();
      } else if (shift.lengthSq() > 0) {
        view.position.add(shift);
        orbit.target.add(shift);
        orbit.update();
      }
    };
    rig.current = { go, advance };
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      switch (event.key) {
        case '+': case '=': cancel(); orbit.dollyIn(.80); break;
        case '-': cancel(); orbit.dollyOut(.80); break;
        case '0': go(); break;
        case 'ArrowUp': cancel(); if (aboard) orbit.rotateUp(.10); else orbit.pan(0, 36); break;
        case 'ArrowDown': cancel(); if (aboard) orbit.rotateUp(-.10); else orbit.pan(0, -36); break;
        case 'ArrowLeft': cancel(); if (aboard) orbit.rotateLeft(.16); else orbit.pan(36, 0); break;
        case 'ArrowRight': cancel(); if (aboard) orbit.rotateLeft(-.16); else orbit.pan(-36, 0); break;
        case 'q': case 'Q': cancel(); orbit.rotateLeft(.16); break;
        case 'e': case 'E': cancel(); orbit.rotateLeft(-.16); break;
        default: return;
      }
      event.preventDefault();
    };
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', label ?? '');
    canvas.setAttribute('aria-describedby', 'pond-keyboard');
    canvas.addEventListener('keydown', key);
    orbit.addEventListener('change', update);
    orbit.addEventListener('start', cancel);
    return () => {
      const target = move?.toTarget ?? orbit.target, destination = move?.to ?? view.position;
      retained.current = isAway() && (aboard || destination.distanceToSquared(overview) > .008)
        ? { target: target.clone(), offset: destination.clone().sub(target), fit: aboard ? rideFit : frameWidth, aboard }
        : null;
      canvas.removeEventListener('keydown', key);
      orbit.removeEventListener('change', update);
      orbit.removeEventListener('start', cancel);
      orbit.dispose();
      rig.current = null;
    };
  }, [camera, gl, size.width, size.height, interactive, label, getBoatPose, invalidate, onChange, onRide, onFramed]);

  useEffect(() => {
    if (reset) rig.current?.go();
  }, [reset]);
  useEffect(() => {
    if (focus) rig.current?.go(focus);
  }, [focus]);

  useFrame((_, dt) => rig.current?.advance(dt));
  return null;
}
