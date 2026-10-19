import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

/**
 * A small model of what the app does: five browser tabs hang off one broadcast channel (the
 * dashed bus). Every few seconds one tab changes a setting, the change travels down to the bus
 * and up into every other tab, and each tab applies it only if its stamp is newer than what it
 * already has, which is the same last-writer-wins rule the app uses. Now and then two tabs write
 * at once, and you can watch both changes race and every tab settle on the same winner.
 */

type Field = 'dark' | 'size' | 'lang';

interface Stamp {
  t: number;
  id: number;
}

interface FieldState<V> {
  value: V;
  stamp: Stamp;
}

interface PanelState {
  dark: FieldState<boolean>;
  size: FieldState<number>;
  lang: FieldState<number>;
}

interface Change {
  field: Field;
  value: boolean | number;
  stamp: Stamp;
}

interface Pulse {
  path: Vector3[];
  lengths: number[];
  total: number;
  travelled: number;
  target: number;
  change: Change;
  dots: Mesh[];
}

interface Palette {
  ink: string;
  rule: string;
  signal: string;
}

const PANEL_COUNT = 5;
const PANEL_W = 2.05;
const PANEL_H = 1.28;
const BUS_Y = -1.55;
const PULSE_SPEED = 5.2; // scene units per second
const EVENT_EVERY = 2.8; // seconds
const LANG_NAMES = ['English', 'हिन्दी', 'Español', 'Français', 'Deutsch', '日本語'];
const LANG_THEME = ['Theme', 'थीम', 'Tema', 'Thème', 'Design', 'テーマ'];
const LANG_SIZE = ['Text size', 'आकार', 'Tamaño', 'Taille', 'Größe', '文字サイズ'];

const newer = (a: Stamp, b: Stamp) => a.t > b.t || (a.t === b.t && a.id > b.id);

export interface SceneHandle {
  setPalette(palette: Palette, pageDark: boolean): void;
  dispose(): void;
}

