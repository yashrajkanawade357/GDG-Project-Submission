import { STORAGE_KEY, parseStored } from '../sync/schema';
import type { SceneHandle } from './scene';

const root = document.documentElement;
const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const caption = document.querySelector<HTMLElement>('#scene-caption');

function palette() {
  const styles = getComputedStyle(root);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  return { ink: read('--ink'), rule: read('--rule'), signal: read('--signal') };
}

const isDark = () => root.dataset.theme === 'dark';

let scene: SceneHandle | null = null;
if (canvas) {
  // three.js is the bulk of this page's JavaScript, so it loads after the text has rendered.
  import('./scene')
    .then(({ createScene }) => {
      scene = createScene(canvas, palette(), isDark(), (text) => {
        if (caption) caption.textContent = text;
      });
    })
    .catch(() => {
      // No WebGL: the page reads fine without the illustration.
      canvas.closest('.stage')?.classList.add('no-webgl');
    });
}

// This page follows the app's theme too: switch dark mode in an open app tab and watch it change.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  const dark = parseStored(event.newValue).darkMode?.value;
  if (dark === undefined || dark === isDark()) return;
  root.dataset.theme = dark ? 'dark' : 'light';
  scene?.setPalette(palette(), dark);
});
