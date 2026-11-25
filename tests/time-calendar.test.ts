import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { civilTime } from '../src/config/clock';
import { horizontalToWorld, lightingAt, nextPhaseTime, observerAt } from '../src/scene/time';
import { pondFraming } from '../src/scene/world-layout';
import { makePondAtmosphere } from '../src/scene/PondAtmosphere';
import { pondSkyLight } from '../src/scene/sky-light';

const zone='Asia/Shanghai';
const pacificTimeZone='America/Los_Angeles';
test('winter dusk switches to full daylight even when twelve hours later is still dark',()=>{
  const date=new Date('2026-11-04T09:15:00Z'),observer=observerAt(date,zone);
  assert.ok(lightingAt(date,observer).night>.9);
  assert.equal(lightingAt(new Date(+date+12*3600000),observer).night,1);
  const day=nextPhaseTime(date,observer),night=nextPhaseTime(day,observer);
  assert.ok(+day>+date);
  assert.equal(lightingAt(day,observer).daylight,1);
  assert.ok(+night>+day);
  assert.equal(lightingAt(night,observer).night,1);
});

test('preview alternates full day and night across seasons, time zones and repeated clicks',()=>{
  for(const timeZone of [zone,pacificTimeZone,'Asia/Kolkata','Pacific/Auckland']){
    for(const month of [0,2,5,8,10,11])for(let hour=0;hour<24;hour++){
      let date=new Date(Date.UTC(2026,month,4,hour,15));
      const observer=observerAt(date,timeZone);
      for(let click=0;click<4;click++){
        const wasNight=lightingAt(date,observer).night>.5,next=nextPhaseTime(date,observer);
        const light=lightingAt(next,observer),context=`${timeZone} ${date.toISOString()} click ${click}`;
        assert.ok(+next>+date&&+next-+date<24*3600000,context);
        assert.ok((wasNight?light.daylight:light.night)>=.99,context);
        date=next;
      }
    }
  }
});

test('one UTC instant converts to Pacific and visitor civil dates without double shifting',()=>{
  const date=new Date('2026-01-01T07:30:00Z');
  assert.equal(civilTime(date,pacificTimeZone).key,'2025-12-31');
  assert.equal(civilTime(date,pacificTimeZone).hour,23);
  assert.equal(civilTime(date,zone).key,'2026-01-01');
  assert.equal(civilTime(date,zone).hour,15);
  assert.equal(civilTime(date,'Asia/Kolkata').minute,0);
  assert.equal(observerAt(date,zone).latitude,29);
  assert.equal(observerAt(date,zone).longitude,120);
});

test('DST and midnight change the civil clock but never jump the celestial orbit',()=>{
  for(const [a,b,hour] of [
    ['2026-03-08T09:59:59Z','2026-03-08T10:00:00Z',3],
    ['2026-11-01T08:59:59Z','2026-11-01T09:00:00Z',1],
    ['2026-06-02T06:59:59Z','2026-06-02T07:00:00Z',0],
  ] as const){
    const before=new Date(a),after=new Date(b),o=observerAt(before,pacificTimeZone);
    assert.equal(o.longitude,-120);assert.deepEqual(o,observerAt(after,pacificTimeZone));
    assert.equal(civilTime(after,pacificTimeZone).hour,hour);
    const l=lightingAt(before,o),r=lightingAt(after,o);
    for(const body of ['sun','moon'] as const)assert.ok(new Vector3(...l[body]).distanceTo(new Vector3(...r[body]))<.02);
  }
});

