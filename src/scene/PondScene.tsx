import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { RootState, ThreeEvent } from '@react-three/fiber';
import type { DirectionalLight, HemisphereLight, Object3D, WebGLRendererParameters, WebGLRenderTarget } from 'three';
import { ACESFilmicToneMapping, Group, InstancedMesh, Mesh, MeshStandardMaterial, PCFShadowMap, Plane, PointLight, Raycaster, Vector2, Vector3, WebGLRenderer } from 'three';
import { makePondAtmosphere } from './PondAtmosphere';
import { makePondSediment } from './PondSediment';
import { makePondLighting, pondShadowCamera, pondShadowSettings, PondShadows } from './PondLighting';
import { makePondGarden } from './PondGarden';
import { makePondBanks } from './PondBanks';
import { makePondVista } from './PondVista';
import { makeSanctuaryGroundcover, makeShoreLandscape } from './shore-landscape';
import { makeShoreGrove } from './PondGrove';
import { makePondPlantKit } from './pond-plant-kit';
import { makeAquaticModels } from './PondCreatures';
import { makePondWildlife } from './PondWildlife';
import { SwanLife } from './wildlife-life';
import { makePairHearts, makePondHabitat, makeShoreLotus } from './PondHabitat';
import { makeWestPier } from './PondPier';
import { HabitatLife } from './habitat-life';
import { makePondBoat } from './PondBoat';
import { PondCamera } from './PondCamera';
import type { PondView } from './PondCamera';
import { islandView, makePondIslands } from './PondIslands';
import type { IslandPlay } from './PondIslands';
import { isOpenPondWater, PaperSkimGesture, PaperWakeField, paperSkimSettings, paperTailOffset } from './paper-wake';
import { makeIslandTerrainSurface, makePondFloorGeometry, makeTerrainMap } from './PondTerrain';
import { makePondWater } from './PondWater';
import { classifyWaterPasses, setShadowCasters, setWaterPasses, trackWaterPasses, waterLevel } from './PondOptics';
import { BoatDrift, BoatFloat, makeSurfaceSpray, pondBreeze, sampleHull, SwimmerFloat } from './PondSurface';
import { animalIsland } from './habitat-layout';
import { lightingAt } from './time';
import { PreviewTime } from './preview-time';
import type { Observer } from './time';
import { BoatMotion, boatHelm, boatCruiseSpeed, planWaterRoute } from './navigation';
import type { Point } from '../config/islands';
import { boatContactMaterial } from './collision';
import { bodyCores, PondBodyPhysics } from './body-physics';
import type { PondBody } from './body-physics';
import { boatDraft, boatScale, boatSizeMultiplier, boatStart, boatWorldScale, koiObstacles,
  worldBounds, worldObstacles } from './world-layout';
import { BoatWander, FishSchool, RippleField } from './pond-life';
import { pondRenderProfiles } from './render-profile';
import type { RenderProfile } from './render-profile';

export type Quality = RenderProfile;
export interface SceneProps {
  timestamp: number; observer: Observer; paused: boolean; reduced: boolean; quality: Quality;
  previewOffset?: number;
  seed?: number;
  captureEveryFrame?: boolean;
  fullScenery?: boolean;
  sceneLabel?: string;
  viewReset?: number;
  onReady: () => void;
  onFailure: () => void;
  onFramed?: () => void;
  onViewChange?: (changed: boolean) => void;
  onRide?: (active: boolean) => void;
  onPhase?: (night: boolean) => void;
  onContext?: (context: RootState) => void;
}

export default function PondScene({ onContext, ...props }: SceneProps) {
  const [hidden, setHidden] = useState(document.hidden);
  const low = props.quality === 'low';
  const renderer = useRef<WebGLRenderer | null>(null);
  const createRenderer = useCallback((defaults: WebGLRendererParameters) => {
    try {
      renderer.current = new WebGLRenderer({ ...defaults, antialias: !low, alpha: false, powerPreference: low ? 'low-power' : 'high-performance' });
      return renderer.current;
    } catch (error) {
      props.onFailure();
      throw error;
    }
  }, [low, props.onFailure]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    // A history-cached document can freeze before Fiber's delayed GPU disposal runs.
    const release = () => {
      renderer.current?.forceContextLoss();
    };
    window.addEventListener('pagehide', release, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', release, true);
    };
  }, []);
  return <Canvas
    dpr={[0, pondRenderProfiles[props.quality].dpr]}
    shadows={{ type: PCFShadowMap }}
    frameloop={hidden ? 'never' : props.paused ? 'demand' : 'always'}
    camera={{ fov: 40, near: .1, far: 1200, position: [7, 6, 16] }}
    gl={createRenderer}
    fallback={null}
    onCreated={context => {
      const { gl } = context;
      gl.toneMapping = ACESFilmicToneMapping; gl.info.autoReset = false;
      gl.shadowMap.autoUpdate = false;
      gl.debug.onShaderError = (context, _program, vertex, fragment) => {
        console.error('Pond shader failed:', context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment));
        props.onFailure();
      };
      onContext?.(context);
    }}
  >
    <World {...props} hidden={hidden} />
  </Canvas>;
}

type WorldProps = SceneProps & { hidden: boolean };

