import {
  BufferGeometry, CanvasTexture, Color, DirectionalLight, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, Line, MathUtils, Mesh, MOUSE,
  NeutralToneMapping, OrthographicCamera, PCFShadowMap, Points, Raycaster, Scene, ShaderMaterial, SkinnedMesh,
  Spherical, Sprite, SpriteMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makePondPavilion } from '../scene/PondPavilion';
import { makePondSwan } from '../scene/PondSwan';
import { makeCottage, makeShoreStructures } from './cottage';
import { makeFishSchool } from './fish';
import type { FishingPose } from './fishing-rules';
import { emptyPose, swanCircuit } from './habitat-motion';
import { makePlanting } from './planting';
import { makeRocks } from './rocks';
import { makeShoreLife } from './shore-life';
import { makeSkiff } from './skiff';
import { fishingSeat, groundHeight, islandPoint, lakeLevel, makeTerrain, occupiedGround, pavilionSite, seeded } from './terrain';
import { makeIslandTrees } from './trees';
import { lakeReflectionLayer, makeWater } from './water';

export interface IslandTone { night: number; twilight: number }
export type Placement = 'tree' | 'stone';
export type FishingAction = 'cast' | 'reel';
export interface IslandScene {
  setTone: (tone: IslandTone) => void;
  setPlacement: (tool: Placement | null) => void;
  setFishing: (pose: FishingPose) => void;
  reset: () => void;
  dispose: () => void;
}

function makeClouds() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const context = canvas.getContext('2d')!;
  const random = seeded(475);
  for (let i = 0; i < 48; i++) {
    const x = 32 + random() * 192, y = 56 + (random() - .5) * 38;
    const radius = 9 + random() * 25;
    context.save();
    context.translate(x, y);
    context.scale(1.1 + random() * .53, .54 + random() * .42);
    const blur = context.createRadialGradient(0, 0, radius * .15, 0, 0, radius);
    blur.addColorStop(0, 'rgba(255,252,239,0.43)');
    blur.addColorStop(.58, 'rgba(248,249,243,0.23)');
    blur.addColorStop(1, 'rgba(230,242,251,0)');
    context.fillStyle = blur;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const root = new Group();
  root.name = '随天色变化的薄云';
  const clouds = [
    [-10.8, .20, -7.5, 6.4], [-.8, 1.4, -9.0, 6.9], [11.4, 1.3, -9.2, 7.2],
    [-13.1, 1.45, 3.5, 7.1], [8.4, 1.9, 8.8, 6.7], [2.7, 2.1, 13.0, 6.8],
    [-8.5, .75, 12.5, 6.0], [12.5, .96, 1.9, 5.4],
  ].map(([x, y, z, size]) => {
    const cloud = new Sprite(material);
    cloud.position.set(x, y, z);
    cloud.scale.set(size, size * .42, 1);
    cloud.renderOrder = -10;
    root.add(cloud);
    return { cloud, x, z };
  });
  return {
    root,
    update(time: number, night: number, twilight: number, eye: Vector3) {
      for (const [index, { cloud, x, z }] of clouds.entries()) {
        cloud.position.x = x + Math.sin(time * .045 + index * .85) * .67;
        cloud.position.z = z + Math.cos(time * .033 + index * .50) * .21;
        cloud.visible = cloud.position.x * eye.x + cloud.position.z * eye.z < 0;
      }
      material.opacity = .70 - night * .38;
      material.color.setRGB(1 - night * .69, 1 - night * .58 - twilight * .10, 1 - night * .39 - twilight * .12);
    },
  };
}

function reflectInLake(root: Object3D) {
  root.traverse(object => object.layers.enable(lakeReflectionLayer));
}

