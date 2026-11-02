# Deadlock Build Maker

A static web app that recommends a Deadlock item build based on how much you
want to focus on **Weapon**, **Spirit** and **Vitality**, plus optional
playstyle priorities (sustain, mobility, anti-heal, crowd control…) and hero.

It runs entirely in the browser. There's no backend, no tracking and no
third-party scripts, so it can be hosted for free on **GitHub Pages**.

## Features

- Weapon / Spirit / Vitality focus sliders, plus quick presets
- Optional hero pick that sets a suggested focus and favors items suited to the hero
- 17 toggleable playstyle priorities
- Game plan: balanced, early aggression or late-game scaling
- 12-slot build grouped by phase (lane → late) with soul costs and a reason for each pick
- **Swap** any item to exclude it and get the next-best alternative
- Shareable links (the whole build state lives in the URL hash)
- Save builds locally (browser `localStorage`, never uploaded)

## Run locally

ES modules don't load from `file://`, so serve the folder with any static server:

```bash
python -m http.server 8080
# then open http://localhost:8080
```

Run the tests (requires Node 18+):

```bash
npm test
```

## Deploy to GitHub Pages

1. Create a new repository on GitHub (for example `deadlock-build-maker`).
2. From this folder:
   ```bash
   git init -b main
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/<your-username>/deadlock-build-maker.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   then choose `main` and `/ (root)`, and click **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/deadlock-build-maker/`.
5. Optional: tick **Enforce HTTPS** on the same page (usually on by default).

## Project structure

```
index.html            Page markup + Content Security Policy
css/styles.css        Styles
js/main.js            UI wiring (DOM only, no innerHTML)
js/engine.js          Build recommendation algorithm (pure, testable)
js/state.js           State validation + share-link encoding
js/storage.js         Saved builds (localStorage, validated on read)
js/data/items.js      Item database  ← update this when patches land
js/data/heroes.js     Hero presets
js/data/priorities.js Playstyle priorities, tag labels, game plans
tests/                Node test runner tests
```

## How the recommendation works

1. The slider values are normalized and the 12 slots are split between the
   categories proportionally.
2. The game plan sets how many items of each tier (800 / 1600 / 3200 / 6400
   souls) go into the build. Categories are interleaved, so each focus area
   gets items in every phase.
3. Each candidate item is scored from its tags. Tags get weight from the
   sliders (implicit), the selected priorities (strong) and the hero (mild).
   Tags that repeat are worth less each time, which keeps the build varied.

## Updating item data

Deadlock patches often. To add or change an item, edit `js/data/items.js`.
Every item has a `cat`, `tier` and some `tags`. Valid tags are listed in
`TAG_LABELS` in `js/data/priorities.js`. **Don't change existing `id`s**:
they're used in share links and saved builds.

## Security notes

- Strict Content Security Policy: only same-origin scripts and styles, no
  inline scripts, no `eval`, no network requests.
- All dynamic content is rendered with `textContent` / `createElement`;
  `innerHTML` is never used.
- Everything read from the URL or `localStorage` is untrusted. It's checked
  against allow-lists of known ids, numbers are clamped, and lengths are capped.
- No cookies, analytics or external dependencies.

See [SECURITY.md](SECURITY.md) for how to report a problem.

## Ideas for later

- Item upgrade paths (component → upgraded item)
- Item icons (use only assets you have the rights to)
- Counter-build mode: pick enemy heroes, get suggested counters
- Export a build as an image

## Disclaimer

Fan-made project, not affiliated with or endorsed by Valve. Deadlock is a
trademark of Valve Corporation. Item data is community-maintained and may lag
behind the current patch.
