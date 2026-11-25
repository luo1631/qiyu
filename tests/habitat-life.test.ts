import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frogWaterLanding, HabitatLife } from '../src/scene/habitat-life';
import { RippleField, sampleSurface } from '../src/scene/pond-life';
import { boatStart, fishObstacles, worldBounds } from '../src/scene/world-layout';
import { clearSegment, safe } from '../src/scene/navigation';
import { animalIsland, frogFootHeight, turtleBackHeight, islandRadius, lilyPads, padSurfaceHeight } from '../src/scene/habitat-layout';

test('turtles finish water, bank and piggyback visits continuously across seeds and frame rates', () => {
  const otherIslands = fishObstacles.filter(o => o.x !== animalIsland.x * 100 || o.y !== animalIsland.z * 100);
  for (const [seed, dt] of [[7, 1 / 60], [9127, 1 / 30], [1621, .08]]) {
    const life = new HabitatLife(seed), ripples = new RippleField();
    const seen = life.turtles.map(() => new Set<string>());
    for (let frame = 1; frame <= 300 / dt; frame++) {
      const old = life.turtles.map(p => ({ ...p }));
      life.update(dt, frame * dt, ripples, boatStart);
      life.turtles.forEach((p, i) => {
        seen[i].add(p.mode);
        assert.ok([p.x, p.y, p.z, p.yaw, p.pitch, p.speed].every(Number.isFinite));
        assert.ok(Math.hypot(p.x - old[i].x, p.z - old[i].z) < .42 * dt, `no horizontal jump: ${seed},${i},${p.mode}`);
        assert.ok(Math.abs(p.y - old[i].y) < .65 * dt, `no height jump: ${seed},${i},${p.mode}`);
        assert.ok(safe({ x: p.x * 100, y: p.z * 100 }, otherIslands, worldBounds), 'no crossing other islands');
        if (p.mode === 'ride') {
          assert.ok(Math.hypot(p.x - life.turtles[0].x, p.z - life.turtles[0].z) < .12);
          assert.ok(Math.abs(p.y - life.turtles[0].y - turtleBackHeight) < .005, 'small turtle actually supported by big shell');
        }
      });
    }
    assert.ok(life.events.landings >= 2, `both turtles reach the bank: ${seed} ${JSON.stringify(life.events)}`);
    assert.ok(life.events.rides >= 1, `piggyback finishes approach: ${seed} ${JSON.stringify(life.events)}`);
    assert.ok(seen[0].has('bask') && seen[0].has('leave'), `big turtle returns to water: ${seed}`);
    assert.ok(seen[1].has('climbBack') && seen[1].has('ride') && seen[1].has('dismount') && seen[1].has('leave'));
  }
});

test('frog reaches real pads and the six tadpoles stay submerged and nearby', () => {
  for (const seed of [7, 9127, 1621]) {
    const life = new HabitatLife(seed), ripples = new RippleField(), pads = new Set<number>();
    for (let frame = 1; frame <= 360 * 30; frame++) {
      const previous = { ...life.frog }, oldTadpoles = life.tadpoles.map(p => ({ ...p }));
      life.update(1 / 30, frame / 30, ripples, boatStart);
      const frog = life.frog;
      assert.ok(Math.hypot(frog.x - previous.x, frog.z - previous.z) < 1.1 / 30, 'frog hops continuously');
      assert.ok(Math.abs(frog.y - previous.y) < 2.2 / 30, 'parabolic jump has no height reset');
      if (frog.mode === 'rest') {
        const pad = lilyPads[frog.padIndex]; pads.add(frog.padIndex);
        assert.ok(Math.hypot(frog.x - pad.x, frog.z - pad.z) < .005);
        const supportedY = padSurfaceHeight(sampleSurface(pad.x, pad.z, frame / 30).height, true);
        assert.ok(Math.abs(frog.y + frogFootHeight - supportedY) < .00001, 'feet share the occupied leaf surface, not an independent bob');
      }
      assert.equal(life.tadpoles.length, 6);
      for (const [i, p] of life.tadpoles.entries()) {
        assert.ok(p.y < -.19 && p.y > -.36, 'tadpoles never leap onto a pad');
        assert.ok(Math.hypot(p.x - oldTadpoles[i].x, p.z - oldTadpoles[i].z) < .82 / 30);
        assert.ok(Math.hypot(p.x - frog.x, p.z - frog.z) < 2, `followers remain with frog: seed=${seed}, t=${frame / 30}, i=${i}`);
        // Public poses round-trip centimetres through metres; an exact bank
        // tangent can move by one ULP. This is 0.00001 mm, not body clearance.
        assert.ok(safe({ x: p.x * 100, y: p.z * 100 }, fishObstacles, worldBounds, -1e-6));
        assert.ok(islandRadius(p.x, p.z) > 1.1);
      }
    }
    assert.ok(pads.size >= 3, `varied pads, seed=${seed}, pads=${[...pads]}`);
    assert.ok(life.events.frogJumps >= 8);
  }
});

