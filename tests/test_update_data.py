"""
Tests for tools/update_data.py. Run from the project folder with:

    python -m unittest discover -s tests -v

No internet needed: the API is simulated with fake responses, including
deliberately malicious ones, to prove they are rejected or cleaned.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import update_data as ud  # noqa: E402


def hero(name, **flags):
    """Build a fake API hero entry. Flags default to 'playable'; override
    them with keyword arguments, e.g. hero('X', disabled=True).
    """
    return {"name": name, "player_selectable": True, "disabled": False, "in_development": False, **flags}


def item(name, slot="weapon", tier=1, **extra):
    """Build a fake API shop item entry; override fields with keyword args."""
    return {"name": name, "type": "upgrade", "item_slot_type": slot, "item_tier": tier,
            "shopable": True, "disabled": False, "cost": 800, **extra}


class TestSlugify(unittest.TestCase):
    """Ids are made from names; they must match the ids already used in
    data/manual and in people's share links.
    """
    def test_matches_existing_ids(self):
        self.assertEqual(ud.slugify("Hunter's Aura"), "hunters_aura")
        self.assertEqual(ud.slugify("Mo & Krill"), "mo_krill")
        self.assertEqual(ud.slugify("High-Velocity Rounds"), "high_velocity_rounds")
        self.assertEqual(ud.slugify("Diviner's Kevlar"), "diviners_kevlar")


class TestCleanName(unittest.TestCase):
    """Names from the API must pass a strict allow-list; anything that could
    carry markup or hide text is rejected.
    """
    def test_accepts_normal_names(self):
        self.assertEqual(ud.clean_name("  Lady   Geist "), "Lady Geist")
        self.assertEqual(ud.clean_name("Hunter’s Aura"), "Hunter's Aura")

    def test_rejects_dangerous_or_odd_names(self):
        for bad in ["<script>alert(1)</script>", "x" * 41, "", None, 42,
                    "Evil\u202eName", "Zero\u200bWidth", 'Quote"Name', "a/b", "{{x}}"]:
            self.assertIsNone(ud.clean_name(bad), bad)


class TestParseHeroes(unittest.TestCase):
    """Turning the raw API hero list into our small, clean hero list."""
    def test_keeps_only_playable(self):
        heroes, _ = ud.parse_api_heroes([
            hero("Haze"),
            hero("Secret Hero", in_development=True),
            hero("Old Hero", disabled=True),
            hero("Bot Only", player_selectable=False),
            hero("hero_testhero", player_selectable=False, disabled=True),
            hero("Null Flags", disabled=None),  # the real API uses null for "not set"
        ])
        self.assertEqual([h["id"] for h in heroes], ["haze", "null_flags"])

    def test_development_state_wins_over_stale_flag(self):
        heroes, _ = ud.parse_api_heroes([
            hero("Haze", development_state="release"),
            hero("Violet", development_state="release", in_development=True),  # real API case
            hero("Upcoming", development_state="hero_labs"),
            hero("No State", in_development=True),  # falls back to the old flag
        ])
        self.assertEqual([h["id"] for h in heroes], ["haze", "violet"])

    def test_skips_malicious_and_duplicates(self):
        heroes, warnings = ud.parse_api_heroes([
            hero("Haze"), hero("Haze"), hero("<img src=x onerror=alert(1)>"), "not a dict", hero("Wraith"),
        ])
        self.assertEqual([h["id"] for h in heroes], ["haze", "wraith"])
        self.assertEqual(len(warnings), 2)

    def test_output_has_only_safe_fields(self):
        heroes, _ = ud.parse_api_heroes([hero("Haze", image="https://evil.example/x.png", extra={"a": 1})])
        self.assertEqual(heroes, [{"id": "haze", "name": "Haze"}])

    def test_accepts_wrapped_or_keyed_payloads(self):
        self.assertEqual(len(ud.parse_api_heroes({"data": [hero("Haze")]})[0]), 1)
        self.assertEqual(len(ud.parse_api_heroes({"1": hero("Haze")})[0]), 1)

    def test_empty_or_wrong_format_fails_loudly(self):
        with self.assertRaises(ud.DataError):
            ud.parse_api_heroes([])
        with self.assertRaises(ud.DataError):
            ud.parse_api_heroes("nope")
        with self.assertRaises(ud.DataError):
            ud.parse_api_heroes([hero(f"Hero {i}") for i in range(ud.MAX_HEROES + 1)])


class TestParseItems(unittest.TestCase):
    """Turning the raw API item list into our small, clean shop-item list."""
    def test_categories_tiers_and_filters(self):
        items, warnings = ud.parse_api_items([
            item("Basic Magazine"),
            item("Extra Spirit", slot="tech", tier="EModTier_1"),
            item("Extra Health", slot="vitality", tier=1),
            item("Hidden", shopable=False),
            item("Removed", disabled=True),
            item("Ability Thing", type="ability"),
            item("Weird Tier", tier=9),
            item("Weird Slot", slot="banana"),
            item("Bad Cost", cost=-5),
            item("Legendary Thing", tier=5, cost=9999),
            item("Null Disabled", disabled=None),
        ])
        got = {i["id"]: (i["cat"], i["tier"]) for i in items}
        self.assertEqual(got, {"basic_magazine": ("weapon", 1), "extra_spirit": ("spirit", 1),
                               "extra_health": ("vitality", 1), "bad_cost": ("weapon", 1),
                               "null_disabled": ("weapon", 1)})
        self.assertNotIn("cost", next(i for i in items if i["id"] == "bad_cost"))
        self.assertEqual(len(warnings), 3)  # weird tier, weird slot, tier-5 summary

    def test_boolean_is_not_a_tier(self):
        self.assertIsNone(ud._parse_tier(True))


class TestDownloadGuards(unittest.TestCase):
    """These must fail BEFORE any network access happens."""

    def test_refuses_plain_http(self):
        with self.assertRaises(ud.DataError):
            ud.fetch_json("http://api.deadlock-api.com/v1/assets/heroes")

    def test_configured_urls_are_allowed(self):
        from urllib.parse import urlsplit
        for url in (ud.HEROES_URL, ud.ITEMS_URL):
            self.assertEqual(urlsplit(url).scheme, "https")
            self.assertIn(urlsplit(url).hostname, ud.ALLOWED_HOSTS)

    def test_refuses_other_hosts(self):
        for url in ["https://evil.example.com/x.json",
                    "https://api.deadlock-api.com.evil.example/x",
                    "https://assets.deadlock-api.com/v2/heroes",  # old, retired host
                    "https://user@evil.example/x",
                    "file:///etc/passwd"]:
            with self.assertRaises(ud.DataError, msg=url):
                ud.fetch_json(url)

    def test_rejects_non_json_and_nan(self):
        with self.assertRaises(ud.DataError):
            ud._parse_untrusted_json(b"<html>", "test")
        with self.assertRaises(ud.DataError):
            ud._parse_untrusted_json(b"[NaN]", "test")
        with self.assertRaises(ud.DataError):
            ud._parse_untrusted_json(b"[" * 100000, "test")


class TestOutputSafety(unittest.TestCase):
    """The files we generate for the browser must only ever contain data."""
    def test_js_output_is_a_single_json_string(self):
        data = {"version": 1, "source": "x", "tags": {"a": "</script><script>alert(1)</script>"},
                "items": [], "heroes": []}
        js = ud.render_js(data)
        line = next(l for l in js.splitlines() if l.startswith("export default JSON.parse("))
        literal = line[len("export default JSON.parse("):-2]
        self.assertEqual(json.loads(json.loads(literal)), data)
        self.assertTrue(js.isascii())

    def test_refuses_to_write_outside_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ud.DataError):
                ud.write_atomic(Path(tmp) / "x.json", "{}")


class TestMerge(unittest.TestCase):
    """Combining API facts with hand-written data, and reporting what changed."""
    def test_reports_new_removed_and_changed(self):
        tags = {"dps": "damage"}
        manual_items = {
            "basic_magazine": {"name": "Basic Magazine", "cat": "weapon", "tier": 1, "tags": ["dps"], "desc": "d", "core": 1},
            "old_item": {"name": "Old Item", "cat": "weapon", "tier": 2, "tags": [], "desc": "", "core": 1},
        }
        manual_heroes = {"haze": {"name": "Haze", "lean": {"weapon": 60, "spirit": 10, "vitality": 30}, "tags": ["dps"]}}
        snapshot = (
            [{"id": "haze", "name": "Haze"}, {"id": "new_hero", "name": "New Hero"}],
            [{"id": "basic_magazine", "name": "Basic Magazine", "cat": "weapon", "tier": 2},
             {"id": "new_item", "name": "New Item", "cat": "spirit", "tier": 3}],
            {"fetched": "2026-11-02"},
        )
        data, report = ud.merge(tags, manual_items, manual_heroes, snapshot)
        self.assertEqual(report["heroes_missing_manual"], ["New Hero"])
        self.assertEqual(report["items_missing_manual"], ["New Item"])
        self.assertEqual(report["manual_items_not_in_game"], ["Old Item"])
        self.assertEqual(len(report["category_or_tier_changed"]), 1)
        bm = next(i for i in data["items"] if i["id"] == "basic_magazine")
        self.assertEqual((bm["tier"], bm["tags"]), (2, ["dps"]))  # game tier wins, manual tags kept
        self.assertEqual(next(h for h in data["heroes"] if h["id"] == "new_hero")["lean"], ud.DEFAULT_LEAN)


class TestSnapshot(unittest.TestCase):
    """Re-reading the cleaned snapshot that `fetch` saved."""
    def test_snapshot_round_trip(self):
        """What `fetch` writes must be readable by `build` (regression test)."""
        heroes, _ = ud.parse_api_heroes([hero("Haze")])
        items, _ = ud.parse_api_items([item("Extended Magazine")])
        self.assertEqual(ud._validate_snapshot(heroes, "heroes", 10, ud._snapshot_hero), heroes)
        self.assertEqual(ud._validate_snapshot(items, "items", 10, ud._snapshot_item), items)

    def test_tampered_snapshot_is_rejected(self):
        for bad in [[{"id": "x", "name": "<b>", "cat": "weapon", "tier": 1}],
                    [{"id": "__proto__", "name": "X", "cat": "weapon", "tier": 1}],
                    [{"id": "x", "name": "X", "cat": "weapon", "tier": 5}],
                    [], "nope"]:
            with self.assertRaises(ud.DataError):
                ud._validate_snapshot(bad, "items", 10, ud._snapshot_item)


class TestCounters(unittest.TestCase):
    """Validation of data/manual/counters.json."""
    def _load(self, data):
        """Run load_counters() against `data` written to a temporary folder,
        so the real data/manual files are never touched by tests.
        """
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "counters.json").write_text(json.dumps(data), encoding="utf-8")
            old, ud.MANUAL_DIR = ud.MANUAL_DIR, Path(tmp)
            try:
                return ud.load_counters()
            finally:
                ud.MANUAL_DIR = old

    def test_valid_counters_load(self):
        out = self._load({"flying": {"label": "Fliers", "hint": "", "items": [{"id": "knockdown", "why": "Grounds them."}]}})
        self.assertEqual(out["flying"]["items"][0]["id"], "knockdown")

    def test_bad_counters_rejected(self):
        for bad in [
            {"lasers": {"label": "X", "items": [{"id": "a", "why": "b"}]}},                     # unknown threat
            {"flying": {"label": "<b>X</b>", "items": [{"id": "a", "why": "b"}]}},              # markup in label
            {"flying": {"label": "X", "items": [{"id": "__proto__", "why": "b"}]}},             # reserved id
            {"flying": {"label": "X", "items": [{"id": "a", "why": "evil\u202etext"}]}},        # bidi trick
            {"flying": {"label": "X", "items": []}},                                            # empty list
        ]:
            with self.assertRaises(ud.DataError, msg=str(bad)):
                self._load(bad)

    def test_merge_drops_counters_not_in_game(self):
        counters = {"flying": {"label": "F", "hint": "", "items": [{"id": "knockdown", "why": "w"}, {"id": "gone", "why": "w"}]}}
        snapshot = ([{"id": "haze", "name": "Haze"}], [{"id": "knockdown", "name": "Knockdown", "cat": "spirit", "tier": 3}], {})
        data, report = ud.merge({"cc": "cc"}, {}, {}, snapshot, counters)
        self.assertEqual([c["id"] for c in data["counters"]["flying"]["items"]], ["knockdown"])
        self.assertEqual(report["counter_items_not_in_game"], ["flying: gone"])


class TestRealProjectData(unittest.TestCase):
    """Checks against the project's actual data files."""
    def test_manual_data_is_valid(self):
        tags, items, heroes = ud.load_manual()
        self.assertGreater(len(items), 50)
        self.assertGreater(len(heroes), 10)

    def test_generated_files_are_current(self):
        self.assertEqual(ud.main(["check"]), 0)


if __name__ == "__main__":
    unittest.main()
