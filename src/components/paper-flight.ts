type Point = { x: number; y: number };
type Checkpoint = Point & { at: number };

const checkpointDistance = 14, wakeLife = 640;
const unit = (value: number) => Math.max(0, Math.min(1, value));

export function createPaperFlight(layer: SVGSVGElement, wake: SVGGElement) {
  const air = layer.querySelector<SVGGElement>('.flight-air')!;
  let pointer: Point | null = null, guide: Point | null = null, checkpoint: Checkpoint | null = null;
  let movedAt = 0, lastFrame = 0, frame = 0, speed = 0, pressure = 0;

  function depositWake(from: Checkpoint, to: Checkpoint, length: number, now: number) {
    const elapsed = to.at - from.at;
    const dx = to.x - from.x, dy = to.y - from.y;
    const steps = Math.max(1, Math.min(Math.ceil(length / 6), Math.ceil(elapsed / 13)));
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const width = 3.4 + 2.3 * unit(length / Math.max(16, elapsed));
    // Interpolate the mouse's passage time as well as its position. The oldest air clears first.
    for (let i = 0; i < steps; i++) {
      const t = (i + .5) / steps, age = Math.max(0, now - (from.at + t * elapsed));
      if (age >= wakeLife) continue;
      const patch = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      patch.setAttribute('rx', String(Math.min(30, 11 + length / steps * .65)));
      patch.setAttribute('ry', String(width));
      patch.setAttribute('transform', 'translate(' + (from.x + dx * t) + ' ' + (from.y + dy * t) + ') rotate(' + angle + ')');
      patch.style.animationDelay = -age + 'ms';
      wake.append(patch);
    }
  }

  function paint(now: number) {
    frame = 0;
    if (!pointer || !guide || !checkpoint) return;
    const dt = Math.max(1, Math.min(55, now - lastFrame));
    lastFrame = now;
    const dx = pointer.x - guide.x, dy = pointer.y - guide.y, lag = Math.hypot(dx, dy);
    // Filter only the wake samples. The browser positions the original cursor at its native hotspot.
    const response = 1 - Math.exp(-dt / (125 - 99 * unit((lag - 16) / 40)));
    guide = lag < .08 ? pointer : { x: guide.x + dx * response, y: guide.y + dy * response };
    const distance = Math.hypot(guide.x - checkpoint.x, guide.y - checkpoint.y);
    if (distance >= checkpointDistance) {
      const next = { ...guide, at: movedAt };
      if (next.at > checkpoint.at) speed = distance / Math.max(16, next.at - checkpoint.at);
      if (distance <= 220) depositWake(checkpoint, next, distance, now);
      checkpoint = next;
    }

    const idle = Math.max(0, now - movedAt - 36);
    const wind = speed && now - checkpoint.at < wakeLife
      ? Math.min(1, .16 + .75 * Math.sqrt(speed)) * Math.exp(-idle / 80) : 0;
    pressure += (wind - pressure) * (1 - Math.exp(-dt / 100));
    if (pressure < .003 && wind < .003) pressure = 0;
    air.setAttribute('transform', 'scale(' + (.78 + pressure * .36) + ' ' + (.78 + pressure * .30) + ')');
    air.style.opacity = (.96 * pressure).toFixed(3);
    if (lag >= .08 || pressure > 0) frame = requestAnimationFrame(paint);
  }

  function move(x: number, y: number, now: number) {
    if (pointer?.x === x && pointer.y === y) return;
    if (!checkpoint || (pointer && now - movedAt >= wakeLife)) {
      checkpoint = { ...(pointer ?? { x, y }), at: now };
      speed = 0;
    }
    pointer = { x, y }; guide ??= pointer; movedAt = now;
    layer.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    if (!frame) { lastFrame = now - 16; paint(now); }
  }

  function reset(clearWake = false) {
    cancelAnimationFrame(frame); frame = 0;
    pointer = guide = checkpoint = null; speed = pressure = 0;
    air.style.opacity = '0';
    if (clearWake) wake.replaceChildren();
  }
  const retire = (event: AnimationEvent) => { if (event.target instanceof SVGEllipseElement) event.target.remove(); };
  wake.addEventListener('animationend', retire);
  return { move, reset, dispose() { reset(true); wake.removeEventListener('animationend', retire); } };
}