test('zero elapsed time leaves all habitat poses and event schedules untouched', () => {
  const life = new HabitatLife(41), ripples = new RippleField();
  for (let n = 1; n < 900; n++) life.update(1 / 30, n / 30, ripples, boatStart);
  const snapshot = JSON.stringify([life.turtles, life.frog, life.tadpoles, life.events]);
  for (let n = 0; n < 30; n++) life.update(0, 200 + n, ripples, boatStart);
  assert.equal(JSON.stringify([life.turtles, life.frog, life.tadpoles, life.events]), snapshot);
});

test('turtles roam separated pond regions and keep swimming while waiting for the adult',()=>{
  for(const seed of [7,9127,1621]){
    const life=new HabitatLife(seed),ripples=new RippleField();
    const extent=life.turtles.map(()=>({minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,stalled:0}));
    for(let n=1;n<=600*30;n++){
      const previous=life.turtles.map(p=>({...p}));life.update(1/30,n/30,ripples,boatStart);
      life.turtles.forEach((p,i)=>{
        const e=extent[i];e.minX=Math.min(e.minX,p.x);e.maxX=Math.max(e.maxX,p.x);e.minZ=Math.min(e.minZ,p.z);e.maxZ=Math.max(e.maxZ,p.z);
        const inWater=p.mode==='swim'||p.mode==='follow'||p.mode==='shore';
        e.stalled=inWater&&Math.hypot(p.x-previous[i].x,p.z-previous[i].z)<.00005?e.stalled+1/30:0;
        assert.ok(e.stalled<8,`no long frozen rendezvous: ${seed},${i},${p.mode},${n/30}`);
      });
    }
    extent.forEach(e=>assert.ok(e.maxX-e.minX>7&&e.maxZ-e.minZ>6,'each turtle travels beyond its home corner'));
    assert.ok(life.events.rides>0,'exploration preserves a complete piggyback visit');
  }
});

test('every leaf-to-leaf departure has a clear water landing, including the bank-facing pad 4 to pad 0 hop', () => {
  for (const [i, pad] of lilyPads.entries()) for (const [j, target] of lilyPads.entries()) {
    if (i === j) continue;
    const landing = frogWaterLanding(pad, target, pad.radius + .27);
    assert.ok(landing, `a safe departure exists from pad ${i} toward pad ${j}`);
    const a = { x: pad.x * 100, y: pad.z * 100 }, b = { x: landing.x * 100, y: landing.z * 100 };
    assert.ok(safe(b, fishObstacles, worldBounds, 5), `landing clears banks: ${i}->${j}`);
    assert.ok(clearSegment(a, b, fishObstacles, worldBounds), `entire hop clears banks: ${i}->${j}`);
    assert.ok(Math.abs(Math.hypot(landing.x - pad.x, landing.z - pad.z) - pad.radius - .27) < 1e-9, 'direction changes before launch, never endpoint teleportation');
    if (i === 4 && j === 0) assert.ok(Math.hypot(landing.x - 4.75085, landing.z + 3.08491) > .1, 'regression: old straight landing was inside the animal island obstacle');
  }
});

test('frog explores open water without stalling and still returns to pads throughout long sessions', () => {
  for (const seed of [4, 41, 392, 9127]) {
    const life = new HabitatLife(seed), ripples = new RippleField();
    let lastJumpAt = 0, jumps = 0,stalled=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (let frame = 1; frame <= 1200 * 20; frame++) {
      const time = frame / 20, previous = { ...life.frog };
      life.update(1 / 20, time, ripples, boatStart);
      const p = life.frog;
      assert.ok(safe({ x: p.x * 100, y: p.z * 100 }, fishObstacles, worldBounds), `frog always returns to navigable water: seed ${seed}, t=${time}, mode=${p.mode}`);
      assert.ok(Math.hypot(p.x - previous.x, p.z - previous.z) < 1.1 / 20, 'landing recovery never teleports');
      if (life.events.frogJumps > jumps) { jumps = life.events.frogJumps; lastJumpAt = time; }
      const moved=Math.hypot(p.x-previous.x,p.z-previous.z);
      stalled=(p.mode==='swim'||p.mode==='approach')&&moved<.00005?stalled+.05:0;
      assert.ok(stalled<10,`free swimmer keeps making progress: seed ${seed}, t=${time}`);
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
      assert.ok(time - lastJumpAt < 200, `exploration still returns to a reachable pad: seed ${seed}, t=${time}`);
    }
    assert.ok(jumps > 16);
    assert.ok(maxX-minX>7&&maxZ-minZ>6,'frog visits separated water regions instead of only circling its home island');
  }
});
