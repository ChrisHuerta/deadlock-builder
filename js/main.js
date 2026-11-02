// UI wiring. All DOM content is created with createElement/textContent —
// never innerHTML — so data (including saved build names) can't inject markup.

import { CATEGORIES, TIER_COST, ITEM_BY_ID } from './data/items.js';
import { HEROES, HERO_BY_ID } from './data/heroes.js';
import { PRIORITIES, GAME_PLANS } from './data/priorities.js';
import { generateBuild, TOTAL_SLOTS } from './engine.js';
import { defaultState, sanitizeState, encodeState, decodeState } from './state.js';
import { loadSaved, saveBuild, deleteBuild, cleanName } from './storage.js';

const $ = (id) => document.getElementById(id);
const CATS = Object.keys(CATEGORIES);

const PRESETS = {
  weapon: { weapon: 70, spirit: 10, vitality: 20 },
  spirit: { weapon: 10, spirit: 65, vitality: 25 },
  vitality: { weapon: 25, spirit: 15, vitality: 60 },
  balanced: { weapon: 35, spirit: 35, vitality: 30 },
};

/** Tiny element helper: el('div', {class: 'x'}, 'text', childNode) */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const fmt = (n) => n.toLocaleString('en-US');

let state = decodeState(location.hash) || defaultState();

// ───────────────────────── Controls ─────────────────────────

function initControls() {
  const heroSel = $('hero');
  heroSel.append(el('option', { value: '' }, 'Any hero'));
  for (const h of HEROES) heroSel.append(el('option', { value: h.id }, h.name));
  heroSel.addEventListener('change', () => {
    const hero = HERO_BY_ID.get(heroSel.value);
    update({ hero: hero ? hero.id : '', ...(hero ? { focus: { ...hero.lean } } : {}) });
  });

  for (const cat of CATS) {
    $(`focus-${cat}`).addEventListener('input', (e) => {
      update({ focus: { ...state.focus, [cat]: Number(e.target.value) } });
    });
  }

  $('presets').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn) return;
    const preset = PRESETS[btn.dataset.preset];
    if (preset) update({ focus: { ...preset } });
  });

  const prioWrap = $('priorities');
  for (const p of PRIORITIES) {
    const input = el('input', { type: 'checkbox', value: p.id, id: `prio-${p.id}` });
    input.addEventListener('change', () => {
      const set = new Set(state.priorities);
      if (input.checked) set.add(p.id); else set.delete(p.id);
      update({ priorities: PRIORITIES.map((x) => x.id).filter((id) => set.has(id)) });
    });
    prioWrap.append(el('label', { class: 'chip', for: `prio-${p.id}` }, input, el('span', {}, p.label)));
  }

  const planWrap = $('plans');
  for (const g of GAME_PLANS) {
    const input = el('input', { type: 'radio', name: 'plan', value: g.id, id: `plan-${g.id}` });
    input.addEventListener('change', () => { if (input.checked) update({ plan: g.id }); });
    planWrap.append(el('label', { for: `plan-${g.id}` }, input, el('span', {}, g.label)));
  }

  $('reset').addEventListener('click', () => { state = defaultState(); render(); });
  $('clear-banned').addEventListener('click', () => update({ banned: [] }));
  $('copy-link').addEventListener('click', copyLink);
  $('save').addEventListener('click', onSave);
  $('save-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onSave(); } });
  $('controls').addEventListener('submit', (e) => e.preventDefault());

  window.addEventListener('hashchange', () => {
    const next = decodeState(location.hash);
    if (next && encodeState(next) !== encodeState(state)) { state = next; render(); }
  });
}

function syncControls() {
  $('hero').value = state.hero;
  const total = CATS.reduce((s, c) => s + state.focus[c], 0) || 1;
  for (const cat of CATS) {
    $(`focus-${cat}`).value = String(state.focus[cat]);
    $(`out-${cat}`).value = `${Math.round((state.focus[cat] / total) * 100)}%`;
  }
  for (const p of PRIORITIES) $(`prio-${p.id}`).checked = state.priorities.includes(p.id);
  for (const g of GAME_PLANS) $(`plan-${g.id}`).checked = state.plan === g.id;
}

function update(patch) {
  state = sanitizeState({ ...state, ...patch });
  render();
}

// ───────────────────────── Results ─────────────────────────

function renderDistribution(quotas) {
  const wrap = $('distribution');
  wrap.replaceChildren();
  for (const cat of CATS) {
    if (!quotas[cat]) continue;
    const seg = el('div', { class: `seg ${cat}`, title: `${CATEGORIES[cat].label}: ${quotas[cat]} items` },
      `${CATEGORIES[cat].label} ${quotas[cat]}`);
    seg.style.flexGrow = String(quotas[cat]); // CSSOM: allowed under CSP
    wrap.append(seg);
  }
}

