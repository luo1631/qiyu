// Run from the ready desktop 3D journey: import('/tests/cursor.browser.ts').then(m => m.checkCursorStates()).
import { _roots } from '@react-three/fiber';
import { Vector3 } from 'three';

export async function checkCursorStates() {
  const canvas = document.querySelector<HTMLCanvasElement>('.scene canvas')!;
  const context = _roots.get(canvas)!.store.getState();
  const world = context.scene.getObjectByName('PondIslands')!;
  const point = new Vector3();
  world.getObjectByName('PeachTree')!.getWorldPosition(point).project(context.camera);
  const x = (point.x+1)*innerWidth/2, y = (1-point.y)*innerHeight/2;
  const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const active = () => canvas.closest('.journey-page')!.hasAttribute('data-cursor-breeze');
  const move = (px: number) => document.elementFromPoint(px, y)!.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, pointerType: 'mouse', pointerId: 1, clientX: px, clientY: y,
  }));
  check(innerWidth >= 1100 && matchMedia('(any-hover: hover) and (prefers-reduced-motion: no-preference)').matches,
    'Run this check in a desktop viewport with motion enabled');
  const restore: (() => void)[] = [];
  let islandRaycasts = 0, activeSamples = 0, crossedIsland = false;
  world.traverse(object => {
    const original = object.raycast;
    object.raycast = function(...args) { islandRaycasts++; return original.apply(this, args); };
    restore.push(() => { object.raycast = original; });
  });
  try {
    canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'mouse' }));
    move(x + 300); await wait(300);
    const restingCursor = getComputedStyle(canvas).cursor;
    check(!active(), 'Ordinary movement must not activate wind');
    const plane = document.querySelector<SVGSVGElement>('.paper-flight')!;
    check(restingCursor.includes('3 3') && restingCursor !== 'none', 'The original native plane must be visible at its tip hotspot');
    check(islandRaycasts === 0, 'Open water must be rejected before testing detailed island meshes');
    move(x + 300); move(x - 125);
    check(canvas.dataset.paperSkimming === 'true' && active(),
      'A quick movement past the distance threshold activates the skim and its cursor immediately');
    canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'mouse' }));
    const start = performance.now();
    for (let step = 0; performance.now() - start < 4200; step++) {
      const phase = step % 40, px = x + (phase <= 20 ? 280 - phase * 28 : -280 + (phase - 20) * 28);
      move(px); await frame(); await frame();
      if (canvas.dataset.paperSkimming !== 'true' && !activeSamples) continue;
      check(canvas.dataset.paperSkimming === 'true' && active(),
        'An activated skim must remain continuous across water and island meshes');
      const anchor = plane.querySelector<SVGGElement>('.flight-bow')!.getScreenCTM()!;
      check(getComputedStyle(canvas).cursor === restingCursor && Math.hypot(anchor.e - px, anchor.f - y) < 1,
        'The fixed bow must meet the native cursor over the full scene');
      activeSamples++;
      crossedIsland ||= Math.abs(px-x) < 26 && document.elementFromPoint(px,y) === canvas;
    }
    check(activeSamples > 10 && crossedIsland, `The path must cross the island (${activeSamples} active samples)`);
    // End off the control so idle expiry is tested independently of hover.
    move(x + 300); await wait(800);
    check(!active() && canvas.dataset.paperSkimming !== 'true',
      'Stopping must clear both the gesture and wind without another mouse event');
    check(getComputedStyle(canvas).cursor === restingCursor && !document.querySelector('.flight-wake ellipse'),
      'Stopping must dissipate the trail and keep the plane visible');
    check(!document.querySelector('.journey-page nav, .journey-page [data-island]'), 'The scene must expose no island navigation');
    return { activeSamples, crossedIsland, islandRaycasts, checks: 10 };
  } finally {
    restore.forEach(reset => reset());
    canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'mouse' }));
  }
}