function makeFireflies() {
  const random = seeded(13072);
  const positions: number[] = [], twinkle: number[] = [];
  for (const [u, v, lift = 0] of [
    [-5.23, 2.26, .32], [-4.7, -1.87, .44], [-4.4, 2.86], [-3.91, -2.53], [-3.40, 2.39, .34], [-3.05, 3.39],
    [-2.31, -2.15], [-1.5, -3.37], [-1.23, 2.56], [-.88, 3.50], [-.54, -2.49, .27], [.32, 3.23],
    [1.01, 3.71, .21], [1.35, -.25], [1.62, 2.95], [2.32, 1.28, .35], [2.96, 3.04], [3.44, 2.12], [4.38, 2.31],
    [5.25, -.10, .39], [5.45, 1.22], [5.1, -2.24, .55], [3.3, -3.34], [.66, -3.46], [-2.62, -3.03],
  ]) {
    const { x, y: z } = islandPoint(u, v);
    positions.push(x, groundHeight(x, z) + .31 + random() * .80 + lift, z);
    twinkle.push(random(), random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('twinkle', new Float32BufferAttribute(twinkle, 2));
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { clock: { value: 0 }, night: { value: 0 }, pixelScale: { value: 40 } },
    vertexShader: `
      uniform float clock, pixelScale;
      attribute vec2 twinkle;
      varying float flash;
      void main() {
        float phase = twinkle.x * 6.283;
        float path = clock * (.30 + twinkle.y * .24) + phase;
        vec3 drift = vec3(sin(path) * .28, cos(path * .83 + phase) * .18, cos(path) * .30);
        flash = .29 + .71 * pow(.5 + .5 * sin(clock * (.96 + twinkle.x * 1.2) + phase + 7. * twinkle.y), 1.75);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + drift, 1.);
        gl_PointSize = clamp(pixelScale * (.26 + twinkle.y * .24), 6., 34.);
      }
    `,
    fragmentShader: `
      uniform float night;
      varying float flash;
      void main() {
        float d = length(gl_PointCoord * 2. - 1.);
        float halo = exp(-d * d * 4.4) * (1. - smoothstep(.63, 1., d));
        float core = 1. - smoothstep(.060, .31, d);
        vec3 color = mix(vec3(.98, .62, .16), vec3(1.85, 1.63, .78), core);
        gl_FragColor = vec4(color, (halo * .42 + core * .66) * flash * (.80 + night * .20));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new Points(geometry, material);
  points.name = '金色萤火';
  points.frustumCulled = false;
  points.renderOrder = 3;
  return points;
}

export function startIsland(host: HTMLElement, tone: IslandTone, canvasLabel: string,
  onAvailability: (available: boolean) => void, onFishing: (action: FishingAction) => void): IslandScene {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', canvasLabel);
  host.appendChild(canvas);

  const compact = host.clientWidth < 660;
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .10, 110);
  const target = new Vector3(-.24, .15, .05);
  const initialDirection = compact ? new Vector3(.48, .84, 1) : new Vector3(.34, .88, 1);
  camera.position.copy(target).addScaledVector(initialDirection.normalize(), 30);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.cursor.copy(target);
  controls.maxTargetRadius = 6.9;
  controls.cursorStyle = 'auto';
  controls.enablePan = false;
  controls.zoomToCursor = true;
  controls.enableDamping = true;
  controls.dampingFactor = .09;
  controls.rotateSpeed = .53;
  controls.zoomSpeed = .66;
  controls.minZoom = .73;
  controls.maxZoom = 3.65;
  controls.minPolarAngle = .55;
  controls.maxPolarAngle = 1.38;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  controls.enableDamping = !motionQuery.matches;
  controls.update();
  controls.saveState();

  const key = new DirectionalLight();
  key.castShadow = true;
  key.shadow.mapSize.setScalar(compact ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -11.8, right: 11.8, top: 9.4, bottom: -9.4, near: 1, far: 33 });
  key.shadow.normalBias = .019;
  key.shadow.bias = -.00026;
  key.shadow.radius = compact ? 2.7 : 4.5;
  key.target.position.set(0, -.8, 0);
  const fill = new HemisphereLight();
  scene.add(key, key.target, fill);

  const terrain = makeTerrain();
  const planting = makePlanting();
  const trees = makeIslandTrees();
  const rocks = makeRocks();
  const cottage = makeCottage();
  cottage.root.scale.setScalar(.88);
  const pavilion = makePondPavilion();
  const { x: pavilionX, y: pavilionZ } = pavilionSite;
  pavilion.group.name = '松边六角亭';
  pavilion.group.position.set(pavilionX, groundHeight(pavilionX, pavilionZ) - .015, pavilionZ);
  pavilion.group.rotation.y = .24;
  pavilion.group.scale.setScalar(.88);
  const shoreStructures = makeShoreStructures(cottage.glass);
  const skiff = makeSkiff(shoreStructures.tie);
  const swan = makePondSwan();
  swan.root.scale.setScalar(.76);
  const shoreLife = makeShoreLife(rocks.seatY);
  const fishSchool = makeFishSchool();
  const water = makeWater(terrain.mask, compact);
  const clouds = makeClouds();
  const fireflies = makeFireflies();
  for (const accessory of [cottage.root, pavilion.group, shoreStructures.root, skiff.root, swan.root]) {
    accessory.traverse(object => { object.castShadow = false; });
  }
  [key, fill, trees.root, rocks.root, pavilion.group, cottage.root].forEach(reflectInLake);
  scene.add(terrain.root, trees.root, rocks.root, planting.root, cottage.root, pavilion.group, shoreStructures.root,
    skiff.root, swan.root, shoreLife.root, fishSchool.root, water.root, clouds.root, fireflies);

  const swanPosition = new Vector2();
  const swanMotion = emptyPose();
  const pose: Parameters<typeof swan.pose>[0] = {
    x: 0, y: lakeLevel, z: 0, waterHeight: lakeLevel, yaw: 0, pitch: 0, roll: 0,
    speed: .18, mode: 'glide', wingOpen: 0, wingPower: 0, brake: 0, stroke: 0, reach: 0, feet: 0, footPhase: 0,
  };

  const sunPosition = new Vector3(-7.9, 10.9, 5.8);
  const duskPosition = new Vector3(-9.9, 6.8, 6.2);
  const moonPosition = new Vector3(-7.4, 10.1, 4.8);
  const lightDirection = new Vector3();
  const sunColor = new Color('#ffe8c1');
  const moonColor = new Color('#e0d5ce');
  const duskColor = new Color('#ffcc9b');
  const fillDay = new Color('#c0dbe5');
  const fillNight = new Color('#a7b5d7');
  const groundDay = new Color('#9293b5');
  const groundNight = new Color('#74799d');
  const drawingBuffer = new Vector2();
  const turn = new Spherical();
  let night = tone.night;
  let twilight = tone.twilight;
  let wanted = tone;
  let time = .85;
  let previous = 0;
  let animation = 0;
  let paused = motionQuery.matches;
  let disposed = false;
  let contextLost = false;
  let placement: Placement | null = null;
  let fishing: FishingPose = 'idle';
  let poseStarted = time;
  let tap: { id: number; x: number; y: number } | null = null;
  type View = { position: Vector3; target: Vector3; zoom: number };
  const currentView = (): View => ({ position: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom });
  let previousView: View | undefined;
  let movingView: { from: View; to: View; progress: number } | undefined;
  const ray = new Raycaster();
  const pointer = new Vector2();
  const targets = [terrain.land, terrain.floor];

  function moveView(to: View) {
    movingView = { from: currentView(), to, progress: 0 };
  }

  function adjustView(delta: number) {
    if (!movingView) return;
    const { from, to } = movingView;
    movingView.progress = paused ? 1 : Math.min(1, movingView.progress + delta * 2.4);
    const blend = MathUtils.smoothstep(movingView.progress, 0, 1);
    camera.position.lerpVectors(from.position, to.position, blend);
    controls.target.lerpVectors(from.target, to.target, blend);
    camera.zoom = MathUtils.lerp(from.zoom, to.zoom, blend);
    camera.updateProjectionMatrix();
    if (movingView.progress === 1) movingView = undefined;
  }

  function stopView() { movingView = undefined; }

  function fit() {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const aspect = width / height;
    const frame = Math.max(16.15, (aspect < .8 ? 21.6 : 23.3) / aspect);
    camera.top = frame / 2;
    camera.bottom = -frame / 2;
    camera.left = -frame * aspect / 2;
    camera.right = frame * aspect / 2;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 660 ? 1.6 : 1.65));
    renderer.setSize(width, height, false);
    invalidate();
  }

  function draw(delta: number) {
    const lastNight = night, lastTwilight = twilight;
    const alpha = paused ? 1 : 1 - Math.exp(-delta * 4.8);
    night = MathUtils.lerp(night, wanted.night, alpha);
    twilight = MathUtils.lerp(twilight, wanted.twilight, alpha);
    if (Math.abs(night - wanted.night) < .001) night = wanted.night;
    if (Math.abs(twilight - wanted.twilight) < .001) twilight = wanted.twilight;
    const moonlight = night * (1 - twilight * .58);
    const afterglow = twilight * (1 - night * .32);
    key.position.copy(sunPosition).lerp(moonPosition, moonlight).lerp(duskPosition, afterglow);
    key.color.copy(sunColor).lerp(moonColor, moonlight).lerp(duskColor, afterglow);
    key.intensity = MathUtils.lerp(2.70, 1.66, moonlight) - afterglow * .41;
    fill.color.copy(fillDay).lerp(fillNight, moonlight);
    fill.groundColor.copy(groundDay).lerp(groundNight, moonlight);
    fill.intensity = MathUtils.lerp(1.26, 1.13, moonlight);
    renderer.toneMappingExposure = MathUtils.lerp(.98, 1.05, moonlight);
    const lamps = MathUtils.smoothstep(night, .16, .95);
    cottage.light.intensity = MathUtils.lerp(.10, 2.75, lamps);
    cottage.glass.emissiveIntensity = MathUtils.lerp(.12, 1.08, lamps);
    pavilion.update(time, lamps * 2.10, .07);

    swanCircuit.sample(time, swanMotion);
    swanPosition.set(swanMotion.x, swanMotion.z);
    const direction = swanMotion.yaw;
    swan.root.position.set(swanPosition.x, lakeLevel - .017 + Math.sin(time * 2.4) * .008, swanPosition.y);
    swan.root.rotation.set(0, direction - Math.PI, (.013 + swanMotion.pace * .012) * Math.sin(time * 1.75));
    pose.x = swanPosition.x;
    pose.z = swanPosition.y;
    pose.yaw = direction;
    pose.y = swan.root.position.y;
    pose.mode = swanMotion.activity === 'swim' ? 'glide' : 'rest';
    pose.speed = .04 + swanMotion.pace * .26;
    pose.swimPhase = swanMotion.stride * 14;
    const rest = swanMotion.activity === 'rest' ? swanMotion.hold : 0;
    swan.pose(pose, time, Math.sin(time * .32) * (.14 + rest * .42), .10 + .44 * rest);
    adjustView(delta);
    renderer.getDrawingBufferSize(drawingBuffer);
    const pixelScale = drawingBuffer.y / (camera.top - camera.bottom) * camera.zoom;
    skiff.update(time, fishing === 'idle' && !placement, pixelScale);
    fishSchool.update(time, swanPosition, skiff.contact);
    shoreLife.update(time, fishing, paused ? 1 : time - poseStarted);
    clouds.update(time, moonlight, afterglow, camera.position);
    planting.update(time);

    fireflies.material.uniforms.pixelScale.value = pixelScale;
    fireflies.material.uniforms.clock.value = time;
    fireflies.material.uniforms.night.value = moonlight;
    lightDirection.copy(key.position).sub(key.target.position).normalize();
    water.update({ time, night: moonlight, twilight: afterglow, lightDirection, pixelScale,
      swimmer: swanPosition, swimAngle: direction, paddle: .22 + .78 * swanMotion.pace,
      boat: skiff.contact, hullAngle: skiff.heading });
    if (night !== lastNight || twilight !== lastTwilight) renderer.shadowMap.needsUpdate = true;
    controls.update();
    renderer.render(scene, camera);
  }

  function frame(now: number) {
    animation = 0;
    if (disposed || contextLost) return;
    const elapsed = previous ? (now - previous) / 1000 : .017;
    if (!paused && compact && previous !== 0 && elapsed < .028) {
      invalidate();
      return;
    }
    previous = now;
    const delta = Math.min(.065, elapsed);
    if (!paused) time += delta;
    draw(delta);
    if (!paused || night !== wanted.night || twilight !== wanted.twilight) invalidate();
  }

  function invalidate() {
    if (!disposed && !contextLost && !animation) animation = requestAnimationFrame(frame);
  }

  function motionChange() {
    paused = motionQuery.matches;
    controls.enableDamping = !paused;
    invalidate();
  }

  function placeAt(x: number, y: number) {
    if (!placement || contextLost) return;
    pointer.set(x, y);
    camera.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit || occupiedGround(hit.point.x, hit.point.z) || shoreLife.occupied(hit.point.x, hit.point.z) ||
        Math.hypot(hit.point.x - fishingSeat.x, hit.point.z - fishingSeat.y) < .61) return;
    const { x: worldX, y: height, z } = hit.point;
    if (placement === 'tree') {
      if (hit.object !== terrain.land || height < lakeLevel) return;
      trees.place(worldX, height, z);
      reflectInLake(trees.root);
    } else {
      if (height < lakeLevel - .20) return;
      rocks.place(worldX, height, z);
      reflectInLake(rocks.root);
      renderer.shadowMap.needsUpdate = true;
    }
    water.invalidate();
    invalidate();
  }

  function setPointer(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    pointer.set(x * 2 - 1, 1 - y * 2);
    return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  }

  function hitsBoat() {
    if (contextLost) return false;
    camera.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
    const hull = ray.intersectObject(skiff.hull, false)[0];
    return Boolean(hull && (ray.intersectObject(terrain.land, false)[0]?.distance ?? Infinity) > hull.distance);
  }

  function pointerDown(event: PointerEvent) {
    tap = event.button === 0 && event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  }

  function pointerMove(event: PointerEvent) {
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 6) tap = null;
    if (event.pointerType === 'mouse' && !event.buttons && fishing === 'idle' && !placement) {
      canvas.toggleAttribute('data-over-boat', setPointer(event) && hitsBoat());
    }
  }

  function pointerUp(event: PointerEvent) {
    pointerMove(event);
    if (tap?.id !== event.pointerId) return;
    tap = null;
    if (!setPointer(event)) return;
    if (placement) placeAt(pointer.x, pointer.y);
    else if (fishing === 'bite') onFishing('reel');
    else if (fishing === 'idle' && hitsBoat()) onFishing('cast');
  }

  function pointerCancel() {
    tap = null;
  }

  function handleKeys(event: KeyboardEvent) {
    const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (placement && event.key === 'Enter') {
      if (!event.repeat) placeAt(0, 0);
    } else if (fishing === 'bite' && (event.key === 'Enter' || event.key === ' ')) {
      if (!event.repeat) onFishing('reel');
    } else if (event.key === 'Home') {
      stopView();
      controls.reset();
    } else if (event.key === '+' || event.key === '=' || event.key === '-') {
      camera.zoom = MathUtils.clamp(camera.zoom * (event.key === '-' ? .89 : 1.12), controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
    } else if (arrows.includes(event.key)) {
      turn.setFromVector3(camera.position.clone().sub(controls.target));
      turn.theta += event.key === 'ArrowLeft' ? .14 : event.key === 'ArrowRight' ? -.14 : 0;
      turn.phi += event.key === 'ArrowUp' ? -.11 : event.key === 'ArrowDown' ? .11 : 0;
      turn.phi = MathUtils.clamp(turn.phi, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.setFromSpherical(turn).add(controls.target);
      controls.update();
    } else {
      return;
    }
    event.preventDefault();
    invalidate();
  }

  const resize = new ResizeObserver(fit);
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    tap = null;
    cancelAnimationFrame(animation);
    animation = 0;
    onAvailability(false);
  };
  const onContextRestored = () => {
    contextLost = false;
    renderer.shadowMap.needsUpdate = true;
    water.invalidate();
    onAvailability(true);
    invalidate();
  };
  resize.observe(host);
  canvas.addEventListener('keydown', handleKeys);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('lostpointercapture', pointerCancel);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  controls.addEventListener('start', stopView);
  controls.addEventListener('change', invalidate);
  motionQuery.addEventListener('change', motionChange);
  fit();
  draw(.017);

  return {
    setTone(next) {
      wanted = next;
      invalidate();
    },
    setPlacement(tool) {
      placement = tool;
      tap = null;
      canvas.dataset.placement = tool ?? '';
      host.dataset.placing = String(tool !== null);
      controls.mouseButtons.LEFT = tool ? null : MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = MOUSE.ROTATE;
      canvas.removeAttribute('data-over-boat');
      invalidate();
    },
    setFishing(pose) {
      if (pose === fishing) return;
      if (fishing === 'idle' && pose === 'waiting') {
        previousView = currentView();
        const center = new Vector3(fishingSeat.x + 1.96, -.88, fishingSeat.y - .70);
        const position = new Vector3(.50, .77, 1).normalize().multiplyScalar(30).add(center);
        moveView({ position, target: center, zoom: compact ? 1.83 : 1.76 });
      }
      if (pose === 'idle' && previousView) {
        moveView(previousView);
        previousView = undefined;
      }
      fishing = pose;
      poseStarted = time;
      canvas.dataset.fishing = pose;
      canvas.removeAttribute('data-over-boat');
      tap = null;
      invalidate();
    },
    reset() {
      stopView();
      controls.reset();
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(animation);
      resize.disconnect();
      controls.dispose();
      motionQuery.removeEventListener('change', motionChange);
      canvas.removeEventListener('keydown', handleKeys);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel);
      canvas.removeEventListener('lostpointercapture', pointerCancel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      terrain.mask.texture.dispose();
      water.dispose();
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const spriteTextures = new Set<Texture>();
      scene.traverse(object => {
        if (object instanceof SkinnedMesh) object.skeleton.dispose();
        if (object instanceof InstancedMesh) object.dispose();
        if (object instanceof Mesh || object instanceof Points || object instanceof Line) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
        if (object instanceof Sprite) {
          if (object.material.map) spriteTextures.add(object.material.map);
          materials.add(object.material);
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      spriteTextures.forEach(texture => texture.dispose());
      materials.forEach(material => material.dispose());
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