function itemCard(pick) {
  const { item, reasons } = pick;
  const swap = el('button', { type: 'button', class: 'swap', title: `Exclude ${item.name} and pick an alternative`, 'aria-label': `Swap out ${item.name}` }, 'Swap');
  swap.addEventListener('click', () => update({ banned: [...state.banned, item.id] }));

  return el('li', { class: `item ${item.cat}` },
    el('div', { class: 'item-top' },
      el('span', { class: 'badge' }, CATEGORIES[item.cat].short),
      el('strong', {}, item.name),
      el('span', { class: 'cost' }, fmt(TIER_COST[item.tier])),
    ),
    el('p', { class: 'desc' }, item.desc),
    el('div', { class: 'item-foot' },
      reasons.length ? el('span', { class: 'why' }, `Fits: ${reasons.join(', ')}`) : el('span', { class: 'why' }, 'Solid general pick'),
      swap,
    ),
  );
}

function renderBuild(build) {
  const hero = HERO_BY_ID.get(state.hero);
  $('build-title').textContent = hero ? `Recommended build: ${hero.name}` : 'Recommended build';
  const count = build.phases.reduce((n, p) => n + p.items.length, 0);
  $('build-summary').textContent = `${count}/${TOTAL_SLOTS} slots · ${fmt(build.totalCost)} souls total`;

  renderDistribution(build.quotas);

  let running = 0;
  const phases = build.phases.map((phase) => {
    const cost = phase.items.reduce((s, p) => s + TIER_COST[p.item.tier], 0);
    running += cost;
    return el('section', { class: 'phase' },
      el('header', {},
        el('h3', {}, phase.label, el('span', { class: 'tier' }, ` Tier ${phase.tier}`)),
        el('span', { class: 'phase-cost' }, `${fmt(cost)} souls · ${fmt(running)} cumulative`),
      ),
      el('p', { class: 'help' }, phase.hint),
      el('ol', { class: 'items' }, ...phase.items.map(itemCard)),
    );
  });
  $('phases').replaceChildren(...phases);

  const bannedWrap = $('banned-wrap');
  bannedWrap.hidden = state.banned.length === 0;
  $('banned').replaceChildren(...state.banned.map((id) => {
    const item = ITEM_BY_ID.get(id);
    const b = el('button', { type: 'button', class: 'chip-btn', 'aria-label': `Allow ${item.name} again` }, `${item.name} ✕`);
    b.addEventListener('click', () => update({ banned: state.banned.filter((x) => x !== id) }));
    return b;
  }));

  $('tips').replaceChildren(...build.tips.map((t) => el('li', {}, t)));
}

// ───────────────────────── Share & save ─────────────────────────

function shareUrl() {
  const url = new URL(location.href);
  url.hash = encodeState(state);
  return url.toString();
}

async function copyLink() {
  const status = $('copy-status');
  try {
    await navigator.clipboard.writeText(shareUrl());
    status.textContent = 'Link copied!';
  } catch {
    status.textContent = 'Copy failed. Copy the address bar instead.';
  }
  setTimeout(() => { status.textContent = ''; }, 2500);
}

function onSave() {
  const input = $('save-name');
  const hero = HERO_BY_ID.get(state.hero);
  const name = cleanName(input.value) || (hero ? `${hero.name} build` : 'My build');
  const list = saveBuild(name, state);
  if (list) { input.value = ''; renderSaved(list); }
  else renderSaved(loadSaved(), 'Could not save: browser storage is unavailable.');
}

function renderSaved(list = loadSaved(), error = '') {
  const ul = $('saved');
  if (error) { ul.replaceChildren(el('li', { class: 'empty' }, error)); return; }
  if (!list.length) { ul.replaceChildren(el('li', { class: 'empty' }, 'No saved builds yet.')); return; }
  ul.replaceChildren(...list.map((entry) => {
    const load = el('button', { type: 'button', class: 'ghost small' }, 'Load');
    load.addEventListener('click', () => { state = sanitizeState(entry.state); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const del = el('button', { type: 'button', class: 'ghost small danger', 'aria-label': `Delete ${entry.name}` }, 'Delete');
    del.addEventListener('click', () => renderSaved(deleteBuild(entry.id)));
    const heroName = HERO_BY_ID.get(entry.state.hero)?.name || 'Any hero';
    return el('li', {},
      el('div', {}, el('strong', {}, entry.name), el('span', { class: 'meta' }, ` ${heroName} · W${entry.state.focus.weapon}/S${entry.state.focus.spirit}/V${entry.state.focus.vitality}`)),
      el('div', { class: 'row' }, load, del),
    );
  }));
}

// ───────────────────────── Main ─────────────────────────

function render() {
  syncControls();
  renderBuild(generateBuild(state));
  const hash = encodeState(state);
  if (location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
}

initControls();
render();
renderSaved();
