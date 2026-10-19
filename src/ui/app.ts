import { drillWinner, type SyncEvent, type TabSync } from '../sync';
import { FONT_SIZE } from '../sync/schema';
import { LANGUAGES, type Language, type SettingKey, type Settings } from '../sync/types';
import { LANGUAGE_NAMES, MESSAGES, type Messages, type StaticKey } from './i18n';

const TEMPLATE = /* html */ `
<div class="frame">
  <header class="bar">
    <h1 class="wordmark"><a href="../" title="Tandem">Tandem</a></h1>
    <p class="bar-note" data-i18n="subtitle"></p>
    <div class="bar-right">
      <span class="this-tab"><span class="swatch" id="self-dot"></span><span id="self-label"></span></span>
      <button type="button" class="btn" id="open-tab"><span data-i18n="openTab"></span><span aria-hidden="true">↗</span></button>
    </div>
  </header>

  <main class="columns">
    <section class="col prefs" aria-labelledby="prefs-title">
      <h2 id="prefs-title" data-i18n="preferences"></h2>

      <div class="row">
        <div class="row-text">
          <label class="row-title" for="dark-mode" data-i18n="darkMode"></label>
          <p class="hint" data-i18n="darkModeHint"></p>
        </div>
        <span class="seg">
          <input type="checkbox" role="switch" id="dark-mode" />
          <span class="seg-opt seg-light" aria-hidden="true" data-i18n="light"></span>
          <span class="seg-opt seg-dark" aria-hidden="true" data-i18n="dark"></span>
        </span>
      </div>

      <div class="row">
        <div class="row-text">
          <label class="row-title" for="language" data-i18n="language"></label>
          <p class="hint" data-i18n="languageHint"></p>
        </div>
        <span class="select"><select id="language"></select></span>
      </div>

      <div class="row row-size">
        <div class="row-text">
          <label class="row-title" for="font-size" data-i18n="textSize"></label>
          <p class="hint" data-i18n="textSizeHint"></p>
        </div>
        <output class="size-figure" id="font-size-value" for="font-size"></output>
        <div class="slider">
          <input type="range" id="font-size" step="1" />
          <div class="ticks" aria-hidden="true"></div>
          <div class="range-scale" aria-hidden="true"><span id="size-min"></span><span id="size-max"></span></div>
        </div>
        <p class="preview" data-i18n="preview"></p>
      </div>

      <p class="saved-note" data-i18n="savedNote"></p>
    </section>

    <section class="col monitor" aria-labelledby="monitor-title">
      <h2 id="monitor-title" data-i18n="monitor"></h2>

      <div class="block">
        <h3 data-i18n="latency"></h3>
        <dl class="readouts">
          <div><dt data-i18n="last"></dt><dd id="lat-last">–</dd></div>
          <div><dt data-i18n="average"></dt><dd id="lat-mean">–</dd></div>
          <div><dt data-i18n="p95"></dt><dd id="lat-p95">–</dd></div>
          <div><dt data-i18n="max"></dt><dd id="lat-max">–</dd></div>
        </dl>
        <div class="trace">
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
            <polyline id="spark-line" points="" />
          </svg>
        </div>
        <p class="note" id="lat-note"></p>
      </div>

      <div class="block">
        <div class="block-head">
          <h3 data-i18n="tabs"></h3>
          <span class="count" id="tab-count"></span>
        </div>
        <ul class="tab-list" id="tab-list"></ul>
        <p class="status" id="sync-status" role="status"></p>
      </div>

      <div class="block">
        <h3 data-i18n="drill"></h3>
        <p class="hint" data-i18n="drillHint"></p>
        <div class="drill-actions">
          <button type="button" class="btn btn-solid" id="run-drill" data-i18n="runDrill"></button>
          <span class="note" id="drill-need"></span>
        </div>
        <div class="drill-result" id="drill-result" aria-live="polite"></div>
      </div>

      <div class="block">
        <h3 data-i18n="activity"></h3>
        <ol class="activity" id="activity"></ol>
      </div>
    </section>
  </main>
</div>
`;