export function createScene(
  canvas: HTMLCanvasElement,
  palette: Palette,
  pageDark: boolean,
  onCaption: (text: string) => void,
): SceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  const lookAt = new Vector3(0, -0.28, 0);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Panels -------------------------------------------------------------------------------

  const initial = (): PanelState => ({
    dark: { value: pageDark, stamp: { t: 0, id: 0 } },
    size: { value: 1, stamp: { t: 0, id: 0 } },
    lang: { value: 0, stamp: { t: 0, id: 0 } },
  });

  const panels = Array.from({ length: PANEL_COUNT }, (_, i) => {
    const spread = i - (PANEL_COUNT - 1) / 2; // -2 .. 2
    const position = new Vector3(spread * 2.3, (i % 2 === 0 ? 0.22 : -0.04) + Math.abs(spread) * 0.05, -Math.abs(spread) * 0.45);
    const canvas2d = document.createElement('canvas');
    canvas2d.width = 640;
    canvas2d.height = 400;
    const texture = new CanvasTexture(canvas2d);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = new Mesh(
      new PlaneGeometry(PANEL_W, PANEL_H),
      new MeshBasicMaterial({ map: texture, transparent: true }),
    );
    const group = new Group();
    group.add(mesh);
    group.position.copy(position);
    group.rotation.y = -spread * 0.1;
    scene.add(group);
    return { group, canvas2d, texture, home: position.clone(), state: initial(), bump: 0, id: i + 1 };
  });

  // ---- Bus and drops ------------------------------------------------------------------------

  const busPoint = (i: number) => {
    const home = panels[i]!.home;
    return new Vector3(home.x, BUS_Y, home.z);
  };
  const dropTop = (i: number) => {
    const home = panels[i]!.home;
    return new Vector3(home.x, home.y - PANEL_H / 2, home.z);
  };

  const lineMaterial = new LineBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.32 });
  const busMaterial = new LineDashedMaterial({
    color: palette.ink,
    transparent: true,
    opacity: 0.55,
    dashSize: 0.09,
    gapSize: 0.07,
  });

  const busPoints = [
    busPoint(0).add(new Vector3(-0.9, 0, 0)),
    ...panels.map((_, i) => busPoint(i)),
    busPoint(PANEL_COUNT - 1).add(new Vector3(0.9, 0, 0)),
  ];
  const bus = new Line(new BufferGeometry().setFromPoints(busPoints), busMaterial);
  bus.computeLineDistances();
  scene.add(bus);

  for (let i = 0; i < PANEL_COUNT; i++) {
    scene.add(new Line(new BufferGeometry().setFromPoints([dropTop(i), busPoint(i)]), lineMaterial));
  }

  // ---- Pulses -------------------------------------------------------------------------------

  const dotGeometry = new CircleGeometry(0.045, 20);
  const pulses: Pulse[] = [];

  const makePath = (from: number, to: number): Vector3[] => {
    const path = [dropTop(from), busPoint(from)];
    const step = from < to ? 1 : -1;
    for (let i = from + step; i !== to + step; i += step) path.push(busPoint(i));
    path.push(dropTop(to));
    return path;
  };

  const launch = (from: number, change: Change) => {
    for (let to = 0; to < PANEL_COUNT; to++) {
      if (to === from) continue;
      const path = makePath(from, to);
      const lengths = path.slice(1).map((p, k) => p.distanceTo(path[k]!));
      const dots = [1, 0.55, 0.3].map((opacity, k) => {
        const dot = new Mesh(
          dotGeometry,
          new MeshBasicMaterial({ color: palette.signal, transparent: true, opacity }),
        );
        dot.scale.setScalar(1 - k * 0.22);
        scene.add(dot);
        return dot;
      });
      pulses.push({ path, lengths, total: lengths.reduce((a, b) => a + b, 0), travelled: 0, target: to, change, dots });
    }
  };

  const pointAt = (pulse: Pulse, distance: number, out: Vector3) => {
    let remaining = Math.max(0, Math.min(distance, pulse.total));
    for (let k = 0; k < pulse.lengths.length; k++) {
      const length = pulse.lengths[k]!;
      if (remaining <= length || k === pulse.lengths.length - 1) {
        return out.lerpVectors(pulse.path[k]!, pulse.path[k + 1]!, length === 0 ? 0 : remaining / length);
      }
      remaining -= length;
    }
    return out;
  };

  // ---- State changes ------------------------------------------------------------------------

  const apply = (index: number, change: Change): boolean => {
    const panel = panels[index]!;
    const current = panel.state[change.field];
    if (!newer(change.stamp, current.stamp)) return false;
    (panel.state[change.field] as FieldState<boolean | number>) = { value: change.value, stamp: change.stamp };
    panel.bump = 1;
    draw(index);
    return true;
  };

  let clock = 0;
  let eventIndex = 0;

  const nextValue = (field: Field, from: PanelState): boolean | number => {
    if (field === 'dark') return !from.dark.value;
    if (field === 'size') return (from.size.value + 1 + Math.floor(Math.random() * 2)) % 3;
    return (from.lang.value + 1 + Math.floor(Math.random() * (LANG_NAMES.length - 1))) % LANG_NAMES.length;
  };

  const describe = (field: Field, value: boolean | number) =>
    field === 'dark' ? (value ? 'dark theme' : 'light theme') : field === 'size' ? `text size ${['S', 'M', 'L'][value as number]}` : (LANG_NAMES[value as number] ?? '');

  const fireEvent = () => {
    clock += 1;
    eventIndex += 1;
    const fields: Field[] = ['dark', 'lang', 'size'];
    const field = fields[eventIndex % fields.length]!;

    if (eventIndex % 4 === 0) {
      // Two tabs write the same field in the same tick: the higher tab id must win everywhere.
      const a = Math.floor(Math.random() * PANEL_COUNT);
      let b = Math.floor(Math.random() * (PANEL_COUNT - 1));
      if (b >= a) b += 1;
      const base = panels[a]!.state;
      const valueA = nextValue('size', base);
      let valueB = nextValue('size', base);
      if (valueB === valueA) valueB = (valueA as number + 1) % 3;
      const changeA: Change = { field: 'size', value: valueA, stamp: { t: clock, id: panels[a]!.id } };
      const changeB: Change = { field: 'size', value: valueB, stamp: { t: clock, id: panels[b]!.id } };
      apply(a, changeA);
      apply(b, changeB);
      launch(a, changeA);
      launch(b, changeB);
      const winner = Math.max(panels[a]!.id, panels[b]!.id);
      onCaption(`Tabs ${panels[a]!.id} and ${panels[b]!.id} write at once. Same timestamp, so tab ${winner} wins everywhere.`);
      return;
    }

    const source = Math.floor(Math.random() * PANEL_COUNT);
    const value = nextValue(field, panels[source]!.state);
    const change: Change = { field, value, stamp: { t: clock, id: panels[source]!.id } };
    apply(source, change);
    launch(source, change);
    onCaption(`Tab ${panels[source]!.id} switches to ${describe(field, value)}. The other four follow.`);
  };

  // ---- Drawing a panel ----------------------------------------------------------------------

  let colors = palette;

  function draw(index: number): void {
    const panel = panels[index]!;
    const ctx = panel.canvas2d.getContext('2d');
    if (!ctx) return;
    const { dark, size, lang } = panel.state;
    const W = panel.canvas2d.width;
    const H = panel.canvas2d.height;
    const bg = dark.value ? '#1a1917' : '#f8f5ee';
    const bar = dark.value ? '#24221f' : '#ebe6da';
    const ink = dark.value ? '#ece8dd' : '#171614';
    const muted = dark.value ? '#8f8a7e' : '#7d786c';
    const rule = dark.value ? '#3a3732' : '#d6d0c1';
    const signal = colors.signal;
    const mono = '"IBM Plex Mono", ui-monospace, monospace';
    const sans = '"IBM Plex Sans", system-ui, sans-serif';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Tab strip with the tab's own label.
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, W, 64);
    ctx.fillStyle = bg;
    ctx.fillRect(22, 16, 230, 48);
    ctx.fillStyle = ink;
    ctx.font = `500 22px ${mono}`;
    ctx.fillText(`tandem · tab ${panel.id}`, 40, 48);
    ctx.fillStyle = muted;
    ctx.fillRect(W - 120, 30, 80, 6);

    // Theme row: a two-part switch with the active half filled.
    ctx.font = `500 26px ${sans}`;
    ctx.fillStyle = ink;
    ctx.fillText(LANG_THEME[lang.value] ?? 'Theme', 40, 122);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(W - 240, 92, 200, 44);
    ctx.fillStyle = signal;
    ctx.fillRect(dark.value ? W - 140 : W - 240, 92, 100, 44);
    ctx.font = `500 20px ${mono}`;
    ctx.fillStyle = dark.value ? muted : '#fff8f0';
    ctx.fillText('light', W - 222, 121);
    ctx.fillStyle = dark.value ? '#160c08' : muted;
    ctx.fillText('dark', W - 116, 121);

    // Language row.
    ctx.fillStyle = rule;
    ctx.fillRect(40, 160, W - 80, 2);
    ctx.font = `500 26px ${sans}`;
    ctx.fillStyle = ink;
    ctx.fillText(LANG_NAMES[lang.value] ?? '', 40, 210);
    ctx.font = `400 20px ${mono}`;
    ctx.fillStyle = muted;
    ctx.fillText('lang', W - 96, 208);

    // Size row: slider with ticks, then sample lines scaled by the size.
    ctx.fillStyle = rule;
    ctx.fillRect(40, 238, W - 80, 2);
    ctx.font = `500 22px ${sans}`;
    ctx.fillStyle = ink;
    ctx.fillText(LANG_SIZE[lang.value] ?? 'Text size', 40, 280);
    const trackX = 250;
    const trackW = W - 290;
    ctx.fillStyle = rule;
    ctx.fillRect(trackX, 270, trackW, 4);
    for (let k = 0; k <= 6; k++) ctx.fillRect(trackX + (trackW * k) / 6 - 1, 280, 2, 8);
    const thumbX = trackX + (trackW * size.value) / 2;
    ctx.fillStyle = signal;
    ctx.fillRect(trackX, 270, thumbX - trackX, 4);
    ctx.fillRect(thumbX - 7, 258, 14, 28);

    const lineHeight = [10, 14, 19][size.value] ?? 14;
    ctx.fillStyle = muted;
    let y = 316;
    for (const width of [0.82, 0.64, 0.74]) {
      if (y + lineHeight > H - 18) break;
      ctx.fillRect(40, y, (W - 80) * width, lineHeight);
      y += lineHeight + 12;
    }

    // Edge.
    ctx.strokeStyle = dark.value ? '#4a463f' : '#b6af9e';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

    panel.texture.needsUpdate = true;
  }

  panels.forEach((_, i) => draw(i));
  // Redraw once the web fonts are in, so the panels don't keep the fallback font.
  void document.fonts?.ready.then(() => panels.forEach((_, i) => draw(i)));

  // ---- Layout, input, loop ------------------------------------------------------------------

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the whole row of panels in view on narrow screens.
    const neededWidth = 11.6;
    const distance = neededWidth / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    camera.position.set(0, 0.25, Math.max(6.4, distance));
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const pointer = { x: 0, y: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let visible = true;
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  visibility.observe(canvas);

  const scratch = new Vector3();
  let last = performance.now();
  let sinceEvent = EVENT_EVERY - 1.2;
  let frame = 0;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;

    sinceEvent += dt;
    if (sinceEvent >= EVENT_EVERY) {
      sinceEvent = 0;
      fireEvent();
    }

    for (let p = pulses.length - 1; p >= 0; p--) {
      const pulse = pulses[p]!;
      pulse.travelled += PULSE_SPEED * dt;
      pulse.dots.forEach((dot, k) => {
        pointAt(pulse, pulse.travelled - k * 0.12, scratch);
        dot.position.copy(scratch);
        dot.lookAt(camera.position);
      });
      if (pulse.travelled >= pulse.total + 0.24) {
        apply(pulse.target, pulse.change);
        for (const dot of pulse.dots) {
          scene.remove(dot);
          (dot.material as MeshBasicMaterial).dispose();
        }
        pulses.splice(p, 1);
      }
    }

    const t = now / 1000;
    panels.forEach((panel, i) => {
      panel.bump = Math.max(0, panel.bump - dt * 3.2);
      panel.group.position.y = panel.home.y + Math.sin(t * 0.7 + i * 1.3) * 0.035;
      panel.group.scale.setScalar(1 + panel.bump * 0.035);
    });

    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (0.25 - pointer.y * 0.3 - camera.position.y) * 0.04;
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
  };

  if (reducedMotion) {
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
    void document.fonts?.ready.then(() => renderer.render(scene, camera));
  } else {
    frame = requestAnimationFrame(tick);
  }

  return {
    setPalette(next, dark) {
      colors = next;
      lineMaterial.color = new Color(next.ink);
      busMaterial.color = new Color(next.ink);
      // Follow the page: a theme change from the app arrives here like any other tab.
      clock += 1;
      panels.forEach((_, i) => {
        apply(i, { field: 'dark', value: dark, stamp: { t: clock, id: 0 } });
        draw(i);
      });
      if (reducedMotion) renderer.render(scene, camera);
    },
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      window.removeEventListener('pointermove', onPointer);
      renderer.dispose();
    },
  };
}
