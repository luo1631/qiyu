import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLayout } from '../src/config/islands';
import { navigationLayout } from '../src/scene/layout';
import { BoatMotion, clearSegment, distance, planRoute, safe } from '../src/scene/navigation';

for(const [width,height] of [[320,650],[390,844],[600,900],[768,1024],[1366,768],[1920,1080],[844,500]]){
  test(`all shores are reachable and collision-free at ${width}×${height}`,()=>{
    const layout=getLayout(width,height), {bounds,obstacles}=navigationLayout(width,height,layout);
    const center={x:width*.49,y:height*.49};
    assert.ok(safe(center,obstacles,bounds),'initial boat position is safe');
    const starts=[center,...layout.map(i=>i.dock)];
    for(const start of starts)for(const island of layout){
      assert.ok(safe(island.dock,obstacles,bounds),`${island.config.id} dock is safe`);
      const route=planRoute(start,island.dock,obstacles,bounds);
      assert.ok(route.length>1,`${island.config.id} has a route`);
      for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i],obstacles,bounds));
      const motion=new BoatMotion(start);motion.setRoute(route);
      let arrived=false;
      for(let frame=0;frame<18000&&!arrived;frame++){
        const previous={...motion.position};arrived=motion.update(1/60,90,obstacles,bounds);
        assert.ok(safe(motion.position,obstacles,bounds));
        assert.ok(distance(previous,motion.position)<=1.51,'bounded movement per frame');
      }
      assert.ok(arrived,`${island.config.id} arrival completes`);
      assert.ok(distance(motion.position,island.dock)<2.5);
    }
  });
}
test('retargeting preserves position, momentum, and safe navigation',()=>{
  const w=1366,h=900,layout=getLayout(w,h),{bounds,obstacles}=navigationLayout(w,h,layout);
  const m=new BoatMotion({x:w*.49,y:h*.49});
  m.setRoute(planRoute(m.position,layout[0].dock,obstacles,bounds));
  for(let n=0;n<95;n++)m.update(1/60,90,obstacles,bounds);
  for(const island of [...layout].reverse()){
    const before={...m.position},velocity={...m.velocity},angle=m.angle;
    m.setRoute(planRoute(m.position,island.dock,obstacles,bounds));
    assert.deepEqual(m.position,before);assert.deepEqual(m.velocity,velocity);assert.equal(m.angle,angle);
    for(let n=0;n<25;n++)m.update(1/60,90,obstacles,bounds);
  }
});

test('route reuse refreshes static links when a shore obstacle changes size', () => {
  const bounds = { left: -250, right: 250, top: -200, bottom: 200 };
  const obstacles = [{ x: 0, y: 0, rx: 48, ry: 39 }];
  const start = { x: -180, y: 0 }, end = { x: 180, y: 0 };
  const original = planRoute(start, end, obstacles, bounds);
  assert.deepEqual(planRoute(start, end, obstacles, bounds), original);

  obstacles[0].ry = 95;
  const changed = planRoute(start, end, obstacles, bounds);
  assert.notDeepEqual(changed, original);
  assert.deepEqual(changed, planRoute(start, end, [{ ...obstacles[0] }], bounds));
  assert.deepEqual(changed.at(-1), end);
  assert.ok(changed.slice(1).every((point, i) => clearSegment(changed[i], point, obstacles, bounds)));
});
