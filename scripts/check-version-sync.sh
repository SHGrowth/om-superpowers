#!/usr/bin/env bash
# check-version-sync.sh — assert the plugin version and skill count are stated
# consistently across every file that advertises them.
#
# Canonical version: .claude-plugin/plugin.json — the Claude Code plugin manifest,
# and the file the sync script's marker (scripts/sync-om-skills.sh) and the
# session-start hook already read. marketplace.json and package.json MUST match it.
# Canonical skill count: the number of skills/<name>/SKILL.md files. The README and
# all three manifest descriptions MUST state that number.
#
# Why this exists: manual `chore(release):` commits historically bumped only the
# two .claude-plugin manifests and left package.json behind (it sat at 1.8.0 while
# the plugin shipped 1.20.0, and the description still claimed "18 user-facing
# skills" after the 1.16.0 demotion to 11). Nothing caught the drift between
# releases — and the sync workflow used to derive its auto-bump from that stale
# package.json. This guard catches it: run before a release commit, and in CI on
# every push/PR.
#
# Exit 0 = consistent. Exit 1 = drift, with each mismatch named.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
note() { echo "  x $1"; fail=1; }

# Read a "version" string the same way scripts/sync-om-skills.sh does — no jq
# dependency, so this runs locally as well as in CI. Each of the three JSON files
# has exactly one "version" key, so the first match is the right one.
ver() { grep -E '^[[:space:]]*"version"' "$1" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'; }

CANON=$(ver .claude-plugin/plugin.json)
echo "Canonical version (.claude-plugin/plugin.json): $CANON"

MP=$(ver .claude-plugin/marketplace.json)
[ "$MP" = "$CANON" ] || note "marketplace.json version is $MP, expected $CANON"

PKG=$(ver package.json)
[ "$PKG" = "$CANON" ] || note "package.json version is $PKG, expected $CANON"

# Real skill count = top-level dirs under skills/ that hold a SKILL.md.
N=$(find skills -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')
echo "Skill count (skills/*/SKILL.md): $N"

for f in package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json README.md; do
  grep -q "${N} user-facing skill" "$f" || note "$f does not state \"${N} user-facing skill\""
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "Version/skill-count drift. Fix: set every version field to $CANON and every"
  echo "skill-count phrase to \"${N} user-facing skills\", then re-run this script."
  echo "(Canonical version lives in .claude-plugin/plugin.json.)"
  exit 1
fi

echo "OK — versions and skill count are consistent."
