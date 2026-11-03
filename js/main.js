// ═══════════════════════════════════════════════════════════════════════════
// main.js — connects the page (HTML) to the logic (engine.js / state.js)
// ═══════════════════════════════════════════════════════════════════════════
//
// index.html loads this file with <script type="module">. It:
//   1. fills in the controls (hero dropdown, priority chips, game-plan buttons,
//      counter chips),
//   2. listens for clicks/drags ("events") and updates the `state` object,
//   3. after every change calls render(), which asks the engine for a build
//      and redraws the results.
//
// The flow is always one direction (like a simple game loop):
//
//     user input ──► update(patch) ──► state ──► render() ──► page
//
// Because render() rebuilds the results from scratch every time, there's no
// risk of the page showing something different from `state`. The engine is
// fast (a few milliseconds), so redrawing on every slider tick is fine.
//
// What's in this file, top to bottom:
//   • helpers ............ $(), el(), fmt()
//   • initControls() ..... builds the left-hand controls and wires up events
//   • syncControls() ..... makes the controls match `state`
//   • update() ........... the one place that changes `state`
//   • results ............ distribution bar, item cards, counter cards
//   • swap lists ......... the "Swap" pop-down with alternative items
//   • share & save ....... copy-link button and saved builds
//   • render() + startup
//
// Terms you'll see:
//   • DOM — the page as a tree of objects JS can read/change. document.getElementById('x')
//     finds the element with id="x" in index.html.
//   • addEventListener('click', fn) — "call fn when this is clicked" (a callback).
//   • async/await — like Python's asyncio: `await` pauses until a slow task finishes.
//
// SECURITY: every piece of text is inserted with createElement + textContent
// (via the el() helper below). We NEVER use innerHTML, which would interpret
// text as HTML — so a saved build named "<img onerror=...>" just shows those
// characters instead of running anything.

import { CATEGORIES, TIER_COST, ITEM_BY_ID, DATA_SOURCE } from './data/items.js';
import { HEROES, HERO_BY_ID } from './data/heroes.js';
import { PRIORITIES, GAME_PLANS } from './data/priorities.js';
import { COUNTERS } from './data/counters.js';
import { generateBuild, TOTAL_SLOTS } from './engine.js';
import { defaultState, sanitizeState, encodeState, decodeState } from './state.js';
import { loadSaved, saveBuild, deleteBuild, cleanName } from './storage.js';

// ───────────────────────── Helpers ─────────────────────────

// Shortcut: $('hero') instead of document.getElementById('hero').
const $ = (id) => document.getElementById(id);
// ['weapon', 'vitality', 'spirit'], used to loop over the three sliders.
const CATS = Object.keys(CATEGORIES);

// Slider values applied by the quick preset buttons under the sliders.
const PRESETS = {
  weapon: { weapon: 70, spirit: 10, vitality: 20 },
  spirit: { weapon: 10, spirit: 65, vitality: 25 },
  vitality: { weapon: 25, spirit: 15, vitality: 60 },
  balanced: { weapon: 35, spirit: 35, vitality: 30 },
};