interface ActivityEntry {
  at: number;
  key: SettingKey;
  value: Settings[SettingKey];
  source: 'local' | 'remote' | 'storage';
  from?: string;
  ms?: number;
}

const MAX_ACTIVITY = 8;
const SPARK_POINTS = 40;
/** Consecutive changes to one setting from one source (e.g. dragging the slider) share a row. */
const COALESCE_MS = 1_500;

export function shortCode(tabId: string): string {
  return tabId.replace(/-/g, '').slice(0, 4).toUpperCase();
}

/** A stable colour per tab, so the same tab has the same dot in every list and every tab. */
export function tabHue(tabId: string): number {
  let hash = 0;
  for (let i = 0; i < tabId.length; i++) hash = (Math.imul(hash, 31) + tabId.charCodeAt(i)) >>> 0;
  // Golden-angle steps spread consecutive hashes around the colour wheel.
  return Math.round((hash % 1000) * 137.508) % 360;
}

export function mountApp(root: HTMLElement, sync: TabSync): void {
  root.innerHTML = TEMPLATE;

  const find = <T extends Element = HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing element ${selector}`);
    return element;
  };

  const ui = {
    selfDot: find('#self-dot'),
    selfLabel: find('#self-label'),
    openTab: find<HTMLButtonElement>('#open-tab'),
    darkMode: find<HTMLInputElement>('#dark-mode'),
    language: find<HTMLSelectElement>('#language'),
    fontSize: find<HTMLInputElement>('#font-size'),
    fontSizeValue: find<HTMLOutputElement>('#font-size-value'),
    sizeMin: find('#size-min'),
    sizeMax: find('#size-max'),
    latLast: find('#lat-last'),
    latMean: find('#lat-mean'),
    latP95: find('#lat-p95'),
    latMax: find('#lat-max'),
    latNote: find('#lat-note'),
    spark: find<SVGPolylineElement>('#spark-line'),
    tabCount: find('#tab-count'),
    tabList: find('#tab-list'),
    syncStatus: find('#sync-status'),
    runDrill: find<HTMLButtonElement>('#run-drill'),
    drillNeed: find('#drill-need'),
    drillResult: find('#drill-result'),
    activity: find('#activity'),
  };

  const activity: ActivityEntry[] = [];
  let lang: Language = sync.settings.language;
  let t: Messages = MESSAGES[lang];

  for (const code of LANGUAGES) {
    const option = document.createElement('option');
    option.value = code;
    option.lang = code;
    option.textContent = LANGUAGE_NAMES[code];
    ui.language.append(option);
  }
  ui.fontSize.min = String(FONT_SIZE.min);
  ui.fontSize.max = String(FONT_SIZE.max);
  ui.sizeMin.textContent = `${FONT_SIZE.min}px`;
  ui.sizeMax.textContent = `${FONT_SIZE.max}px`;
  ui.selfDot.style.setProperty('--tab-hue', String(tabHue(sync.tabId)));

  // Controls write straight to the sync layer; the page re-renders from the resulting events.
  ui.darkMode.addEventListener('change', () => sync.set('darkMode', ui.darkMode.checked));
  ui.language.addEventListener('change', () => sync.set('language', ui.language.value as Language));
  ui.fontSize.addEventListener('input', () => sync.set('fontSize', Number(ui.fontSize.value)));
  ui.openTab.addEventListener('click', () => window.open(window.location.href, '_blank'));
  ui.runDrill.addEventListener('click', () => sync.runDrill());

  sync.subscribe(onEvent);
  applySettings();
  renderAll();

  function onEvent(event: SyncEvent): void {
    switch (event.type) {
      case 'settings':
        applySettings();
        if (event.source !== 'remote') {
          for (const key of event.keys) addActivity({ key, source: event.source });
        }
        if (event.keys.includes('language')) renderAll();
        else renderPeers();
        break;
      case 'latency':
        addActivity({ key: event.key, source: 'remote', from: event.from, ms: event.ms });
        renderLatency();
        break;
      case 'peers':
        renderPeers();
        renderDrill();
        break;
      case 'drill':
        renderDrill();
        break;
    }
  }

  /** Mirrors the current settings onto the page and the controls. */
  function applySettings(): void {
    const settings = sync.settings;
    const html = document.documentElement;
    html.dataset.theme = settings.darkMode ? 'dark' : 'light';
    html.style.fontSize = `${settings.fontSize}px`;
    html.lang = settings.language;

    ui.darkMode.checked = settings.darkMode;
    ui.language.value = settings.language;
    ui.fontSize.value = String(settings.fontSize);
    ui.fontSizeValue.textContent = String(settings.fontSize);

    if (settings.language !== lang) {
      lang = settings.language;
      t = MESSAGES[lang];
    }
  }

  function renderAll(): void {
    document.title = t.title;
    for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      element.textContent = t[element.dataset.i18n as StaticKey];
    }
    ui.selfLabel.textContent = t.tabLabel(shortCode(sync.tabId));
    renderLatency();
    renderPeers();
    renderDrill();
    renderActivity();
  }

  function formatMs(ms: number): string {
    const digits = ms < 10 ? 2 : 1;
    return `${new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ms)} ms`;
  }

  function renderLatency(): void {
    const summary = sync.latency.summary();
    if (!summary) {
      for (const cell of [ui.latLast, ui.latMean, ui.latP95, ui.latMax]) cell.textContent = '–';
      ui.latNote.textContent = t.noSamples;
      ui.spark.setAttribute('points', '');
      return;
    }
    ui.latLast.textContent = formatMs(summary.last);
    ui.latMean.textContent = formatMs(summary.mean);
    ui.latP95.textContent = formatMs(summary.p95);
    ui.latMax.textContent = formatMs(summary.max);
    const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }).format(
      summary.withinTarget,
    );
    ui.latNote.textContent = `${t.samples(summary.count)} · ${t.withinTarget(percent)}`;

    const points = sync.latency.recent(SPARK_POINTS);
    const top = Math.max(1, ...points) * 1.15;
    const step = points.length > 1 ? 100 / (points.length - 1) : 0;
    ui.spark.setAttribute(
      'points',
      points.map((ms, i) => `${(i * step).toFixed(2)},${(24 - (ms / top) * 22).toFixed(2)}`).join(' '),
    );
  }

  function renderPeers(): void {
    const peers = sync.peerList;
    const ownDigest = sync.digest;
    ui.tabCount.textContent = String(peers.length + 1);

    const rows = [tabRow(sync.tabId, ownDigest, 'self')];
    for (const peer of peers) {
      rows.push(tabRow(peer.id, peer.digest, peer.digest === ownDigest ? 'ok' : 'wait'));
    }
    ui.tabList.replaceChildren(...rows);

    const status = peers.length === 0 ? 'alone' : sync.inSyncWithPeers ? 'ok' : 'wait';
    ui.syncStatus.className = `status ${status}`;
    ui.syncStatus.textContent =
      status === 'alone' ? t.aloneHint : status === 'ok' ? t.allAgree : t.someBehind;

    ui.runDrill.disabled = peers.length === 0;
    ui.drillNeed.textContent = peers.length === 0 ? t.needTwoTabs : '';
  }

  function tabRow(id: string, digest: string | null, state: 'self' | 'ok' | 'wait'): HTMLLIElement {
    const row = el('li', `tab-row${state === 'self' ? ' is-self' : ''}`);
    const dot = el('span', 'swatch');
    dot.style.setProperty('--tab-hue', String(tabHue(id)));
    const badgeText = state === 'self' ? t.you : state === 'ok' ? t.inSync : t.catchingUp;
    row.append(
      dot,
      el('span', 'tab-name', t.tabLabel(shortCode(id))),
      el('code', 'digest', digest ? `#${digest}` : '…'),
      el('span', `badge ${state}`, badgeText),
    );
    return row;
  }

  function renderDrill(): void {
    const drill = sync.drill;
    if (!drill || drill.proposals.length === 0) {
      ui.drillResult.replaceChildren();
      return;
    }
    const winner = drillWinner(drill);
    const earliest = Math.min(...drill.proposals.map((p) => p.stamp.t));
    const sorted = [...drill.proposals].sort((a, b) => b.stamp.t - a.stamp.t || (a.tab < b.tab ? 1 : -1));

    const rows = sorted.map((proposal) => {
      const isWinner = proposal === winner;
      const row = el('div', `proposal${isWinner ? ' winner' : ''}`);
      const dot = el('span', 'swatch');
      dot.style.setProperty('--tab-hue', String(tabHue(proposal.tab)));
      const name = proposal.tab === sync.tabId ? `${t.tabLabel(shortCode(proposal.tab))} (${t.you})` : t.tabLabel(shortCode(proposal.tab));
      row.append(
        dot,
        el('span', 'tab-name', name),
        el('span', 'size', `${proposal.value}px`),
        el('span', 'when', `t+${proposal.stamp.t - earliest} ms`),
      );
      return row;
    });

    const summary = el('p', 'drill-summary', t.drillWrites(drill.proposals.length));
    if (winner) {
      summary.textContent += ` · ${t.drillResult(`${winner.value}px`, t.tabLabel(shortCode(winner.tab)))}`;
    }
    ui.drillResult.replaceChildren(...rows, summary);
  }

  function addActivity(entry: Omit<ActivityEntry, 'at' | 'value'>): void {
    const now = Date.now();
    const value = sync.settings[entry.key];
    const top = activity[0];
    if (top && top.key === entry.key && top.source === entry.source && top.from === entry.from && now - top.at < COALESCE_MS) {
      activity[0] = { ...top, ...entry, value, at: now };
    } else {
      activity.unshift({ ...entry, value, at: now });
      activity.length = Math.min(activity.length, MAX_ACTIVITY);
    }
    renderActivity(true);
  }

  function renderActivity(highlightNewest = false): void {
    if (activity.length === 0) {
      ui.activity.replaceChildren(el('li', 'empty', t.noActivity));
      return;
    }
    const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const items = activity.map((entry, index) => {
      const item = el('li', highlightNewest && index === 0 ? 'fresh' : '');
      const what = el('span', 'what');
      what.append(el('strong', '', settingLabel(entry.key)), ` → ${formatValue(entry.key, entry.value)}`);

      const meta = el('span', 'meta');
      if (entry.source === 'remote' && entry.from) {
        const dot = el('span', 'swatch');
        dot.style.setProperty('--tab-hue', String(tabHue(entry.from)));
        meta.append(dot, t.fromTab(t.tabLabel(shortCode(entry.from))));
        if (entry.ms !== undefined) meta.append(` · ${formatMs(entry.ms)}`);
      } else {
        meta.append(entry.source === 'storage' ? t.fromStorage : t.here);
      }

      item.append(el('time', '', time.format(entry.at)), what, meta);
      return item;
    });
    ui.activity.replaceChildren(...items);
  }

  function settingLabel(key: SettingKey): string {
    return key === 'darkMode' ? t.darkMode : key === 'language' ? t.language : t.textSize;
  }

  function formatValue(key: SettingKey, value: Settings[SettingKey]): string {
    if (key === 'darkMode') return value ? t.on : t.off;
    if (key === 'language') return LANGUAGE_NAMES[value as Language];
    return `${value}px`;
  }
}

/** Creates an element; text always goes in through textContent, never as HTML. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