test('29°N seasonal solar altitudes and date-dependent moon phases follow independent fixtures',()=>{
  const observer=observerAt(new Date('2026-01-01'),zone);
  // Solstice noon altitude ≈ 90° − |latitude − declination|, within equation-of-time error.
  assert.ok(Math.abs(lightingAt(new Date('2026-06-21T04:00:00Z'),observer).sunAltitude-84.44)<.3);
  assert.ok(Math.abs(lightingAt(new Date('2026-12-21T04:00:00Z'),observer).sunAltitude-37.56)<.3);
  // Hong Kong Observatory 2026 almanac: new moon Nov 9 15:02 HKT; full Nov 24 22:54 HKT.
  assert.ok(lightingAt(new Date('2026-11-09T07:02:00Z'),observer).moonFraction<.005);
  assert.ok(lightingAt(new Date('2026-11-24T14:54:00Z'),observer).moonFraction>.995);
  const first=lightingAt(new Date('2026-11-17T11:48:00Z'),observer);
  assert.ok(Math.abs(first.moonFraction-.5)<.025);assert.ok(first.moonWaxing);
  let daytimeMoon=false;
  for(let h=0;h<24*30;h++){
    const l=lightingAt(new Date(Date.UTC(2026,10,1,h)),observer);
    assert.ok(Math.abs(Math.hypot(...l.sun)-145)<1e-8);
    assert.ok(Math.abs(Math.hypot(...l.moon)-125)<1e-8);
    if(l.sunAltitude<0)assert.equal(l.sunPower,0);
    if(l.moonAltitude<0)assert.equal(l.moonPower,0);
    if(l.sunAltitude>0&&l.moonAltitude>0)daytimeMoon=true;
  }
  assert.ok(daytimeMoon,'Moon is not mechanically opposite the Sun');
});

test('all camera aspect ratios keep north up, east left and west right',()=>{
  for(const [w,h] of [[1440,900],[390,844],[320,720],[844,390]]){
    const f=pondFraming(w,h),camera=new PerspectiveCamera(f.fov,w/h,.1,1200);
    camera.position.set(...f.position);camera.lookAt(0,.5,0);camera.updateMatrixWorld();
    const center=new Vector3().project(camera),project=(az:number)=>new Vector3(...horizontalToWorld(0,az,4)).project(camera).sub(center);
    assert.ok(project(0).y>0&&Math.abs(project(0).x)<1e-8);
    assert.ok(project(90).x<0&&project(270).x>0&&project(180).y<0);
  }
});

test('the sky uses the light directions and retains afterglow separately from the day/night transition',()=>{
  const observer=observerAt(new Date('2026-01-01'),zone);
  const atmosphere = makePondAtmosphere();
  try {
    for (const iso of ['2026-11-17T11:48:00Z', '2026-11-23T09:20:00Z', '2026-11-09T07:02:00Z']) {
      const light = lightingAt(new Date(iso), observer);
      atmosphere.update(0, light);
      const moon = new Vector3(...light.moon).normalize();
      assert.ok(atmosphere.uniforms.lunarDirection.value.distanceTo(moon) < 1e-9);
      assert.ok(atmosphere.uniforms.atmosphereSun.value.distanceTo(new Vector3(...light.sun).normalize()) < 1e-9);
      assert.ok(Math.abs(atmosphere.uniforms.lunarRight.value.dot(moon)) < 1e-9);
      assert.ok(Math.abs(atmosphere.uniforms.lunarIllumination.value.dot(moon) - (1 - 2 * light.moonFraction)) < 1e-8);
      if (light.moonAltitude < -.2 || light.moonFraction < .004) assert.equal(atmosphere.uniforms.lunarDiscVisibility.value, 0);
    }
  } finally { atmosphere.dispose(); }
  assert.ok(pondSkyLight(-4).afterglow > .85);
  assert.equal(pondSkyLight(-18).afterglow, 0);
  assert.equal(pondSkyLight(-4).starlight, 0);
  assert.equal(pondSkyLight(-18).starlight, 1);
  for(const month of [2,5,8,11]){
    let transitionMinutes=0;
    for(let minute=0;minute<1440;minute++){
      const l=lightingAt(new Date(Date.UTC(2026,month,21,0,minute)),observer);
      if(l.daylight>.01&&l.daylight<.99)transitionMinutes++;
    }
    assert.ok(transitionMinutes>20&&transitionMinutes<70,'both daily colour transitions together remain under 70 min');
  }
});