/**
 * Safe element builder.
 *   el('div', { class: 'card' }, 'Hello ', el('strong', {}, 'world'))
 * creates <div class="card">Hello <strong>world</strong></div>.
 * Strings always become text nodes, never HTML — this is the XSS protection.
 * (`...children` gathers extra arguments into a list, like *args in Python.)
 */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {        // ≈ for k, v in attrs.items()
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

// 6400 → "6,400"
const fmt = (n) => n.toLocaleString('en-US');

// The single source of truth for what the user picked. Start from the share
// link in the URL if there is one, otherwise the defaults. `let` because we
// replace it on every change.
let state = decodeState(location.hash) || defaultState();

// ───────────────────────── Controls (run once at startup) ─────────────────────────

function initControls() {
  // Hero dropdown: one <option> per hero. Changing hero also applies that
  // hero's suggested slider values (`lean`); the user can tweak them after.
  const heroSel = $('hero');
  heroSel.append(el('option', { value: '' }, 'Any hero'));
  for (const h of HEROES) heroSel.append(el('option', { value: h.id }, h.name));
  heroSel.addEventListener('change', () => {
    const hero = HERO_BY_ID.get(heroSel.value);
    // `...(cond ? {focus} : {})` adds the focus key only when a hero was picked.
    update({ hero: hero ? hero.id : '', ...(hero ? { focus: { ...hero.lean } } : {}) });
  });

  // Sliders: 'input' fires continuously while dragging, so results update live.
  for (const cat of CATS) {
    $(`focus-${cat}`).addEventListener('input', (e) => {
      // `[cat]: value` sets a key whose name is in a variable (≈ {**focus, cat: value}).
      update({ focus: { ...state.focus, [cat]: Number(e.target.value) } });
    });
  }

  // Preset buttons: one listener on the container handles all four buttons
  // ("event delegation"); data-preset="..." in the HTML says which preset.
  $('presets').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn) return;
    const preset = PRESETS[btn.dataset.preset];
    if (preset) update({ focus: { ...preset } });
  });

  // Priority chips: a hidden checkbox inside a styled <label> for each priority.
  const prioWrap = $('priorities');
  for (const p of PRIORITIES) {
    const input = el('input', { type: 'checkbox', value: p.id, id: `prio-${p.id}` });
    input.addEventListener('change', () => {
      const set = new Set(state.priorities);
      if (input.checked) set.add(p.id); else set.delete(p.id);
      // Keep the same order as the PRIORITIES list so share links are stable.
      update({ priorities: PRIORITIES.map((x) => x.id).filter((id) => set.has(id)) });
    });
    prioWrap.append(el('label', { class: 'chip', for: `prio-${p.id}` }, input, el('span', {}, p.label)));
  }

  // Game plan: radio buttons (only one can be selected).
  const planWrap = $('plans');
  for (const g of GAME_PLANS) {
    const input = el('input', { type: 'radio', name: 'plan', value: g.id, id: `plan-${g.id}` });
    input.addEventListener('change', () => { if (input.checked) update({ plan: g.id }); });
    planWrap.append(el('label', { for: `plan-${g.id}` }, input, el('span', {}, g.label)));
  }

  // Counter chips: same pattern as priorities, one checkbox per enemy threat
  // (heavy gun, heavy spirit, tanky, flying). The hint shows on hover.
  const counterWrap = $('counters');
  for (const t of COUNTERS) {
    const input = el('input', { type: 'checkbox', value: t.id, id: `counter-${t.id}` });
    input.addEventListener('change', () => {
      const set = new Set(state.counters);
      if (input.checked) set.add(t.id); else set.delete(t.id);
      update({ counters: COUNTERS.map((x) => x.id).filter((id) => set.has(id)) });
    });
    counterWrap.append(el('label', { class: 'chip', for: `counter-${t.id}`, title: t.hint }, input, el('span', {}, t.label)));
  }

  // Remaining buttons.
  // (openSwap is declared further down; that's fine because this click
  //  handler only runs later, after the whole file has loaded.)
  $('reset').addEventListener('click', () => { state = defaultState(); openSwap = null; render(); });
  // "Clear" resets your swaps entirely: nothing excluded, nothing pinned.
  $('clear-banned').addEventListener('click', () => update({ banned: [], pinned: [], counterPins: [] }));
  $('copy-link').addEventListener('click', copyLink);
  $('save').addEventListener('click', onSave);
  $('save-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onSave(); } });
  // The controls are a <form>; stop Enter from "submitting" and reloading the page.
  $('controls').addEventListener('submit', (e) => e.preventDefault());

  // Escape closes an open Swap list.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openSwap) { openSwap = null; render(); }
  });

  // If the user pastes a different share link into the address bar (or hits
  // Back), load that build.
  window.addEventListener('hashchange', () => {
    const next = decodeState(location.hash);
    if (next && encodeState(next) !== encodeState(state)) { state = next; render(); }
  });
}

/** Make the controls show what's in `state` (needed after loading a link/saved build). */
function syncControls() {
  $('hero').value = state.hero;
  const total = CATS.reduce((s, c) => s + state.focus[c], 0) || 1;
  for (const cat of CATS) {
    $(`focus-${cat}`).value = String(state.focus[cat]);
    // Show each slider as a share of the total, so the three always add to ~100%.
    $(`out-${cat}`).value = `${Math.round((state.focus[cat] / total) * 100)}%`;
  }
  for (const p of PRIORITIES) $(`prio-${p.id}`).checked = state.priorities.includes(p.id);
  for (const g of GAME_PLANS) $(`plan-${g.id}`).checked = state.plan === g.id;
  for (const t of COUNTERS) $(`counter-${t.id}`).checked = state.counters.includes(t.id);
}