function World({ fullScenery = false, ...props }: WorldProps) {
  const { camera, size, gl, scene, invalidate, viewport: { dpr } } = useThree();
  const render = pondRenderProfiles[props.quality];
  const low = props.quality === 'low';
  const compactShore = props.quality !== 'high';
  const plants = useMemo(makePondPlantKit, []);
  const islands = useMemo(() => makePondIslands(plants.kit, compactShore), [plants, compactShore]);
  const boat = useMemo(makePondBoat, []);
  const boatPoseNeedsUpdate = useRef(false);
  const updateBoatPasses = useMemo(() => trackWaterPasses(boat.root), [boat]);
  const boatLight = useRef<PointLight>(null);
  const boatLampOverride = useRef<boolean | null>(null);
  const boatLampOn = useRef(false);
  const boatLampProjection = useMemo(() => new Vector3(), []);
  const animals = useMemo(() => makeAquaticModels(low), [low]);
  const wildlife = useMemo(makePondWildlife, []);
  const swanLife = useMemo(() => new SwanLife(), []);
  const habitat = useMemo(() => makePondHabitat(), []);
  const hearts = useMemo(() => makePairHearts(), []);
  // Continuous preview state belongs to the render loop, not React reconciliation.
  const preview = useMemo(() => new PreviewTime(props.timestamp), []);
  const previousOffset = useRef(props.previewOffset);
  const light = useMemo(() => lightingAt(new Date(props.timestamp), props.observer), []);
  const lightSample = useRef({ timestamp: NaN, observer: props.observer });
  const phase = useRef<boolean | null>(null);
  const lighting = useMemo(() => makePondLighting(), []);
  const shadows = useMemo(() => new PondShadows(), []);
  const shadow = pondShadowSettings(Math.min(render.shadowSize, gl.capabilities.maxTextureSize));
  const sunlight = useRef<DirectionalLight>(null), moonlight = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const atmosphere = useMemo(() => makePondAtmosphere(), []);
  const islandTerrain = useMemo(() => makeIslandTerrainSurface([
    ...islands.banks, { mesh: habitat.bank, x: animalIsland.x, z: animalIsland.z },
  ]), [islands, habitat]);
  const terrain = useMemo(() => makeTerrainMap(islandTerrain.heightAt), [islandTerrain]);
  const garden = useMemo(() => makePondGarden(low,islandTerrain.heightAt), [low,islandTerrain]);
  const banks = useMemo(() => makePondBanks(atmosphere.uniforms), [atmosphere]);
  const vista = useMemo(() => makePondVista(atmosphere.uniforms, compactShore), [atmosphere, compactShore]);
  const landscape = useMemo(() => makeShoreLandscape(plants.kit, compactShore), [plants, compactShore]);
  const sanctuaryGroundcover = useMemo(() => makeSanctuaryGroundcover(plants.kit, habitat.bank, low), [plants, habitat, low]);
  const grove = useMemo(() => makeShoreGrove(compactShore), [compactShore]);
  const shoreLotus = useMemo(() => makeShoreLotus(islandTerrain.heightAt, low), [islandTerrain, low]);
  const westPier = useMemo(() => makeWestPier(low, islandTerrain.heightAt), [low, islandTerrain]);
  const water = useMemo(() => makePondWater(render.water, terrain, gl, islandTerrain.containsLand, props.captureEveryFrame),
    [render.water, props.captureEveryFrame, terrain, gl, islandTerrain]);
  const sediment = useMemo(() => makePondSediment(terrain, atmosphere.uniforms), [terrain, atmosphere]);
  useEffect(() => {
    const islandMaterials = new Set<MeshStandardMaterial>();
    for (const root of [islands.group, habitat.group]) root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof MeshStandardMaterial && (material.name === 'BankPigment' || object.name === 'AnimalIsland')) {
          islandMaterials.add(material);
        }
      }
    });
    islandMaterials.forEach(sediment.applyToSkirt);
    invalidate();
  }, [islands, habitat, sediment, invalidate]);
  const bed = useMemo(() => makePondFloorGeometry(islandTerrain.heightAt), [islandTerrain]);
  const [boatMotion] = useState(() => Object.assign(new BoatMotion(boatStart), { angle: -1.2, collisionMaterial: boatContactMaterial, helm: boatHelm }));
  const motion = useRef(boatMotion);
  const boatRoot = useRef<Group>(null);
  const getBoatPose = useCallback(() => boatRoot.current ? motion.current : null, []);
  const boatBody = useMemo<PondBody>(() => ({ id: 'boat', kind: 'boat', motion: boatMotion,
    pose: { x: 0, y: -boatDraft, z: 0, pitch: 0 }, cores: bodyCores('boat') }), [boatMotion]);
  const clock = useRef(0);
  const sailing = useRef<{ target: Point; arrivedFor: number } | null>(null);
  const arrivedAtWater = useRef(false);
  const [focus, setFocus] = useState<PondView>();
  const viewTap = useRef<{ site: IslandPlay | 'boat'; at: number; x: number; y: number } | null>(null);
  const lastTouch = useRef(-Infinity), touchCounts = useRef({water:0,animal:0,boat:0,leaf:0,swan:0,boatLantern:0});
  const [lifeSeed] = useState(() => props.seed ?? Math.floor(Math.random() * 4294967295));
  const wander = useMemo(() => new BoatWander(lifeSeed), [lifeSeed]);
  const fishSchool = useMemo(() => new FishSchool(7, lifeSeed + 71, koiObstacles), [lifeSeed]);
  // The callback follows quality changes without resetting the animal state machines.
  const currentSurface = useRef(water.surface);currentSurface.current=water.surface;
  const habitatLife = useMemo(() => new HabitatLife(lifeSeed + 902, (x,z,t)=>currentSurface.current.sampleAnimal(x,z,t), habitat.padSupport, habitat.ground), [lifeSeed, habitat]);
  const swimmerFloats = useMemo(() => Array.from({length:14},()=>new SwimmerFloat()), []);
  const collisionBodies = useMemo(() => [
    ...fishSchool.collisionBodies, ...habitatLife.collisionBodies, swanLife.body,
  ], [fishSchool, habitatLife, swanLife]);
  const bodyPhysics = useRef<PondBodyPhysics | null>(null);
  const ripples = useMemo(() => new RippleField(), []);
  const spray = useMemo(() => makeSurfaceSpray(low), [low]);
  const paperGesture = useMemo(() => new PaperSkimGesture(), []);
  const paperWake = useMemo(() => new PaperWakeField(), []);
  const paperInput = useRef<({ x: number; y: number; at: number; active: boolean; speed: number; fingertip: boolean } | null)[]>([]);
  const strokeId = useRef<number | null>(null);
  const paperTouching = useRef(false);
  const paperProjection = useMemo(() => ({
    ray: new Raycaster(), plane: new Plane(new Vector3(0, 1, 0), -waterLevel),
    screen: new Vector2(), nose: new Vector3(), tail: new Vector3(),
  }), []);
  const buoyancy = useMemo(() => new BoatFloat(), []);
  const drift = useMemo(() => new BoatDrift(), []);
  const metricsClock = useRef(0);
  const boatSurface = useMemo(() => new Vector2(), []);
  const boatHeading = useMemo(() => new Vector2(), []);
  const boatWake = useMemo(() => ({ x: 0, z: 0, headingX: 0, headingZ: 1, speed: 0, reach: .88 * boatWorldScale }), []);
  const firstFrame = useRef(true);
  const sinceRender = useRef(0);
  const frameCredit = useRef(0);
  const lastRenderStamp = useRef<number | null>(null);
  const renderedFrames = useRef(0);
  const metricsFrames = useRef({ count: 0, calls: 0, triangles: 0, shadow: 0 });
  const frameSamples = useRef<number[]>([]);
  const frameStalls = useRef({ max: 0, over50: 0, over250: 0 });
  const programsReady = useRef(false);
  const waterInitialized = useRef<typeof water | null>(null);
  const animatedPose = useRef({ time: NaN, animals });
  const atmosphereFrame = useRef({ time: NaN, timestamp: NaN });

  useEffect(() => {
    const previousContacts = bodyPhysics.current?.contacts ?? 0;
    const physics = new PondBodyPhysics([boatBody, ...collisionBodies]);
    physics.contacts = previousContacts;
    bodyPhysics.current = physics;
    return () => physics.dispose();
  }, [boatBody, collisionBodies]);

  useEffect(() => {
    boatPoseNeedsUpdate.current = true;
    setShadowCasters(boat.root, true);
    setWaterPasses(boat.root, true, false);
    updateBoatPasses();
    shadows.invalidate();
    water.invalidateCapture();
    invalidate();
  }, [boat, updateBoatPasses, shadows, water, invalidate]);

  useEffect(() => {
    lastRenderStamp.current = null;
    sinceRender.current = 0;
    frameCredit.current = 0;
    shadows.invalidate();
    water.invalidateCapture();
  }, [dpr, props.quality, props.paused, props.reduced, props.hidden, shadows, water]);

  useEffect(() => {
    const canvas = gl.domElement;
    const surface = canvas.closest('.pond-page') ?? canvas;
    const publish = () => {
      if (paperGesture.active && canvas.dataset.paperSkimming !== 'true') canvas.dataset.paperSkimming = 'true';
      else if (!paperGesture.active) delete canvas.dataset.paperSkimming;
    };
    const reset = () => {
      strokeId.current = null;
      paperInput.current.length = 0; paperTouching.current = false;
      paperGesture.reset(); paperWake.stop();
      publish();
    };
    reset();
    if (props.paused || props.hidden) return;
    let startX = 0, startY = 0, lastX = 0, lastY = 0, lastAt = 0, dragged = false;
    const down = (rawEvent: Event) => {
      const event = rawEvent as PointerEvent;
      if (event.pointerType === 'touch' && !event.isPrimary) {
        reset();
        dragged = true;
        return;
      }
      dragged = false;
      if (event.button !== 0 || event.target !== canvas) { reset(); return; }
      paperGesture.reset();
      paperInput.current.push(null);
      publish();
      strokeId.current = event.pointerId;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      lastAt = event.timeStamp;
    };
    const end = (rawEvent: Event) => {
      if ((rawEvent as PointerEvent).pointerId !== strokeId.current) return;
      strokeId.current = null;
      // Flush the final samples before ending the stroke, even on a slow frame.
      paperInput.current.push(null);
    };
    const leave = (rawEvent: Event) => {
      if ((rawEvent as PointerEvent).pointerType !== 'touch') reset();
    };
    const click = (event: Event) => {
      // A stroke can end at its starting pixel and still synthesize a click.
      if (dragged && event.target === canvas) { event.stopPropagation(); dragged = false; }
    };
    const move = (rawEvent: Event) => {
      const event = rawEvent as PointerEvent;
      const direct = event.pointerId === strokeId.current;
      if (!direct && event.pointerType === 'touch') return;
      if (!direct && (event.pointerType !== 'mouse' || event.buttons !== 0)) { reset(); return; }
      const coalesced = event.getCoalescedEvents?.();
      for (const point of coalesced?.length ? coalesced : [event]) {
        const x = point.clientX, y = point.clientY, at = point.timeStamp;
        if (direct) {
          dragged ||= Math.hypot(x - startX, y - startY) > 6;
          const speed = 1000 * Math.hypot(x - lastX, y - lastY) / Math.max(1, at - lastAt);
          if (dragged) paperInput.current.push({ x, y, at, active: true, speed, fingertip: true });
          lastX = x; lastY = y; lastAt = at;
        } else {
          const active = paperGesture.move(x, y, at);
          paperInput.current.push({ x, y, at, active, speed: paperGesture.speed, fingertip: false });
        }
      }
      publish();
      if (paperInput.current.length > 128) paperInput.current.splice(0, paperInput.current.length - 128);
    };
    surface.addEventListener('pointermove', move, { passive: true, capture: true });
    surface.addEventListener('pointerleave', leave);
    surface.addEventListener('pointercancel', reset);
    surface.addEventListener('pointerdown', down, true);
    surface.addEventListener('pointerup', end, true);
    surface.addEventListener('click', click, true);
    window.addEventListener('blur', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('resize', reset);
    return () => {
      reset();
      surface.removeEventListener('pointermove', move, true);
      surface.removeEventListener('pointerleave', leave);
      surface.removeEventListener('pointercancel', reset);
      surface.removeEventListener('pointerdown', down, true);
      surface.removeEventListener('pointerup', end, true);
      surface.removeEventListener('click', click, true);
      window.removeEventListener('blur', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('resize', reset);
    };
  }, [gl, paperGesture, paperWake, props.paused, props.hidden]);

  useEffect(() => {
    water.fitCaptures(size.width, size.height, dpr);
    invalidate();
  }, [water, size.width, size.height, dpr, invalidate]);

  useEffect(() => {
    scene.fog = lighting.fog;
    scene.background = lighting.fog.color;
  }, [scene, lighting]);

  useEffect(() => {
    // Returning from a background tab synchronizes real time without replaying it.
    const offsetChanged = props.previewOffset !== previousOffset.current;
    preview.setTarget(props.timestamp, performance.now(), props.reduced, offsetChanged);
    previousOffset.current = props.previewOffset;
    if (offsetChanged) shadows.invalidate();
    invalidate();
  }, [preview, props.timestamp, props.previewOffset, props.reduced, shadows, invalidate]);

  useEffect(() => {
    classifyWaterPasses(scene);
    // These move across the waterline. Their initial bounds do not describe a
    // later dive, a landing or the roll of the boat.
    for (const root of [animals.group, habitat.group, shoreLotus.group, wildlife.group]) setWaterPasses(root, true, true);
    for (const wing of wildlife.wings) setWaterPasses(wing, true, false);
    setWaterPasses(atmosphere.group, true, false);
    setWaterPasses(vista.group, true, false);
    setWaterPasses(grove.group, true, false);
    setWaterPasses(hearts.group, true, false);
    setWaterPasses(spray.mesh, false, false);
    setWaterPasses(water.water, false, false);
    setWaterPasses(garden.group, false, true);
    // The garden lies entirely below the opaque portion of the surface.
    // Its image reaches this camera through the refraction target.
    garden.group.traverse(object => { if (object instanceof Mesh) object.layers.disable(0); });
    // The broad shelf stones contact the sand in the shadow atlas. Submerged
    // grass and small fragments keep their local lighting.
    landscape.setGrassShadows(!low);
    setShadowCasters(scene, true);
    for (const root of [animals.group, ...wildlife.insects.map(insect => insect.root)]) setShadowCasters(root, false);
    shadows.configure(sunlight.current, moonlight.current);
    let cancelled = false;
    programsReady.current = false;
    // The planar targets are linear and need different programs from the screen.
    // compileAsync also instantiates the program for the hidden stars.
    const compile = (target: WebGLRenderTarget | null) => {
      const previous = gl.getRenderTarget();
      try { gl.setRenderTarget(target); return gl.compileAsync(scene, camera); }
      finally { gl.setRenderTarget(previous); }
    };
    void (async () => {
      await compile(null);
      if (cancelled) return;
      await compile(water.reflectionTarget);
      if (cancelled) return;
      programsReady.current = true;
      lastRenderStamp.current = null;
      invalidate();
    })().catch(error => {
      if (!cancelled) { console.error('Pond shader warmup failed:', error); props.onFailure(); }
    });
    return () => { cancelled = true; };
  }, [gl, scene, camera, water, animals, habitat, shoreLotus, westPier, wildlife, atmosphere, vista, grove, hearts, spray, garden,
    landscape, sanctuaryGroundcover, islands, shadows, invalidate, low, props.onFailure]);

  useEffect(() => {
    const contextLost = (event: Event) => { event.preventDefault(); props.onFailure(); };
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', contextLost);
    return () => canvas.removeEventListener('webglcontextlost', contextLost);
  }, [gl, props.onReady, props.onFailure]);
  useEffect(() => () => water.dispose(), [water]);
  useEffect(() => () => atmosphere.dispose(), [atmosphere]);
  useEffect(() => () => terrain.dispose(), [terrain]);
  useEffect(() => () => islandTerrain.dispose(), [islandTerrain]);
  useEffect(() => () => garden.dispose(), [garden]);
  useEffect(() => () => banks.dispose(), [banks]);
  useEffect(() => () => landscape.dispose(), [landscape]);
  useEffect(() => () => grove.dispose(), [grove]);
  useEffect(() => () => plants.dispose(), [plants]);
  useEffect(() => () => vista.dispose(), [vista]);
  useEffect(() => () => sanctuaryGroundcover.dispose(), [sanctuaryGroundcover]);
  useEffect(() => () => islands.dispose(), [islands]);
  useEffect(() => () => shoreLotus.dispose(), [shoreLotus]);
  useEffect(() => () => westPier.dispose(), [westPier]);
  useEffect(() => () => animals.dispose(), [animals]);
  useEffect(() => () => wildlife.dispose(), [wildlife]);
  useEffect(() => () => habitat.dispose(), [habitat]);
  useEffect(() => () => hearts.dispose(), [hearts]);
  useEffect(() => () => spray.dispose(), [spray]);
  useEffect(() => () => bed.dispose(), [bed]);
  useEffect(() => () => sediment.ground.dispose(), [sediment]);
  useEffect(() => () => boat.dispose(), [boat]);

  const playIsland = useCallback((action: IslandPlay) => {
    islands.play(action, clock.current, !props.paused, light.night > .5);
    water.invalidateCapture();
    invalidate();
  }, [islands, props.paused, light, water, invalidate]);
  const toggleBoatLantern = useCallback(() => {
    boatLampOverride.current = !boatLampOn.current;
    touchCounts.current.boatLantern++;
    water.invalidateCapture();
    invalidate();
  }, [water, invalidate]);
  const touchWater = useCallback((x: number, z: number) => {
    if (props.paused || !isOpenPondWater(x, z, boatSurface.x, boatSurface.y, 0, islandTerrain.containsLand)) return;
    const route = planWaterRoute(motion.current.position, { x: x * 100, y: z * 100 }, worldObstacles, worldBounds);
    if (route.length > 1) {
      motion.current.releaseDrift();
      drift.reset();
      motion.current.setRoute(route);
      sailing.current = { target: route[route.length-1], arrivedFor: 0 };
      arrivedAtWater.current = false;
    }
    // A rapid second tap still retargets the boat, but won't stack wave impulses.
    if (clock.current-lastTouch.current < .35) return;
    lastTouch.current = clock.current;
    touchCounts.current.water++;
    ripples.emit(x,z,clock.current,.62,'touch');
    boat.cat?.notice(clock.current, new Vector3(x,waterLevel,z));
    fishSchool.notice(x,z,clock.current);
    habitatLife.notice(x,z,clock.current);
  }, [props.paused, boatSurface, islandTerrain, boat, drift, ripples, fishSchool, habitatLife]);
  const touchLeaf = (event: ThreeEvent<MouseEvent>) => {
    const { object, instanceId, point } = event;
    const { pondPadIndex, pondShoreLeaves } = object.userData;
    if (pondPadIndex === undefined && !pondShoreLeaves) return;
    event.stopPropagation();
    const time = clock.current;
    if (props.paused || event.delta > 6 || time-lastTouch.current < .23) return;
    lastTouch.current = time;
    touchCounts.current.leaf++;
    if (pondShoreLeaves && instanceId !== undefined) shoreLotus.tap(object,instanceId,point.x,point.z);
    else if (pondPadIndex !== undefined) habitat.tap(pondPadIndex,point.x,point.z);
    ripples.emit(point.x,point.z,time,.34,'touch',0,0,.13);
  };
  const lookCloser = (event: ThreeEvent<MouseEvent>, site: IslandPlay | 'boat') => {
    if (fullScenery) return false;
    const { clientX: x, clientY: y, timeStamp: at } = event.nativeEvent;
    const previous = viewTap.current;
    if (previous?.site === site && at - previous.at < 390 && Math.hypot(x - previous.x, y - previous.y) < 24) {
      viewTap.current = null;
      setFocus(site === 'boat' ? { boat: true } : islandView(site));
      return true;
    }
    viewTap.current = { site, at, x, y };
    return false;
  };

  useEffect(() => {
    if (fullScenery) return;
    const canvas = gl.domElement;
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      switch (event.key.toLowerCase()) {
        case '1': setFocus(islandView('blossoms')); break;
        case '2': setFocus(islandView('lamps')); break;
        case '3': setFocus(islandView('chimes')); break;
        case '4': if (getBoatPose()) setFocus({ boat: true }); break;
        case 'b': toggleBoatLantern(); break;
        case 'l': playIsland('lamps'); break;
        case 'c': playIsland('chimes'); break;
        case 'p': playIsland('blossoms'); break;
        case 'enter':
          paperProjection.ray.setFromCamera(paperProjection.screen.set(0, 0), camera);
          if (paperProjection.ray.ray.intersectPlane(paperProjection.plane, paperProjection.nose)) {
            touchWater(paperProjection.nose.x,paperProjection.nose.z);
          }
          break;
        case 'escape':
          if (!sailing.current) return;
          sailing.current = null;
          motion.current.route = [];
          wander.resume();
          break;
        default: return;
      }
      event.preventDefault();
    };
    canvas.addEventListener('keydown', key);
    return () => canvas.removeEventListener('keydown', key);
  }, [fullScenery, gl, playIsland, toggleBoatLantern, touchWater, paperProjection, camera, wander, getBoatPose]);

  useFrame((_, rawDelta) => {
    if (!programsReady.current) return;
    sinceRender.current += rawDelta;
    const continuous = !props.paused;
    // Accumulate display ticks so a capped profile advances simulation by
    // the time elapsed between rendered frames, including on 120 Hz screens.
    if (continuous && render.fps && !firstFrame.current) {
      const interval = 1 / render.fps;
      frameCredit.current += rawDelta;
      if (frameCredit.current < interval - .001) return;
      frameCredit.current = Math.max(0, Math.min(interval - .002, frameCredit.current - interval));
    }
    const delta = firstFrame.current ? 0 : Math.min(sinceRender.current, .08);
    sinceRender.current = 0;
    const stamp = performance.now(), timestamp = preview.sample(stamp);
    const previewing = preview.active(stamp);
    if (timestamp !== lightSample.current.timestamp || props.observer !== lightSample.current.observer) {
      Object.assign(light, lightingAt(new Date(timestamp), props.observer));
      lightSample.current = { timestamp, observer: props.observer };
      lighting.update(light, gl, sunlight.current, moonlight.current, fill.current);
      // A paused view has no regular shadow cadence during clock changes.
      if (!continuous && !previewing) shadows.invalidate();
      const night = light.night > .5;
      if (phase.current !== night) { phase.current = night; props.onPhase?.(night); }
    }
    if (previewing) invalidate();
    const animate = continuous && !props.hidden;
    if (animate) clock.current += delta;
    const time = clock.current;
    boatLampOn.current = boatLampOverride.current ?? (light.windowPower > .35);
    const warmth = boatLampOn.current ? Math.max(.36, light.windowPower / 3.5) * (.96 + .04 * Math.sin(time * 3.3)) : 0;
    boat.lantern.flame.emissiveIntensity = warmth * 3.40;
    boat.lantern.glass.emissiveIntensity = warmth * 2.80;
    if (boatLight.current) boatLight.current.intensity = .70 * warmth * boatSizeMultiplier ** 2;
    const trip = sailing.current;
    if (trip && animate) {
      let arrived = false;
      const steps = Math.max(1, Math.ceil(delta * 60));
      for (let n = 0; n < steps; n++) arrived = motion.current.update(delta / steps, boatCruiseSpeed, worldObstacles, worldBounds);
      trip.arrivedFor = arrived ? trip.arrivedFor + delta : 0;
      if (trip.arrivedFor >= 1.2) {
        arrivedAtWater.current = true;
        sailing.current = null;
        wander.resume();
      }
    } else if (animate) {
      const steps = Math.max(1, Math.ceil(delta * 60));
      for (let n = 0; n < steps; n++) {
        const step=delta/steps,t=time-delta+(n+1)*step,m=motion.current;
        const x=m.position.x/100,z=m.position.y/100;
        const surface=sampleHull(water.surface.sample,x,z,Math.sin(m.angle),-Math.cos(m.angle),t);
        drift.update(surface,pondBreeze(x,z,t),step);
        m.setDriftVelocity({x:drift.velocity.x*100,y:drift.velocity.z*100});
        wander.update(m,step,t,worldObstacles,worldBounds);
        // Shore/body contacts remove blocked momentum instead of storing it offscreen.
        drift.velocity.x=m.driftVelocity.x/100;drift.velocity.z=m.driftVelocity.y/100;
      }
    }
    boatSurface.set(motion.current.position.x / 100, motion.current.position.y / 100);
    boatHeading.set(Math.sin(motion.current.angle), -Math.cos(motion.current.angle));
    const boatSpeed = Math.hypot(motion.current.velocity.x, motion.current.velocity.y) / 100;
    boatWake.x = boatSurface.x;
    boatWake.z = boatSurface.y;
    boatWake.speed = boatSpeed;
    if (boatSpeed > .04) {
      // Place the wake where the actual motion leaves the hull's waterline.
      boatWake.headingX = motion.current.velocity.x / (boatSpeed * 100);
      boatWake.headingZ = motion.current.velocity.y / (boatSpeed * 100);
      const along = boatWake.headingX * boatHeading.x + boatWake.headingZ * boatHeading.y;
      const across = boatWake.headingZ * boatHeading.x - boatWake.headingX * boatHeading.y;
      boatWake.reach = boatWorldScale / Math.hypot(along / .88, across / .36);
    }
    if (animate) {
      const now = performance.now(), canvas = gl.domElement;
      paperGesture.tick(now);
      if (paperInput.current.length) {
        const rect = canvas.getBoundingClientRect();
        const project = (x: number, y: number, point: Vector3) => {
          if (document.elementFromPoint(x, y) !== canvas) return false;
          paperProjection.screen.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
          paperProjection.ray.setFromCamera(paperProjection.screen, camera);
          if (!paperProjection.ray.ray.intersectPlane(paperProjection.plane, point)) return false;
          return isOpenPondWater(point.x, point.z, boatSurface.x, boatSurface.y, undefined, islandTerrain.containsLand);
        };
        for (const input of paperInput.current) {
          if (!input) { paperWake.stop(); paperTouching.current = false; continue; }
          const clear = input.active && now - input.at < paperSkimSettings.idleMs
            && (input.fingertip ? project(input.x, input.y, paperProjection.tail)
              : project(input.x, input.y, paperProjection.nose)
                && project(input.x + paperTailOffset.x, input.y + paperTailOffset.y, paperProjection.tail));
          paperTouching.current = clear;
          if (clear) paperWake.trace(paperProjection.tail.x, paperProjection.tail.z, time - Math.max(0, now - input.at) / 1000, input.speed);
          else paperWake.stop(); // Crossing an island lifts the tail, not the gesture.
        }
        paperInput.current.length = 0;
      }
      if (!paperGesture.active && strokeId.current === null) { paperWake.stop(); paperTouching.current = false; }
      if ((canvas.dataset.paperSkimming === 'true') !== paperGesture.active) {
        if (paperGesture.active) canvas.dataset.paperSkimming = 'true';
        else delete canvas.dataset.paperSkimming;
      }
    }
    const updateModels = time !== animatedPose.current.time || animals !== animatedPose.current.animals;
    if ((updateModels || boatPoseNeedsUpdate.current) && boatRoot.current) {
      boatPoseNeedsUpdate.current = false;
      const surface = sampleHull(water.surface.sample, boatSurface.x, boatSurface.y, boatHeading.x, boatHeading.y, time);
      if (animate) {
        buoyancy.update(surface,delta,motion.current.forwardAcceleration,boatSpeed*motion.current.yawRate*.055);
      }
      boatRoot.current.position.set(boatSurface.x, buoyancy.heave.value - boatDraft, boatSurface.y);
      boatRoot.current.rotation.set(buoyancy.pitch.value, -motion.current.angle, buoyancy.roll.value, 'YXZ');
      boat.update(time, light.night);
      updateBoatPasses();
    }
    if (updateModels) habitat.updateSurface(time,habitatLife.frog.mode==='rest'?habitatLife.frog.padIndex:-1,water.surface.sample);
    if (animate) {
      ripples.trail(boatWake.x, boatWake.z, boatWake.headingX, boatWake.headingZ, boatWake.speed, time, boatWake.reach);
      fishSchool.update(delta, time, ripples, motion.current.position, water.surface.sampleAnimal);
      habitatLife.update(delta, time, ripples, motion.current.position);
      swanLife.update(delta, time, ripples, light.night, motion.current.position, water.surface.sampleAnimal, motion.current.velocity);
    }
    if (updateModels) {
      const floatModel=(root:Object3D,pose:{x:number;y:number;z:number;yaw:number},index:number,immersed=1)=>{
        const response=swimmerFloats[index];
        if(animate)response.update(water.surface.sample(pose.x,pose.z,time),-pose.y,pose.yaw,delta,immersed);
        // Only the rendered articulation floats; routes and collision clearance stay authoritative.
        root.position.y+=response.heave.value*immersed;
        root.rotation.x+=response.pitch.value*immersed;root.rotation.z+=response.roll.value*immersed;
      };
      animals.koi.forEach((model,i)=>{
        const pose=fishSchool.poses[i];model.update(pose,time);
        const immersed=pose.leapPhase?Math.max(0,Math.min(1,-pose.y/.20)):1;
        floatModel(model.root,pose,i,immersed);
      });
      animals.turtles.forEach((model,i)=>model.update(habitatLife.turtles[i],time,habitat.ground));
      const frog=habitatLife.frog;animals.frog.update(frog,time);
      floatModel(animals.frog.root,frog,7,frog.mode==='swim'||frog.mode==='approach'?1:0);
      if(frog.mode==='rest') {
        const support=habitat.padSupport(frog.padIndex),c=Math.cos(frog.yaw),s=Math.sin(frog.yaw);
        animals.frog.root.rotation.x=-(support.dx*s+support.dz*c);animals.frog.root.rotation.z=support.dx*c-support.dz*s;
      }
      animals.tadpoles.forEach((model,i)=>{const pose=habitatLife.tadpoles[i];model.update(pose,time);floatModel(model.root,pose,8+i);});
      habitat.update(time,frog.mode==='rest'?frog.padIndex:-1,water.surface.sample);
      shoreLotus.update(time,water.surface.sample);
      animatedPose.current = { time, animals };
    }
    hearts.update(fishSchool.hearts,time,camera.quaternion);
    if (time !== atmosphereFrame.current.time || timestamp !== atmosphereFrame.current.timestamp) {
      wildlife.update(swanLife,time,animate?delta:0,light.night,water.surface.sample,habitat.padSupport);
      atmosphere.update(time, light);
      sediment.update(time, light.sunPower);
      banks.update(light.sunPower);
      landscape.update(time);
      sanctuaryGroundcover.update(time);
      westPier.update(time,light.windowPower,water.surface.sample);
      atmosphereFrame.current = { time, timestamp };
    }
    islands.update(time, delta, light.windowPower, light.night, dpr, animate, water.surface.sample);
    water.update(time, lighting.surface, boatWake, light.night, ripples.events, atmosphere.uniforms.lunarDiscVisibility.value,
      paperWake.events, animate || waterInitialized.current !== water);
    spray.update(ripples.events, time);
    waterInitialized.current = water;
    garden.update(time, light.night, water.wakeField.texture, water.wakeCellSize, water.surface.wake);
    const start = performance.now();
    const hadPreviousFrame = lastRenderStamp.current !== null;
    const renderedDelta = lastRenderStamp.current === null ? delta : (start - lastRenderStamp.current) / 1000;
    lastRenderStamp.current = start;
    gl.info.reset();
    const shadowUpdated = shadows.prepare(gl, sunlight.current, moonlight.current,
      start, render.shadowHz, continuous, previewing);
    water.prepareCapture(time, timestamp);
    gl.render(scene, camera);
    const initialFrame = firstFrame.current;
    renderedFrames.current++;
    const frame = metricsFrames.current;
    frame.count++;
    frame.calls += gl.info.render.calls;
    frame.triangles += gl.info.render.triangles;
    frame.shadow += Number(shadowUpdated);
    if (continuous && !initialFrame && hadPreviousFrame) {
      const ms = renderedDelta * 1000;
      frameSamples.current.push(ms);
      if (frameSamples.current.length > 180) frameSamples.current.shift();
      frameStalls.current.max = Math.max(frameStalls.current.max, ms);
      if (ms > 50) frameStalls.current.over50++;
      if (ms > 250) frameStalls.current.over250++;
    }
    metricsClock.current += renderedDelta;
    if (initialFrame || metricsClock.current > 1 || props.paused) {
      metricsClock.current = 0;
      let sceneTriangles = 0;
      scene.traverseVisible(object => {
        if (object instanceof Mesh) sceneTriangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3 * (object instanceof InstancedMesh ? object.count : 1);
      });
      const sortedFrames = [...frameSamples.current].sort((a, b) => a - b);
      const lamp = boat.root.localToWorld(boatLampProjection.copy(boat.lantern.position)).project(camera);
      gl.domElement.dataset.pond = JSON.stringify({ hour: light.hour, timestamp: lightSample.current.timestamp, latitude: props.observer.latitude, longitude: props.observer.longitude,
        moonFraction:light.moonFraction,moonPhase:light.moonPhase,sunAltitude:light.sunAltitude,moonAltitude:light.moonAltitude,time: clock.current, low,
        renderProfile: props.quality, dpr, shadowMapSize: sunlight.current?.shadow.map?.width,
        renderedFrames: renderedFrames.current,
        sampledAtMs: start,
        renderFrameP50: sortedFrames[Math.floor(sortedFrames.length * .5)] ?? 0,
        renderFrameP95: sortedFrames[Math.floor(sortedFrames.length * .95)] ?? 0,
        renderFrameMax: frameStalls.current.max, longFrames: frameStalls.current.over50, severeFrames: frameStalls.current.over250,
        programs: gl.info.programs?.length ?? 0, camera: camera.position.toArray(),
        sceneTriangles,
        calls: gl.info.render.calls, trianglesAcrossPasses: gl.info.render.triangles,
        meanCalls: Math.round(frame.calls / frame.count), meanTriangles: Math.round(frame.triangles / frame.count),
        shadowUpdates: frame.shadow, sampledFrames: frame.count, waterCaptures: water.captures,
        cpuRenderMs: +(performance.now() - start).toFixed(2), frameMs: +(renderedDelta * 1000).toFixed(2),
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
        boat: motion.current.position, boatAvailable: !!boatRoot.current, boatScale: boatRoot.current?.scale.x, boatCollisions: motion.current.collisions,
        boatLantern: { on: boatLampOn.current, x: .5 + lamp.x * .5, y: .5 - lamp.y * .5 },
        bodyContacts: bodyPhysics.current?.contacts ?? 0, collisionBodies: bodyPhysics.current?.bodies.length ?? 0,
        travel: sailing.current ? 'water' : null, waterTarget: sailing.current?.target ?? null, arrived: arrivedAtWater.current,
        boatAngle: motion.current.angle, boatYawRate: motion.current.yawRate,
        driftDestinations: wander.destinations, boatSpeed: Math.hypot(motion.current.velocity.x, motion.current.velocity.y) / 100, wakeEvents: ripples.boatEvents, fishVisits: fishSchool.visits,
        fishRipples: ripples.fishEvents, touchRipples: ripples.touchEvents, activeRipples: ripples.active(clock.current).length,
        paperSkimming: paperGesture.active, paperTouching: paperTouching.current, paperWakeEvents: paperWake.emitted, paperWakeSamples: paperWake.active(clock.current).length,
        wakeFieldActive: water.wakeField.active, wakeFieldSteps: water.wakeField.steps,
        surfaceReads:water.surface.reads,boatFloat:{height:buoyancy.heave.value,pitch:buoyancy.pitch.value,roll:buoyancy.roll.value},
        boatDrift:{...drift.velocity},boatVelocity:{...motion.current.velocity},
        paperSpeed: paperGesture.speed, paperDistance: paperGesture.distance, paperTail: paperProjection.tail.toArray(),
        surfacingFish: fishSchool.poses.filter(pose => pose.surfacing).length,
        fishLeaps:fishSchool.leaps,airborneFish:fishSchool.poses.findIndex(pose=>pose.leapPhase==='air'),sprayDrops:spray.mesh.count,
        fish: 7, pairedFishDistance:Math.hypot(fishSchool.poses[0].x-fishSchool.poses[1].x,fishSchool.poses[0].z-fishSchool.poses[1].z),heartEvents:fishSchool.heartEvents,
        swan:{...swanLife.pose,destinations:swanLife.destinations,flights:swanLife.flights},dragonflies:3,fireflies:islands.fireflies.visible,
        animalEvents:habitatLife.events,turtles:habitatLife.turtles.map(p=>p.mode),frog:frogState(habitatLife),tadpoles:habitatLife.tadpoles.length,interactions:{...touchCounts.current,...islands.counts},reflection: water.resolution,waterCaptureSize:water.captureSize,
        refractionSamples: water.refractionSamples });
      frame.count = frame.calls = frame.triangles = frame.shadow = 0;
    }
    if (initialFrame) {
      firstFrame.current = false;
      props.onReady();
    }
  }, 1);

  return <>
    <PondCamera interactive={!fullScenery} reduced={props.reduced} label={props.sceneLabel} reset={props.viewReset} focus={focus}
      getBoatPose={getBoatPose} onChange={props.onViewChange} onRide={props.onRide} onFramed={props.onFramed} />
    <primitive object={atmosphere.group} dispose={null} />
    <primitive object={garden.group} dispose={null} />
    <primitive object={banks.group} dispose={null} />
    <primitive object={vista.group} dispose={null} />
    <primitive object={landscape.group} dispose={null} onClick={(event:ThreeEvent<MouseEvent>)=>event.stopPropagation()} />
    <primitive object={grove.group} dispose={null} onClick={(event:ThreeEvent<MouseEvent>)=>event.stopPropagation()} />
    <primitive object={islands.effects} dispose={null} />
    <primitive object={shoreLotus.group} dispose={null} onClick={touchLeaf} />
    <primitive object={westPier.group} dispose={null} onClick={(event:ThreeEvent<MouseEvent>)=>event.stopPropagation()} />
    <primitive object={habitat.group} dispose={null} onClick={touchLeaf} />
    <primitive object={sanctuaryGroundcover.group} dispose={null} />
    <primitive object={wildlife.group} dispose={null} onClick={(event:ThreeEvent<MouseEvent>)=>{
      if (pondInteractionId(event.object) !== 'swan') return;
      event.stopPropagation();
      const time = clock.current, pose = swanLife.pose;
      if (props.paused || event.delta > 6 || pose.y-pose.waterHeight > .11 || time-lastTouch.current < .35) return;
      lastTouch.current = time;
      touchCounts.current.swan++;
      wildlife.notice(time, camera.position);
      ripples.emit(pose.x,pose.z,time,.24,'touch');
    }} />
    <primitive object={animals.group} dispose={null} onClick={(event:ThreeEvent<MouseEvent>)=>{
      const id=pondInteractionId(event.object);if(!id)return;event.stopPropagation();
      if(props.paused||event.delta>6||clock.current-lastTouch.current<.35)return;
      lastTouch.current=clock.current;touchCounts.current.animal++;
      const body=[...fishSchool.collisionBodies,...habitatLife.collisionBodies].find(b=>b.id===id);
      if(!body)return;
      const {x,y,z}=body.pose;
      if(id.startsWith('koi-'))fishSchool.notice(x,z,clock.current,Number(id.slice(4)));
      else habitatLife.notice(x,z,clock.current,id);
      if(y<.05)ripples.emit(x,z,clock.current,.25,'touch');
    }} />
    <primitive object={hearts.group} dispose={null} />
    <primitive object={spray.mesh} dispose={null} />
    <hemisphereLight ref={fill} />
    <directionalLight ref={sunlight} castShadow
      shadow-mapSize-width={shadow.mapSize} shadow-mapSize-height={shadow.mapSize} shadow-radius={shadow.sunRadius}
      shadow-camera-left={-pondShadowCamera.extent} shadow-camera-right={pondShadowCamera.extent}
      shadow-camera-top={pondShadowCamera.extent} shadow-camera-bottom={-pondShadowCamera.extent}
      shadow-camera-near={pondShadowCamera.near} shadow-camera-far={pondShadowCamera.far}
      shadow-bias={shadow.bias} shadow-normalBias={shadow.normalBias} />
    <directionalLight ref={moonlight} castShadow
      shadow-mapSize-width={shadow.mapSize} shadow-mapSize-height={shadow.mapSize}
      shadow-camera-left={-pondShadowCamera.extent} shadow-camera-right={pondShadowCamera.extent}
      shadow-camera-top={pondShadowCamera.extent} shadow-camera-bottom={-pondShadowCamera.extent}
      shadow-camera-near={pondShadowCamera.near} shadow-camera-far={pondShadowCamera.far}
      shadow-bias={shadow.bias} shadow-normalBias={shadow.normalBias} />
    <mesh name="PondFloor" material={sediment.ground} geometry={bed} receiveShadow />
    <primitive object={islands.group} dispose={null} onClick={(event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (event.delta > 6) return;
      const island = pondIslandSite(event.object);
      if (island && lookCloser(event, island)) return;
      const action = pondIslandAction(event.object);
      if (action) playIsland(action);
    }} />
    <group ref={boatRoot} scale={boatScale} position={[boatStart.x/100,-boatDraft,boatStart.y/100]} rotation={[0,1.2,0]} userData={{pondBodyId:'boat'}} onClick={(event:ThreeEvent<MouseEvent>)=>{
      event.stopPropagation();
      if (event.delta > 6) return;
      if (event.object.parent?.userData.pondBoatLantern) {
        toggleBoatLantern();
        return;
      }
      if (lookCloser(event, 'boat')) return;
      if (props.paused || clock.current-lastTouch.current < .35) return;
      lastTouch.current=clock.current;touchCounts.current.boat++;
      buoyancy.tap();
      ripples.emit(boatSurface.x,boatSurface.y,clock.current,.48,'touch');
      boat.cat?.notice(clock.current, event.point);
    }}>
      <primitive object={boat.root} dispose={null} />
      <pointLight ref={boatLight} name="BoatLanternLight" position={boat.lantern.position} color="#ffd2a0" intensity={0} distance={1.75 * boatSizeMultiplier} decay={2} />
    </group>
    <primitive object={water.water} onClick={(event: ThreeEvent<MouseEvent>) => {
      // Visible swimmers have priority. A bank occludes water only ahead of the surface.
      if (props.paused || event.delta > 6) return;
      if (event.intersections.some(hit => pondInteractionId(hit.object)
        || (hit.distance <= event.distance && (pondIslandHit(hit.object) ||
          hit.object.userData.pondShoreLeaves || hit.object.userData.pondPadIndex !== undefined)))) return;
      const { x, z } = event.point;
      event.stopPropagation();
      touchWater(x,z);
    }} />
  </>;
}

function pondInteractionId(object:Object3D):string|undefined{
  for(let current:Object3D|null=object;current;current=current.parent)if(current.userData.pondBodyId)return current.userData.pondBodyId;
  return undefined;
}
function pondIslandAction(object: Object3D): IslandPlay | undefined {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.pondIslandAction) return node.userData.pondIslandAction;
  }
  return undefined;
}
function pondIslandSite(object: Object3D): IslandPlay | undefined {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.pondViewingSite) return node.userData.pondViewingSite;
  }
  return undefined;
}
function pondIslandHit(object:Object3D):boolean{
  for(let current:Object3D|null=object;current;current=current.parent)if(current.name.startsWith('island-'))return true;
  return false;
}
const frogState=(life:HabitatLife)=>({mode:life.frog.mode,pad:life.frog.padIndex});
