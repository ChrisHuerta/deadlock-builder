#!/usr/bin/env python3
"""
update_data.py — refresh Deadlock hero/item data for the build maker.

WHY THIS EXISTS
    The website never talks to any outside server: visitors only download
    files from your GitHub Pages site. Instead, YOU run this script on your
    own computer when a patch comes out. It downloads the current hero and
    item lists from the community API, checks them very strictly, merges them
    with your hand-written data, and writes the files the site uses. You then
    review the changes (git diff) and commit them.

DATA FLOW
    data/manual/items.json    hand-edited: tags, description, "core" value per item
    data/manual/heroes.json   hand-edited: suggested sliders ("lean") + tags per hero
    data/manual/tags.json     hand-edited: every valid tag -> readable label
             +
    data/api-snapshot/*.json  cleaned facts from the API (written by `fetch`)
             |
             v   (`build` merges them)
    data/game-data.json       merged result, readable, for reviewing diffs
    js/data/game-data.js      same data wrapped so the browser can import it

    If no API snapshot exists yet, the manual files alone are used, so the site
    works without ever running `fetch`.

COMMANDS (run from the project folder)
    python tools/update_data.py build      Merge local files only. No internet.
    python tools/update_data.py check      Validate everything, write nothing.
    python tools/update_data.py fetch      Download from the API, then build.
        --dry-run                Show what would change; write nothing.
        --add-stubs              Add empty entries to data/manual/ for new
                                 heroes/items so you can fill in tags/lean.
        --heroes-file PATH       Use a JSON file you downloaded yourself (e.g.
        --items-file PATH        in your browser) instead of the network.
        --include-in-development Also include heroes the API marks as
                                 selectable but still in development.

SECURITY MEASURES (the API is community-run, so treat it as untrusted)
    * Python standard library only: no pip packages, nothing extra to trust.
    * HTTPS only, certificate verification on, a fixed host allow-list, and
      redirects to any other host are refused.
    * Timeouts and a hard size limit on downloads.
    * Responses are parsed with json (never eval/pickle/exec). Nothing from
      the API is ever executed, and no images or other files are downloaded.
    * Only a handful of fields are kept (name, category, tier, cost, playable
      flags), and each is validated: names must match a strict character
      allow-list and length; anything odd is skipped and reported.
    * Files are only written to fixed paths inside this project, atomically
      (temp file + rename), so a crash can't leave half-written data.
    * The browser-side code validates the generated data again on load.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import ssl
import sys
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ───────────────────────────── configuration ─────────────────────────────

# Project root = the folder that contains this "tools" folder.
ROOT = Path(__file__).resolve().parent.parent

MANUAL_DIR = ROOT / "data" / "manual"
SNAPSHOT_DIR = ROOT / "data" / "api-snapshot"
OUT_JSON = ROOT / "data" / "game-data.json"
OUT_JS = ROOT / "js" / "data" / "game-data.js"

# Community API endpoints (deadlock-api.com, open source, not run by Valve).
# Docs: https://api.deadlock-api.com/docs  (endpoint list: /openapi.json)
# NOTE: if the API changes its URLs, update these lines.
HEROES_URL = "https://api.deadlock-api.com/v1/assets/heroes"
ITEMS_URL = "https://api.deadlock-api.com/v1/assets/items/by-type/upgrade"
ALLOWED_HOSTS = frozenset({"api.deadlock-api.com"})

TIMEOUT_SECONDS = 20
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024  # 20 MB is far more than these lists need
USER_AGENT = "deadlock-build-maker-data-updater/1.0 (+static fan site)"

CATEGORIES = ("weapon", "vitality", "spirit")
# The game's internal names for categories, mapped to ours. ("tech" is the
# old internal name for spirit, "armor" for vitality.)
CATEGORY_ALIASES = {
    "weapon": "weapon", "vitality": "vitality", "spirit": "spirit",
    "tech": "spirit", "armor": "vitality",
}

# Validation rules shared by everything.
ID_RE = re.compile(r"^[a-z0-9_]{1,40}$")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 '&.:!\-]{0,39}$")
RESERVED_IDS = frozenset({"__proto__", "constructor", "prototype"})
MAX_DESC = 300
MAX_TAGS = 8
MAX_ITEMS = 400
MAX_HEROES = 120

DEFAULT_LEAN = {"weapon": 34, "spirit": 33, "vitality": 33}


class DataError(Exception):
    """Raised when data fails validation. The message says what to fix."""


# ───────────────────────────── small helpers ─────────────────────────────

def slugify(name: str) -> str:
    """'Hunter's Aura' -> 'hunters_aura', 'Mo & Krill' -> 'mo_krill'.
    Our ids are derived from names, so share links stay readable and the
    API's items line up with data/manual entries by name."""
    s = name.lower().replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s[:40]