/**
 * The ONLY way controls change state: merge `patch` into state, validate it,
 * and redraw. Running sanitizeState here too means even a bug in the UI
 * can't put invalid data into the state.
 */
function update(patch) {
  state = sanitizeState({ ...state, ...patch });
  render();
}

// ───────────────────────── Results ─────────────────────────

/** The colored bar showing how many slots each category got. */
function renderDistribution(quotas) {
  const wrap = $('distribution');
  wrap.replaceChildren(); // clear old content
  for (const cat of CATS) {
    if (!quotas[cat]) continue;
    const seg = el('div', { class: `seg ${cat}`, title: `${CATEGORIES[cat].label}: ${quotas[cat]} items` },
      `${CATEGORIES[cat].label} ${quotas[cat]}`);
    // Segment width ∝ item count. Setting .style from JS is allowed by our
    // Content Security Policy (inline style="" attributes in HTML are not).
    seg.style.flexGrow = String(quotas[cat]);
    wrap.append(seg);
  }
}

// ───────────────────────── Swap lists ─────────────────────────
//
// Clicking "Swap" on a card opens a small list of alternatives under it.
// Choosing one does two things to `state`:
//   • the old item goes into `banned` (shown under "Excluded:"), and
//   • the chosen item goes into `pinned` (or `counterPins` for counter cards),
//     which tells the engine "always use this item for its slot".
// Pinning is what makes the swap stick even if you then move a slider. The
// alternatives themselves come from the engine (pick.alternatives): the
// runner-up items it scored for that same slot.

// Which card's Swap list is open, e.g. 'core:ricochet' or 'counter:knockdown'.
// The prefix keeps a core card and a counter card for the same item apart.
// This is temporary UI state, so it isn't part of `state` or the share link.
let openSwap = null;

/** Open/close a card's Swap list (only one open at a time). */
function toggleSwap(key) {
  openSwap = openSwap === key ? null : key;
  render();
  // Move keyboard focus into the list so keyboard users land on the choices.
  // CSS.escape makes the key safe to put inside a CSS selector string.
  if (openSwap) document.querySelector(`[data-swap-key="${CSS.escape(key)}"] button`)?.focus();
}

/**
 * Replace item `fromId` with `toId` (or let the builder choose if toId is null).
 * The old item is excluded; the new one is pinned so it's guaranteed a spot.
 * `pinKey` is 'pinned' for the core build or 'counterPins' for counters.
 */
function swapItem(fromId, toId, pinKey) {
  const pins = state[pinKey].filter((id) => id !== fromId);
  openSwap = null;
  update({ banned: [...state.banned, fromId], [pinKey]: toId ? [...pins, toId] : pins });
}

/**
 * The list of alternatives shown under a card after clicking Swap.
 *   key          – which card this belongs to (see openSwap)
 *   item         – the item being swapped out
 *   alternatives – [{ item, ... }] from the engine
 *   pinKey       – 'pinned' (core) or 'counterPins' (counters)
 *   describe     – function giving the grey line under each choice; core
 *                  cards show "Fits: ...", counter cards show the counter reason
 */
function swapPanel(key, item, alternatives, pinKey, describe) {
  const choices = alternatives.map((alt) => {
    const b = el('button', { type: 'button', class: `swap-choice ${alt.item.cat}` },
      el('span', { class: 'swap-name' }, alt.item.name),
      el('span', { class: 'cost' }, fmt(TIER_COST[alt.item.tier])),
      el('span', { class: 'swap-why' }, describe(alt)),
    );
    b.addEventListener('click', () => swapItem(item.id, alt.item.id, pinKey));
    return el('li', {}, b);
  });
  const auto = el('button', { type: 'button', class: 'ghost small' }, 'Let the builder choose');
  auto.addEventListener('click', () => swapItem(item.id, null, pinKey));
  const cancel = el('button', { type: 'button', class: 'ghost small' }, 'Cancel');
  cancel.addEventListener('click', () => toggleSwap(key));

  return el('div', { class: 'swap-panel', 'data-swap-key': key, role: 'group', 'aria-label': `Alternatives to ${item.name}` },
    el('p', { class: 'swap-title' }, `Swap ${item.name} for:`),
    choices.length ? el('ul', { class: 'swap-list' }, ...choices) : el('p', { class: 'help' }, 'No other items available for this slot.'),
    el('div', { class: 'row' }, auto, cancel),
  );
}

