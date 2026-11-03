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

Run the tests:

```bash
python -m unittest discover -s tests -v   # data update script (Python)
npm test                                  # build engine + share links (needs Node 18+)
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
index.html               Page markup + Content Security Policy
css/styles.css           Styles
js/main.js               UI wiring (DOM only, no innerHTML)
js/engine.js             Build recommendation algorithm (pure, testable)
js/state.js              State validation + share-link encoding
js/storage.js            Saved builds (localStorage, validated on read)
js/data/items.js         Loads + re-validates items from game-data.js
js/data/heroes.js        Loads + re-validates heroes from game-data.js
js/data/priorities.js    Playstyle priorities, tag labels, game plans
js/data/game-data.js     GENERATED: data the site uses (don't edit)
data/manual/             ← YOU EDIT THESE: item tags/descriptions, hero lean/tags, tag list
data/api-snapshot/       GENERATED: cleaned facts from the community API
data/game-data.json      GENERATED: readable copy of game-data.js, for reviewing diffs
tools/update_data.py     Data updater (Python, standard library only)
tests/                   Python + Node tests
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

## Updating game data

The website never contacts any outside server. Game data is refreshed by
**you, on your computer**, with a Python script (standard library only, no
`pip install`), and you review the result before committing.

**After a Deadlock patch:**

```bash
python tools/update_data.py fetch --dry-run      # preview: new/removed heroes and items
python tools/update_data.py fetch --add-stubs    # download, save, add blank entries for new things
# fill in tags/lean for the new entries in data/manual/*.json, then:
python tools/update_data.py build
git diff                                         # review what changed
```

**Editing by hand** (tags, descriptions, hero sliders): edit
`data/manual/items.json`, `heroes.json` or `tags.json`, then run
`python tools/update_data.py build`. Use `check` to validate without writing.

**If the download fails** (API down, network blocked): open these URLs in your
browser, save each page as a `.json` file, and pass the files in:

```bash
python tools/update_data.py fetch --heroes-file heroes.json --items-file items.json
```

- Heroes: https://api.deadlock-api.com/v1/assets/heroes
- Items: https://api.deadlock-api.com/v1/assets/items/by-type/upgrade

API docs: https://api.deadlock-api.com/docs

How the merge works: the API decides **which** heroes and items exist and
each item's category and tier. Your manual files supply everything that's a
judgment call (tags, descriptions, hero slider presets). New heroes or items
without manual entries still show up, with neutral defaults. The script lists
them so you can fill them in.

IDs come from names (`Hunter's Aura` → `hunters_aura`) and are used in share
links. If Valve renames an item, old links simply drop it.

Filtering: heroes must be selectable, not disabled, and have a
`development_state` of `release`.
Tier-5 items, which have a placeholder cost of 9999, are left out as well.

**Script security:** HTTPS only, with certificate checks. Only
`api.deadlock-api.com` is allowed, and redirects to other hosts are refused.
Downloads have timeouts and a 20 MB cap. Responses are only parsed as JSON,
never executed. Only name, category, tier, cost and the "playable" flags are
kept; names must pass a strict character allow-list. Files are written
atomically, and only inside this project.

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