def clean_name(value) -> str | None:
    """Return a safe display name, or None if it doesn't pass the allow-list."""
    if not isinstance(value, str):
        return None
    # NFKC folds look-alike characters (e.g. full-width letters) to normal ones.
    s = unicodedata.normalize("NFKC", value).strip()
    s = s.replace("’", "'")  # curly apostrophe -> straight
    s = re.sub(r"\s+", " ", s)
    return s if NAME_RE.match(s) else None


def valid_id(value) -> bool:
    return isinstance(value, str) and bool(ID_RE.match(value)) and value not in RESERVED_IDS


def read_json(path: Path):
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f, parse_constant=_reject_constant)
    except FileNotFoundError:
        raise DataError(f"Missing file: {path.relative_to(ROOT)}") from None
    except (json.JSONDecodeError, RecursionError) as e:
        raise DataError(f"{path.relative_to(ROOT)} is not valid JSON: {e}") from None


def _reject_constant(name):
    # json accepts NaN/Infinity by default; real JSON doesn't. Reject them.
    raise ValueError(f"invalid JSON constant {name}")


def write_atomic(path: Path, text: str) -> None:
    """Write via a temp file + rename so a crash never leaves a broken file.
    Refuses to write anywhere outside the project folder."""
    path = path.resolve()
    if ROOT not in path.parents:
        raise DataError(f"Refusing to write outside the project: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def dump(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False) + "\n"


# ───────────────────────────── safe downloading ─────────────────────────────

class _SameHostRedirects(urllib.request.HTTPRedirectHandler):
    """Only follow redirects that stay on HTTPS and on an allowed host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        if target.scheme != "https" or target.hostname not in ALLOWED_HOSTS:
            raise urllib.error.HTTPError(newurl, code, "Blocked redirect to an untrusted location", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_json(url: str):
    """Download JSON from an allow-listed HTTPS URL with strict limits."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise DataError(f"Refusing to download from non-allow-listed URL: {url}")

    ctx = ssl.create_default_context()  # verifies certificates + hostname
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx), _SameHostRedirects()
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with opener.open(req, timeout=TIMEOUT_SECONDS) as resp:
            ctype = resp.headers.get("Content-Type", "")
            if "json" not in ctype.lower():
                raise DataError(f"{url} did not return JSON (Content-Type: {ctype or 'none'})")
            declared = resp.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > MAX_DOWNLOAD_BYTES:
                raise DataError(f"{url} is too large ({declared} bytes)")
            body = resp.read(MAX_DOWNLOAD_BYTES + 1)
    except urllib.error.HTTPError as e:
        raise DataError(f"Download failed: {url} -> HTTP {e.code} {e.reason}") from None
    except urllib.error.URLError as e:
        raise DataError(
            f"Could not reach {url} ({e.reason}).\n"
            "  Tip: open the URL in your browser, save the JSON, and run again with\n"
            "  --heroes-file / --items-file pointing at the saved files."
        ) from None
    except TimeoutError:
        raise DataError(f"Timed out downloading {url}") from None
    if len(body) > MAX_DOWNLOAD_BYTES:
        raise DataError(f"{url} exceeded the {MAX_DOWNLOAD_BYTES} byte limit")
    return _parse_untrusted_json(body, url)