/** The Swap button for a card (shows whether its list is open). */
function swapButton(key, item) {
  const open = openSwap === key;
  const b = el('button', { type: 'button', class: `swap${open ? ' open' : ''}`, 'aria-expanded': String(open), title: `See alternatives to ${item.name}` }, open ? 'Close' : 'Swap');
  b.addEventListener('click', () => toggleSwap(key));
  return b;
}

// ───────────────────────── Item and counter cards ─────────────────────────

/**
 * One item card: badge, name, cost, description, "Fits: ..." reasons (or
 * "Your pick" if you chose it from a Swap list), Swap button, and the Swap
 * list itself when it's open.
 */
function itemCard(pick) {
  // "Destructuring": pull fields out of the object into variables.
  // ≈ item, reasons, alternatives = pick["item"], pick["reasons"], pick["alternatives"]
  const { item, reasons, alternatives } = pick;
  const key = `core:${item.id}`;

  return el('li', { class: `item ${item.cat}${openSwap === key ? ' swapping' : ''}` },
    el('div', { class: 'item-top' },
      el('span', { class: 'badge' }, CATEGORIES[item.cat].short),
      el('strong', {}, item.name),
      el('span', { class: 'cost' }, fmt(TIER_COST[item.tier])),
    ),
    el('p', { class: 'desc' }, item.desc),
    el('div', { class: 'item-foot' },
      pick.pinned
        ? el('span', { class: 'why pinned' }, 'Your pick')
        : el('span', { class: 'why' }, reasons.length ? `Fits: ${reasons.join(', ')}` : 'Solid general pick'),
      swapButton(key, item),
    ),
    openSwap === key
      ? swapPanel(key, item, alternatives, 'pinned', (alt) => (alt.reasons.length ? `Fits: ${alt.reasons.join(', ')}` : 'General pick'))
      : null,
  );
}

/**
 * One counter card. It looks like an item card but has a red "counter" border,
 * explains WHY it counters the threat, and says which core item to sell.
 */
function counterCard(option) {
  const { item, why, replace, alternatives } = option;
  const key = `counter:${item.id}`;

  return el('li', { class: `item counter ${item.cat}${openSwap === key ? ' swapping' : ''}` },
    el('div', { class: 'item-top' },
      el('span', { class: 'badge' }, CATEGORIES[item.cat].short),
      el('strong', {}, item.name),
      el('span', { class: 'cost' }, fmt(TIER_COST[item.tier])),
    ),
    el('p', { class: 'desc' }, why || item.desc),
    // "Replace: X (cost)". The `...( ? [...] : [...])` spreads a list of
    // children into el(), since el() takes children as separate arguments.
    el('p', { class: 'replace' },
      ...(replace
        ? ['Replace: ', el('strong', {}, replace.name), ` (${fmt(TIER_COST[replace.tier])})`]
        : ['Use a free slot']),
    ),
    el('div', { class: 'item-foot' },
      el('span', { class: `why${option.pinned ? ' pinned' : ''}` }, option.pinned ? 'Your pick' : `Tier ${item.tier} · ${CATEGORIES[item.cat].label}`),
      swapButton(key, item),
    ),
    openSwap === key ? swapPanel(key, item, alternatives, 'counterPins', (alt) => alt.why) : null,
  );
}

/** The "Counter items" group under the core build (only when a threat is selected). */
function renderCounters(counters) {
  if (!counters.length) { $('counter-results').replaceChildren(); return; }
  const groups = counters.map((c) => el('div', { class: 'counter-group' },
    el('h4', {}, `vs ${c.label}`),
    c.hint ? el('p', { class: 'help' }, c.hint) : null,
    c.alreadyHave.length
      ? el('p', { class: 'have' }, `Already in your build: ${c.alreadyHave.map((i) => i.name).join(', ')}`)
      : null,
    c.options.length
      ? el('ol', { class: 'items' }, ...c.options.map(counterCard))
      : el('p', { class: 'help' }, 'No other counter items available. Clear excluded items to see more.'),
  ));
  $('counter-results').replaceChildren(el('section', { class: 'phase counters-phase' },
    el('header', {}, el('h3', {}, 'Counter items', el('span', { class: 'tier' }, ' Situational'))),
    el('p', { class: 'help' }, 'Not part of the 12-slot build. Buy one per threat when you need it, selling the suggested item.'),
    ...groups,
  ));
}

