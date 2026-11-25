import { useEffect, useRef } from 'react';
import { createPaperFlight } from './paper-flight';

export function CursorBreeze() {
  const layer = useRef<SVGSVGElement>(null);
  const wake = useRef<SVGGElement>(null);
  useEffect(() => {
    const page = layer.current!.closest<HTMLElement>('.journey-page')!;
    const flight = createPaperFlight(layer.current!, wake.current!);
    const media = matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
    const events = new AbortController();
    const { signal } = events;
    let point: { x: number; y: number } | null = null;
    let frame = 0;

    const hide = (clearWake = !media.matches || document.hidden) => {
      cancelAnimationFrame(frame);
      frame = 0;
      page.removeAttribute('data-cursor-breeze');
      page.removeAttribute('data-paper-flight');
      flight.reset(clearWake);
    };
    const render = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!point || !media.matches || document.hidden) { hide(); return; }
      const target = document.elementFromPoint(point.x, point.y);
      // Keep wind out of top-layer dialogs and native form controls.
      if (!target || !page.contains(target) || page.querySelector('dialog[open]') ||
          target.closest('[popover], input, textarea, select, [contenteditable="true"]')) { hide(); return; }
      const control = target.closest('button:not(:disabled), a[href], summary, [role="button"]');
      const hovering = control && control.getAttribute('aria-disabled') !== 'true';
      const skimming = page.querySelector<HTMLCanvasElement>('.scene canvas')?.dataset.paperSkimming === 'true';
      flight.move(point.x, point.y, performance.now());
      page.toggleAttribute('data-cursor-breeze', !!(skimming || hovering));
      page.setAttribute('data-paper-flight', '');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') { reset(); return; }
      point = { x: event.clientX, y: event.clientY };
      render();
    };
    const reset = () => { point = null; hide(true); };
    const visibility = () => { if (document.hidden) reset(); };
    const preference = () => { hide(); if (media.matches) schedule(); };
    const observer = new MutationObserver(render);
    observer.observe(page, { subtree: true, attributes: true, attributeFilter: ['data-paper-skimming', 'open'] });

    const pointer = { passive: true, signal };
    page.addEventListener('pointermove', move, pointer);
    page.addEventListener('pointerover', move, pointer);
    page.addEventListener('pointerdown', move, pointer);
    page.addEventListener('pointerup', move, pointer);
    page.addEventListener('pointerleave', reset, { signal });
    page.addEventListener('pointercancel', reset, { signal });
    page.addEventListener('click', schedule, { signal });
    page.addEventListener('toggle', schedule, { capture: true, signal });
    document.addEventListener('keydown', reset, { signal });
    document.addEventListener('visibilitychange', visibility, { signal });
    window.addEventListener('blur', reset, { signal });
    window.addEventListener('pagehide', reset, { signal });
    window.addEventListener('scroll', schedule, { capture: true, signal });
    media.addEventListener('change', preference, { signal });
    return () => {
      events.abort();
      observer.disconnect();
      reset(); flight.dispose();
    };
  }, []);

  return <><svg className="paper-wake-field" aria-hidden="true" focusable="false">
    <defs><radialGradient id="paper-air-wash">
      <stop stopColor="var(--air-light)" stopOpacity=".42" />
      <stop offset=".48" stopColor="var(--air-mist)" stopOpacity=".28" />
      <stop offset="1" stopColor="var(--air-ink)" stopOpacity="0" />
    </radialGradient></defs>
    <g ref={wake} className="flight-wake" fill="url(#paper-air-wash)" />
  </svg><svg ref={layer} className="paper-flight" viewBox="-48 -48 96 96" width="96" height="96" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="paper-bow-light" gradientUnits="userSpaceOnUse" x1="9" y1="0" x2="-40" y2="0">
        <stop offset="0" stopColor="var(--air-light)" stopOpacity="0" />
        <stop offset=".20" stopColor="var(--air-light)" stopOpacity=".92" />
        <stop offset=".58" stopColor="var(--air-light)" stopOpacity=".68" />
        <stop offset="1" stopColor="var(--air-ink)" stopOpacity="0" />
      </linearGradient>
    </defs>
    <g className="flight-bow" transform="rotate(-137.73)">
      <g className="flight-air" fill="url(#paper-bow-light)">
        <path d="M9 0C3 -1 -2 -5 -9 -10C-18 -16 -29 -18 -40 -14C-28 -16 -18 -12 -10 -7C-3 -3 3 0 9 0Z" />
        <path d="M9 0C2 1 -4 5 -11 9C-21 15 -31 17 -40 14C-30 15 -21 11 -12 7C-4 3 2 0 9 0Z" />
      </g>
    </g>
  </svg></>;
}