def load_local_api_file(path_str: str):
    """Load an API response you saved yourself. Same size/parse limits."""
    path = Path(path_str).expanduser().resolve()
    if not path.is_file():
        raise DataError(f"Not a file: {path}")
    if path.stat().st_size > MAX_DOWNLOAD_BYTES:
        raise DataError(f"{path} is too large")
    return _parse_untrusted_json(path.read_bytes(), str(path))


def _parse_untrusted_json(body: bytes, source: str):
    try:
        return json.loads(body.decode("utf-8"), parse_constant=_reject_constant)
    except (UnicodeDecodeError, ValueError, RecursionError) as e:
        raise DataError(f"{source} is not valid JSON: {e}") from None


# ───────────────────────────── API -> clean facts ─────────────────────────────
# These functions turn the raw API response into a SMALL, fully validated
# structure. Everything not explicitly copied here is thrown away.

def _as_list(payload, what: str) -> list:
    # Some APIs wrap lists as {"data": [...]} or return a dict keyed by id.
    if isinstance(payload, dict):
        for key in ("data", what, "items", "heroes"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
        else:
            payload = list(payload.values())
    if not isinstance(payload, list):
        raise DataError(f"Unexpected {what} format: expected a list")
    return payload


def _flag(entry: dict, key: str, default: bool) -> bool:
    v = entry.get(key, default)
    return v if isinstance(v, bool) else default


def parse_api_heroes(payload, include_in_development: bool = False) -> tuple[list[dict], list[str]]:
    """Return (heroes, warnings). Keeps only playable heroes.

    The API lists every hero in the game files, including unreleased ones.
    A hero counts as playable when player_selectable is true and disabled is
    not true. Heroes that are selectable but flagged in_development (e.g.
    hero-labs heroes) are left out unless include_in_development is set."""
    raw = _as_list(payload, "heroes")
    if len(raw) > MAX_HEROES:
        raise DataError(f"API returned {len(raw)} heroes, more than the sanity limit {MAX_HEROES}")
    heroes, warnings, seen = [], [], set()
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        # Check playability first so unreleased placeholder heroes don't
        # produce noisy "invalid name" warnings.
        if not _flag(entry, "player_selectable", True) or _flag(entry, "disabled", False):
            continue
        name = clean_name(entry.get("name"))
        if not name:
            warnings.append(f"Skipped hero with invalid name: {str(entry.get('name'))[:60]!r}")
            continue
        if _flag(entry, "in_development", False) and not include_in_development:
            warnings.append(f"Left out {name!r}: marked in development (use --include-in-development to add)")
            continue
        hid = slugify(name)
        if not valid_id(hid) or hid in seen:
            warnings.append(f"Skipped hero with bad or duplicate id: {name!r}")
            continue
        seen.add(hid)
        heroes.append({"id": hid, "name": name})
    if not heroes:
        raise DataError("API returned no playable heroes; the format may have changed.")
    heroes.sort(key=lambda h: h["name"])
    return heroes, warnings


def _parse_tier(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if 1 <= value <= 4 else None
    if isinstance(value, str):  # e.g. "EModTier_3"
        m = re.search(r"([1-4])$", value)
        return int(m.group(1)) if m else None
    return None


def parse_api_items(payload) -> tuple[list[dict], list[str]]:
    """Return (items, warnings). Keeps only items you can buy in the shop."""
    raw = _as_list(payload, "items")
    if len(raw) > MAX_ITEMS * 5:
        raise DataError(f"API returned {len(raw)} items, more than the sanity limit")
    items, warnings, seen = [], [], set()
    skipped_tier5 = 0
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        if entry.get("type", "upgrade") != "upgrade":
            continue
        if not _flag(entry, "shopable", True) or _flag(entry, "disabled", False):
            continue
        # Tier-5 items exist in the game files with a placeholder cost of 9999
        # and aren't part of the normal shop, so they're left out.
        if entry.get("item_tier") == 5:
            skipped_tier5 += 1
            continue
        name = clean_name(entry.get("name"))
        if not name:
            warnings.append(f"Skipped item with invalid name: {str(entry.get('name'))[:60]!r}")
            continue
        cat = CATEGORY_ALIASES.get(str(entry.get("item_slot_type", "")).lower())
        tier = _parse_tier(entry.get("item_tier"))
        if cat is None or tier is None:
            warnings.append(f"Skipped {name!r}: unknown category/tier "
                            f"({str(entry.get('item_slot_type'))[:20]!r}, {str(entry.get('item_tier'))[:20]!r})")
            continue
        iid = slugify(name)
        if not valid_id(iid) or iid in seen:
            warnings.append(f"Skipped item with bad or duplicate id: {name!r}")
            continue
        seen.add(iid)
        cost = entry.get("cost")
        item = {"id": iid, "name": name, "cat": cat, "tier": tier}
        if isinstance(cost, int) and not isinstance(cost, bool) and 0 < cost <= 100_000:
            item["cost"] = cost
        items.append(item)
    if skipped_tier5:
        warnings.append(f"Left out {skipped_tier5} tier-5 items (not in the normal shop)")
    if not items:
        raise DataError("API returned no shop items; the format may have changed.")
    if len(items) > MAX_ITEMS:
        raise DataError(f"{len(items)} shop items is more than the sanity limit {MAX_ITEMS}")
    items.sort(key=lambda i: (CATEGORIES.index(i["cat"]), i["tier"], i["name"]))
    return items, warnings


# ───────────────────────────── manual data ─────────────────────────────

def load_manual():
    tags = read_json(MANUAL_DIR / "tags.json")
    items = read_json(MANUAL_DIR / "items.json")
    heroes = read_json(MANUAL_DIR / "heroes.json")
    errors = []

    if not isinstance(tags, dict) or not tags:
        raise DataError("data/manual/tags.json must be an object of tag -> label")
    for t, label in tags.items():
        if not valid_id(t) or not isinstance(label, str) or not (0 < len(label) <= 40):
            errors.append(f"tags.json: bad tag {t!r}")

    if not isinstance(items, dict):
        raise DataError("data/manual/items.json must be an object keyed by item id")
    for iid, it in items.items():
        where = f"items.json[{iid!r}]"
        if not valid_id(iid):
            errors.append(f"{where}: id must be lowercase letters/digits/underscores")
            continue
        if not isinstance(it, dict):
            errors.append(f"{where}: must be an object")
            continue
        if clean_name(it.get("name")) is None:
            errors.append(f"{where}: invalid name")
        if it.get("cat") not in CATEGORIES:
            errors.append(f"{where}: cat must be one of {CATEGORIES}")
        if _parse_tier(it.get("tier")) is None or not isinstance(it.get("tier"), int):
            errors.append(f"{where}: tier must be 1-4")
        errors += _check_tags(where, it.get("tags", []), tags)
        desc = it.get("desc", "")
        if not isinstance(desc, str) or len(desc) > MAX_DESC:
            errors.append(f"{where}: desc must be text up to {MAX_DESC} characters")
        core = it.get("core", 1)
        if isinstance(core, bool) or not isinstance(core, (int, float)) or not 0 <= core <= 3:
            errors.append(f"{where}: core must be a number 0-3")

    if not isinstance(heroes, dict):
        raise DataError("data/manual/heroes.json must be an object keyed by hero id")
    for hid, h in heroes.items():
        where = f"heroes.json[{hid!r}]"
        if not valid_id(hid):
            errors.append(f"{where}: id must be lowercase letters/digits/underscores")
            continue
        if not isinstance(h, dict):
            errors.append(f"{where}: must be an object")
            continue
        if clean_name(h.get("name")) is None:
            errors.append(f"{where}: invalid name")
        lean = h.get("lean")
        if not isinstance(lean, dict) or set(lean) != set(CATEGORIES) or not all(
            isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 100 for v in lean.values()
        ):
            errors.append(f"{where}: lean needs weapon/spirit/vitality whole numbers 0-100")
        errors += _check_tags(where, h.get("tags", []), tags)

    if errors:
        raise DataError("Problems in data/manual:\n  - " + "\n  - ".join(errors))
    return tags, items, heroes


def _check_tags(where, value, tags) -> list[str]:
    if not isinstance(value, list) or len(value) > MAX_TAGS:
        return [f"{where}: tags must be a list of up to {MAX_TAGS} tags"]
    bad = [t for t in value if t not in tags]
    return [f"{where}: unknown tag(s) {bad} (add them to tags.json)"] if bad else []


# ───────────────────────────── merge + output ─────────────────────────────

def load_snapshot():
    """Return (heroes, items, meta) from data/api-snapshot, or None if absent."""
    h, i, m = (SNAPSHOT_DIR / n for n in ("heroes.json", "items.json", "meta.json"))
    if not (h.exists() and i.exists()):
        return None
    meta = read_json(m) if m.exists() else {}
    # Re-validate even our own snapshot, in case it was edited by hand.
    heroes = _validate_snapshot(read_json(h), "heroes", MAX_HEROES, _snapshot_hero)
    items = _validate_snapshot(read_json(i), "items", MAX_ITEMS, _snapshot_item)
    return heroes, items, meta if isinstance(meta, dict) else {}


def _snapshot_hero(e) -> dict | None:
    if not isinstance(e, dict) or not valid_id(e.get("id")):
        return None
    name = clean_name(e.get("name"))
    return {"id": e["id"], "name": name} if name else None


def _snapshot_item(e) -> dict | None:
    if not isinstance(e, dict) or not valid_id(e.get("id")):
        return None
    name = clean_name(e.get("name"))
    tier = e.get("tier")
    if not name or e.get("cat") not in CATEGORIES or isinstance(tier, bool) or tier not in (1, 2, 3, 4):
        return None
    out = {"id": e["id"], "name": name, "cat": e["cat"], "tier": tier}
    cost = e.get("cost")
    if isinstance(cost, int) and not isinstance(cost, bool) and 0 < cost <= 100_000:
        out["cost"] = cost
    return out


def _validate_snapshot(raw, what, limit, check):
    """Validate the cleaned snapshot format (our own fields, not the API's)."""
    if not isinstance(raw, list) or not raw or len(raw) > limit:
        raise DataError(f"data/api-snapshot/{what}.json is malformed; re-run `fetch`.")
    out, seen = [], set()
    for e in raw:
        v = check(e)
        if v is None or v["id"] in seen:
            raise DataError(f"data/api-snapshot/{what}.json has an invalid entry: {str(e)[:80]}")
        seen.add(v["id"])
        out.append(v)
    return out


def merge(tags, manual_items, manual_heroes, snapshot):
    """Combine game facts (snapshot) with hand-written data. Returns
    (game_data, report) where report lists things needing attention."""
    report = {"items_missing_manual": [], "heroes_missing_manual": [],
              "manual_items_not_in_game": [], "manual_heroes_not_in_game": [],
              "category_or_tier_changed": []}

    if snapshot is None:
        source = "manual"
        api_items = [{"id": k, "name": v["name"], "cat": v["cat"], "tier": v["tier"]} for k, v in manual_items.items()]
        api_heroes = [{"id": k, "name": v["name"]} for k, v in manual_heroes.items()]
    else:
        api_heroes, api_items, meta = snapshot
        source = f"deadlock-api.com snapshot {meta.get('fetched', 'unknown date')}"

    items_out = []
    for a in api_items:
        m = manual_items.get(a["id"])
        if m is None:
            report["items_missing_manual"].append(a["name"])
            m = {}
        elif (m.get("cat"), m.get("tier")) != (a["cat"], a["tier"]):
            report["category_or_tier_changed"].append(
                f"{a['name']}: manual {m.get('cat')}/T{m.get('tier')} -> game {a['cat']}/T{a['tier']}")
        items_out.append({
            "id": a["id"], "name": a["name"], "cat": a["cat"], "tier": a["tier"],
            "tags": list(m.get("tags", [])),
            "desc": m.get("desc") or "No description yet.",
            "core": m.get("core", 1),
        })

    heroes_out = []
    for a in api_heroes:
        m = manual_heroes.get(a["id"])
        if m is None:
            report["heroes_missing_manual"].append(a["name"])
            m = {}
        heroes_out.append({
            "id": a["id"], "name": a["name"],
            "lean": dict(m.get("lean", DEFAULT_LEAN)),
            "tags": list(m.get("tags", [])),
        })

    game_ids = {a["id"] for a in api_items}
    hero_ids = {a["id"] for a in api_heroes}
    report["manual_items_not_in_game"] = sorted(v["name"] for k, v in manual_items.items() if k not in game_ids)
    report["manual_heroes_not_in_game"] = sorted(v["name"] for k, v in manual_heroes.items() if k not in hero_ids)

    items_out.sort(key=lambda i: (CATEGORIES.index(i["cat"]), i["tier"], i["name"]))
    heroes_out.sort(key=lambda h: h["name"])
    game_data = {"version": 1, "source": source, "tags": tags, "items": items_out, "heroes": heroes_out}
    return game_data, report


def render_js(game_data) -> str:
    """Wrap the data for the browser. It's embedded as ONE JSON string and
    decoded with JSON.parse, so it can only ever be data, never code.
    ensure_ascii escapes every non-ASCII character as \\uXXXX."""
    payload = json.dumps(json.dumps(game_data, ensure_ascii=True, separators=(",", ":")), ensure_ascii=True)
    return (
        "// GENERATED by tools/update_data.py. Do not edit by hand.\n"
        "// Edit data/manual/*.json, then run: python tools/update_data.py build\n"
        "// A readable copy of this data is in data/game-data.json.\n"
        f"export default JSON.parse({payload});\n"
    )


def print_report(report, warnings=()):
    labels = {
        "heroes_missing_manual": "New heroes with no lean/tags yet (they get a neutral default)",
        "items_missing_manual": "New items with no tags yet (they will rarely be recommended)",
        "manual_heroes_not_in_game": "Heroes in data/manual not in the game (renamed or removed?)",
        "manual_items_not_in_game": "Items in data/manual not in the game (renamed or removed?)",
        "category_or_tier_changed": "Items whose category/tier changed in the game",
    }
    for key, label in labels.items():
        if report[key]:
            print(f"\n{label}: {len(report[key])}")
            for name in report[key]:
                print(f"   - {name}")
    for w in warnings:
        print(f"   warning: {w}")


def write_outputs(game_data) -> list[str]:
    """Write output files if they changed. Returns the paths written."""
    written = []
    for path, text in ((OUT_JSON, dump(game_data)), (OUT_JS, render_js(game_data))):
        old = path.read_text(encoding="utf-8") if path.exists() else None
        if old != text:
            write_atomic(path, text)
            written.append(path.relative_to(ROOT).as_posix())
    return written


def add_stubs(report, snapshot) -> int:
    """Add empty manual entries for new heroes/items so they're easy to fill in."""
    heroes, items, _ = snapshot
    manual_items = read_json(MANUAL_DIR / "items.json")
    manual_heroes = read_json(MANUAL_DIR / "heroes.json")
    added = 0
    for it in items:
        if it["id"] not in manual_items:
            manual_items[it["id"]] = {"name": it["name"], "cat": it["cat"], "tier": it["tier"],
                                      "tags": [], "desc": "", "core": 1}
            added += 1
    for h in heroes:
        if h["id"] not in manual_heroes:
            manual_heroes[h["id"]] = {"name": h["name"], "lean": dict(DEFAULT_LEAN), "tags": []}
            added += 1
    if added:
        write_atomic(MANUAL_DIR / "items.json", dump(manual_items))
        write_atomic(MANUAL_DIR / "heroes.json", dump(manual_heroes))
    return added


# ───────────────────────────── commands ─────────────────────────────

def cmd_build(_args) -> int:
    tags, items, heroes = load_manual()
    game_data, report = merge(tags, items, heroes, load_snapshot())
    written = write_outputs(game_data)
    print(f"Built {len(game_data['items'])} items and {len(game_data['heroes'])} heroes ({game_data['source']}).")
    print_report(report)
    print("\nUpdated: " + ", ".join(written) if written else "\nNo changes.")
    return 0


def cmd_check(_args) -> int:
    tags, items, heroes = load_manual()
    game_data, report = merge(tags, items, heroes, load_snapshot())
    print(f"Manual data OK: {len(items)} items, {len(heroes)} heroes, {len(tags)} tags.")
    print_report(report)
    stale = [p.relative_to(ROOT).as_posix() for p, t in ((OUT_JSON, dump(game_data)), (OUT_JS, render_js(game_data)))
             if not p.exists() or p.read_text(encoding="utf-8") != t]
    if stale:
        print("\nOut of date (run `python tools/update_data.py build`): " + ", ".join(stale))
        return 1
    print("\nGenerated files are up to date.")
    return 0


def cmd_fetch(args) -> int:
    print("Downloading heroes..." if not args.heroes_file else f"Reading {args.heroes_file}...")
    raw_heroes = load_local_api_file(args.heroes_file) if args.heroes_file else fetch_json(HEROES_URL)
    print("Downloading items..." if not args.items_file else f"Reading {args.items_file}...")
    raw_items = load_local_api_file(args.items_file) if args.items_file else fetch_json(ITEMS_URL)

    heroes, hw = parse_api_heroes(raw_heroes, include_in_development=args.include_in_development)
    items, iw = parse_api_items(raw_items)
    meta = {"fetched": _dt.date.today().isoformat(),
            "source": "file" if (args.heroes_file or args.items_file) else "deadlock-api.com"}
    snapshot = (heroes, items, meta)

    tags, m_items, m_heroes = load_manual()
    game_data, report = merge(tags, m_items, m_heroes, snapshot)
    print(f"\nAPI: {len(heroes)} playable heroes, {len(items)} shop items.")
    print_report(report, hw + iw)

    if args.dry_run:
        print("\nDry run: nothing written.")
        return 0

    # Snapshot holds ONLY the cleaned fields, never the raw response.
    write_atomic(SNAPSHOT_DIR / "heroes.json", dump(heroes))
    write_atomic(SNAPSHOT_DIR / "items.json", dump(items))
    write_atomic(SNAPSHOT_DIR / "meta.json", dump(meta))

    if args.add_stubs:
        n = add_stubs(report, snapshot)
        print(f"\nAdded {n} stub entries to data/manual/. Fill in their tags/lean, then run `build`.")
        tags, m_items, m_heroes = load_manual()
        game_data, report = merge(tags, m_items, m_heroes, snapshot)

    written = write_outputs(game_data)
    print("\nUpdated: " + ", ".join(written) if written else "\nGenerated files unchanged.")
    print("Review the changes with `git diff` before committing.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Refresh Deadlock Build Maker data.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("build", help="merge local data into the site files (no internet)")
    sub.add_parser("check", help="validate data and confirm generated files are current")
    f = sub.add_parser("fetch", help="download from the community API, then build")
    f.add_argument("--dry-run", action="store_true", help="show changes without writing")
    f.add_argument("--add-stubs", action="store_true", help="add empty manual entries for new heroes/items")
    f.add_argument("--heroes-file", help="use a saved heroes JSON file instead of downloading")
    f.add_argument("--items-file", help="use a saved items JSON file instead of downloading")
    f.add_argument("--include-in-development", action="store_true",
                   help="also include selectable heroes the API marks as in development")
    args = parser.parse_args(argv)

    try:
        return {"build": cmd_build, "check": cmd_check, "fetch": cmd_fetch}[args.command](args)
    except DataError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