/** Draw the whole results panel from the engine's output. */
function renderBuild(build) {
  const hero = HERO_BY_ID.get(state.hero);
  $('build-title').textContent = hero ? `Recommended build: ${hero.name}` : 'Recommended build';
  const count = build.phases.reduce((n, p) => n + p.items.length, 0);
  $('build-summary').textContent = `${count}/${TOTAL_SLOTS} slots · ${fmt(build.totalCost)} souls total`;

  renderDistribution(build.quotas);

  // One section per phase, with that phase's cost and the running total.
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
  renderCounters(build.counters);

  // "Excluded:" row: every item you swapped out. Click one to allow it again
  // (the item you picked in its place stays pinned until you click "Clear").
  const bannedWrap = $('banned-wrap');
  bannedWrap.hidden = state.banned.length === 0;
  $('banned').replaceChildren(...state.banned.map((id) => {
    const item = ITEM_BY_ID.get(id); // always exists: sanitizeState only keeps known ids
    const b = el('button', { type: 'button', class: 'chip-btn', 'aria-label': `Allow ${item.name} again` }, `${item.name} ✕`);
    b.addEventListener('click', () => update({ banned: state.banned.filter((x) => x !== id) }));
    return b;
  }));

  $('tips').replaceChildren(...build.tips.map((t) => el('li', {}, t)));
}

// ───────────────────────── Share & save ─────────────────────────

/** Current page address with the build encoded after '#'. */
function shareUrl() {
  const url = new URL(location.href);
  url.hash = encodeState(state);
  return url.toString();
}

/** Copy the share link to the clipboard (async because the browser may ask permission). */
async function copyLink() {
  const status = $('copy-status');
  try {
    await navigator.clipboard.writeText(shareUrl());
    status.textContent = 'Link copied!';
  } catch {
    status.textContent = 'Copy failed. Copy the address bar instead.';
  }
  setTimeout(() => { status.textContent = ''; }, 2500); // clear message after 2.5 s
}

/** Save the current build under the typed name (or a sensible default). */
function onSave() {
  const input = $('save-name');
  const hero = HERO_BY_ID.get(state.hero);
  const name = cleanName(input.value) || (hero ? `${hero.name} build` : 'My build');
  const list = saveBuild(name, state);
  if (list) { input.value = ''; renderSaved(list); }
  else renderSaved(loadSaved(), 'Could not save: browser storage is unavailable.');
}

/** Draw the saved-builds list with Load / Delete buttons. */
function renderSaved(list = loadSaved(), error = '') {
  const ul = $('saved');
  if (error) { ul.replaceChildren(el('li', { class: 'empty' }, error)); return; }
  if (!list.length) { ul.replaceChildren(el('li', { class: 'empty' }, 'No saved builds yet.')); return; }
  ul.replaceChildren(...list.map((entry) => {
    const load = el('button', { type: 'button', class: 'ghost small' }, 'Load');
    load.addEventListener('click', () => { state = sanitizeState(entry.state); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const del = el('button', { type: 'button', class: 'ghost small danger', 'aria-label': `Delete ${entry.name}` }, 'Delete');
    del.addEventListener('click', () => renderSaved(deleteBuild(entry.id)));
    // `?.` = "if the left side is missing, give undefined instead of crashing".
    const heroName = HERO_BY_ID.get(entry.state.hero)?.name || 'Any hero';
    return el('li', {},
      el('div', {}, el('strong', {}, entry.name), el('span', { class: 'meta' }, ` ${heroName} · W${entry.state.focus.weapon}/S${entry.state.focus.spirit}/V${entry.state.focus.vitality}`)),
      el('div', { class: 'row' }, load, del),
    );
  }));
}

// ───────────────────────── Main ─────────────────────────

/**
 * Redraw everything from `state`, then put the state in the address bar so
 * the URL is always a working share link. replaceState changes the URL
 * without reloading or adding a Back-button entry for every slider tick.
 */
function render() {
  syncControls();
  renderBuild(generateBuild(state));
  const hash = encodeState(state);
  if (location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
}

// Startup: show where the data came from (footer), build the controls, draw
// the first build, show saved builds. This runs once when the page loads.
$('data-source').textContent = DATA_SOURCE === 'manual' ? 'hand-maintained data' : DATA_SOURCE;
initControls();
render();
renderSaved();
