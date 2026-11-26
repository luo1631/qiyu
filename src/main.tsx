import { createRoot } from 'react-dom/client';
import FloatingIsland from './floating-island/FloatingIsland';

function mountScene() {
  const root = createRoot(document.getElementById('qiyu-root')!);
  root.render(<FloatingIsland />);
  window.addEventListener('pagehide', () => root.unmount(), { once: true });
}

mountScene();
window.addEventListener('pageshow', event => {
  if (event.persisted) mountScene();
});
