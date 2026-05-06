# Test Coverage at Commit Time

**Date:** 2026-05-06
**Status:** Approved for v1.10.0
**Owner:** Mat (CEO)
**Supersedes:** `2026-05-06-ralph-loop-per-commit-gates.md` (yanked v1.9.0)
**Evidence:** `2026-05-06-ralph-loop-baseline.md` (N=5 PRs, 15 code-bearing commits)

## TLDR

Every code-bearing commit produced by `om-auto-create-pr` / `om-auto-continue-pr` must include test files in the same commit. Mechanical check on the staged index. ~10 lines of inline shell, no Skill invocation, no shared reference.

This is the only gate the baseline justified. Three other gates from the original spec (DS, e2e, code-review fast subset) are deferred or dropped.

## Why this gate (and only this gate)

Baseline of the 5 most recent `om-auto-create-pr` PRs:

| Gate proposed in v1.9.0 | Baseline finding | Verdict |
|---|---|---|
| Tests-with-code | 0/15 commits land tests in same commit as code | **Ship.** Real, measurable, mechanical to fix. |
| Design system | 0 DS issues caught at end-of-PR across 5 PRs (sample is backend-biased) | Defer to v1.11+ pending UI-heavy sample. |
| E2E with UI | 0/2 same-commit landing rate, but N=2 doesn't clear any decision threshold | Defer to v1.11+ pending 5 more UI PRs. |
| Code review (fast subset) | ~3/15 mechanical issues catchable; 100% already auto-fixed by existing end-of-PR pass | Drop. Marginal value over `om-auto-review-pr`. |

The full baseline lives in `docs/specs/2026-05-06-ralph-loop-baseline.md`.

## What ships in v1.10.0

**One inline shell block** in two places:

- `skills/om-auto-create-pr/SKILL.md` — step 6, before `git commit`
- `skills/om-auto-continue-pr/SKILL.md` — step 4, before `git commit`

The block:

```bash
# Gate A — tests-with-code (mechanical, on the staged index)
STAGED=$(git diff --cached --name-only)
CODE=$(echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$' | grep -v -E '(__tests__|\.test\.|\.spec\.)' || true)
TESTS=$(echo "$STAGED" | grep -E '(__tests__|\.test\.|\.spec\.)' || true)
if [ -n "$CODE" ] && [ -z "$TESTS" ]; then
  echo "BLOCK: code change without tests in the same commit:"
  echo "$CODE"
  echo "Add or update tests in this Step's commit, or split work so the test lands with the code."
  exit 1
fi
```

That's it. ~10 lines. No Skill invocation, no `_shared/` directory, no shared reference, no retry budget, no Gate log, no plan annotations.

## Failure handling

If the check fails:

1. The agent stops the commit attempt.
2. Adds tests for the staged code change.
3. Re-stages the diff.
4. Re-runs the check.
5. Commits when clean.

If after a reasonable attempt the agent cannot produce tests (e.g. the change is genuinely test-immune like a `package.json` version bump or a config-file edit), the agent should split the staged work: stage only the test-immune files for one commit, leave the test-bearing files for the next Step where tests can be added.

There is no `needs-human` label, no retry counter, no audit log. If the gate keeps failing, the agent stops and surfaces the situation in the PR body or a comment for the human to resolve. This is intentional: a single mechanical gate doesn't need the heavy machinery v1.9.0's spec proposed.

## What counts as "code"

Code = file matches `\.(ts|tsx|js|jsx|mjs|cjs)$` AND path does not contain `__tests__/` AND filename does not match `\.test\.` or `\.spec\.`.

What's exempt (not "code" for this gate):

- All test files (`__tests__/*`, `*.test.ts`, `*.spec.ts`, etc.)
- All non-source-code files: `*.md`, `*.json`, `*.yaml`, `*.yml`, `*.txt`, `*.toml`, `*.lock`, `Dockerfile`, etc.
- Configuration: `package.json`, `tsconfig.json`, etc. (covered by the file-extension filter — they are JSON, not source code)
- Generated files (these end in `.generated.ts` and live under `.mercato/generated/` — they match the regex but the agent should not be modifying them in any commit anyway)
- Plan files (`.ai/runs/*.md` — covered by `.md` exemption)

The grep is deliberately permissive on edge cases. Any false-block (a `.ts` file the agent legitimately can't test) is resolved by the agent splitting the commit. False-allow (a code change that slips through) is the cost of the simple shape; the existing end-of-PR gate still catches missing tests at that layer.

## What is NOT in v1.10.0 (and why)

| Tempting addition | Why not |
|---|---|
| DS gate | Baseline showed 0 DS issues caught at end-of-PR. No evidence of a gap. |
| E2E gate | N=2 from baseline. No threshold cleared. Re-baseline next release. |
| Code-review fast subset | 100% of catches already covered by end-of-PR `om-auto-review-pr` autofix pass. |
| `_shared/per-commit-gates.md` | One gate doesn't justify a shared reference. If a third caller appears, extract then. |
| Retry budget / `needs-human` label / Gate log | Heavy machinery for a single mechanical check. The check is fast and the failure mode is "split the commit." No counter needed. |
| `om-auto-loop-pr` wrapper (was Phase 2) | Same disposition as v1.9.0 spec — defer. The gate is the prerequisite; the loop wrapper is independent and can be reconsidered later. |

## Verification (numbers, not vibes)

After v1.10.0 ships, the same baseline is re-run on the next 5 `om-auto-create-pr` PRs:

- **Success criterion:** same-commit test landing rate ≥ 90% (vs. 0% baseline).
- **Failure criterion:** rate < 50% — the gate is being silently bypassed or the agent is splitting commits in ways that defeat the purpose. Investigate root cause before adding more gates.

Re-baseline UI PRs (Gate 2b candidate) and end-of-PR DS findings (Gate 1 candidate) at the same time. If either gap holds with N=5, ship in v1.11.0.

## Files touched (v1.10.0)

| File | Change | Approx |
|---|---|---|
| `skills/om-auto-create-pr/SKILL.md` | Insert ~10-line shell block in step 6 before commit | +14 / −1 |
| `skills/om-auto-continue-pr/SKILL.md` | Insert ~10-line shell block in step 4 before commit | +14 / −1 |
| `.claude-plugin/plugin.json` | 1.9.1 → 1.10.0 | +1 / −1 |
| `.claude-plugin/marketplace.json` | 1.9.1 → 1.10.0 | +1 / −1 |
| `CHANGELOG.md` | New entry | ~20 lines |

No new files, no shared reference, no skill scaffolding.

## Why this is the right size

v1.9.0's spec proposed: 4 gates × 3 OQs × retry/plan-annotation/needs-human machinery × shared reference × re-fork from upstream. Result: a 350-line spec, a 200-line shared reference, fictional invocation contracts, and a yank.

v1.10.0's spec is one mechanical check, two insertion points, no scaffolding. It will either work or fail loudly; either way the next baseline tells us.
