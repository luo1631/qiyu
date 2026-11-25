/** Run against the loaded journey in a foreground browser, after is-ready.
 * Checks actual WebGL program creation, the preview clock and phase controls.
 * Performance values are reported, not asserted against a machine-specific FPS.
 */
export async function checkDayNightSwitches(count = 4, reduced = false) {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
  const button = document.querySelector<HTMLButtonElement>('.phase-toggle')!;
  const gl = canvas.getContext('webgl2')!;
  const read = () => JSON.parse(canvas.dataset.pond!);
  const offset = () => Number(button.dataset.previewOffset);
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
  check(document.visibilityState === 'visible', 'Performance checks require a foreground page');
  check(!!button.getAttribute('aria-label'), 'The phase switch has an accessible name');
  const original = gl.linkProgram;
  const programs: { phase: number; at: number }[] = [];
  const longTasks: { phase: number; at: number; ms: number }[] = [];
  const frames: { phase: number; ms: number }[] = [];
  const snapshots: Record<string, unknown>[] = [];
  let phase = 0, running = true, previous = performance.now();
  gl.linkProgram = function(program) { programs.push({ phase, at: performance.now() }); return original.call(this, program); };
  const observer = new PerformanceObserver(list => {
    for (const task of list.getEntries()) longTasks.push({ phase, at: task.startTime, ms: task.duration });
  });
  observer.observe({ type: 'longtask' });
  const frame = (now: number) => {
    if (!running) return;
    frames.push({ phase, ms: now - previous }); previous = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  try {
    await wait(2000);
    const initialTime = read().time;
    let previousOffset = offset(), previousNight = document.querySelector('main')!.classList.contains('at-night');
    for (phase = 1; phase <= count; phase++) {
      button.click();
      await wait(reduced ? 300 : 2400);
      // Metrics publish once per second; the last snapshot can precede the 1.4 s animation end.
      const deadline = performance.now() + 2000;
      while (Math.abs(read().timestamp - Date.now() - offset() * 3600000) >= 5600 && performance.now() < deadline) await wait(100);
      const data = read(), realNow = Date.now(), expected = offset();
      const night = document.querySelector('main')!.classList.contains('at-night');
      check(expected > previousOffset && expected - previousOffset < 24, 'Each click must preview the next opposite phase within a day');
      check(night !== previousNight, 'Each click must switch between day and night, including winter dusk');
      check(night ? data.sunAltitude < -1.5 : data.sunAltitude > 4.5, 'Preview must leave twilight for a clear day/night scene');
      check(Math.abs(data.timestamp - realNow - expected * 3600000) < 5600, 'Preview must reach its target');
      if (data.sunAltitude > 5) check(!night, 'Daytime scene must have daytime controls');
      if (data.sunAltitude < -2) check(night, 'Nighttime scene must have nighttime controls');
      if (reduced) check(data.time === initialTime, 'Reduced motion must keep animal simulation still');
      snapshots.push({ phase, expected, night, ...data });
      previousOffset = expected; previousNight = night;
    }
    const switchingPrograms = programs.filter(event => event.phase > 0);
    check(switchingPrograms.length === 0, 'Day/night switching must reuse warmed shader programs');
    return { programs, longTasks, snapshots, frames,
      maxSwitchFrameMs: Math.max(0, ...frames.filter(event => event.phase > 0).map(event => event.ms)) };
  } finally {
    running = false;
    observer.disconnect();
    gl.linkProgram = original;
  }
}
