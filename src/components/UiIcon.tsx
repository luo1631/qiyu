import type { PointerEvent } from 'react';

const paths = {
  moon: 'M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  window: 'M8 4h10a2 2 0 0 1 2 2v10M6 8h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM4 12h13',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  close: 'm6 6 12 12M18 6 6 18',
  water: 'M3 8c3-4 6 4 9 0s6 4 9 0M3 15c3-4 6 4 9 0s6 4 9 0',
  boat: 'M3 10h18l-3.5 7h-11zM8 10V7m8 3V7M3 21c3-3 6 3 9 0s6 3 9 0',
};

export function UiIcon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return <svg className={'ui-icon ' + className} data-icon={name} viewBox="0 0 24 24" width="18" height="18"
    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={paths[name]} />
  </svg>;
}

export function animatePhaseIcon(event: PointerEvent<HTMLButtonElement>) {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const icon = event.currentTarget.querySelector<SVGSVGElement>('.ui-icon');
  if (preference.matches || !icon || typeof icon.animate !== 'function') return;
  if (icon.getAnimations().some(animation => animation.id === 'phase-hover')) return;

  const moon = icon.dataset.icon === 'moon';
  const animation = icon.animate(moon ? [
    { rotate: '0deg', easing: 'ease-out' },
    { rotate: '-12deg', offset: .27, easing: 'ease-in-out' },
    { rotate: '7deg', offset: .54, easing: 'ease-in-out' },
    { rotate: '-3deg', offset: .76, easing: 'ease-out' },
    { rotate: '0deg' },
  ] : [{ rotate: '0deg' }, { rotate: '360deg' }], {
    duration: moon ? 720 : 680,
    easing: moon ? 'linear' : 'cubic-bezier(.32,.12,.46,1)',
  });
  animation.id = 'phase-hover';
  const stop = () => { if (preference.matches) animation.cancel(); };
  const cleanup = () => preference.removeEventListener('change', stop);
  preference.addEventListener('change', stop);
  void animation.finished.then(cleanup, cleanup);
}
