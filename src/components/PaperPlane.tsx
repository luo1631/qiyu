import planeUrl from '../../public/art/paper-plane-cursor.svg?url';
import activePlaneUrl from '../../public/art/paper-plane-active.svg?url';

/** Shared artwork and wind strokes for the cursor and the loading scene. */
export function PaperPlane({ active = false }: { active?: boolean }) {
  return <span className="paper-plane" aria-hidden="true">
    <svg className="paper-plane__wind" viewBox="-14 -14 68 64" width="68" height="64" fill="none">
      <path d="M-6 4C1 0 8 8 15 14S29 24 40 26" />
      <path d="M-9 14C0 10 6 19 13 24S27 32 34 32" />
      <path d="M8-7C18-1 17 8 26 13S39 18 43 22" />
    </svg>
    <img className="paper-plane__body" src={active ? activePlaneUrl : planeUrl} width="32" height="28" alt="" draggable="false" />
  </span>;
}
