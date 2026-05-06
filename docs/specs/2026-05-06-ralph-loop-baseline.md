# Ralph Loop — Baseline (Verification Step 1)

**Date:** 2026-05-06
**Status:** Complete
**Owner:** Mat (CEO)
**Source spec:** `docs/specs/2026-05-06-ralph-loop-per-commit-gates.md` Verification step 1
**Why this exists:** v1.9.0 shipped without running this baseline first; v1.9.0 was yanked. This document is the data the spec required before any per-commit gate work re-ships.

## Sample

5 most recent PRs created by `om-auto-create-pr` in `open-mercato/open-mercato` (located via `gh search prs --repo open-mercato/open-mercato 'Tracking plan:'`):

| PR | Title | State | Total commits | Code-bearing commits |
|---|---|---|---|---|
| #1818 | fix(configs): invalidate Turbopack module graph on structural cache purge | open | 9 | 2 |
| #1817 | docs(create-app): standalone AGENTS — encryption maps + mandatory module mechanisms | merge-queue | 25 | 3 (mixed with docs) |
| #1814 | docs(release): draft 0.6.0 changelog | merged | 5 | 0 (docs-only) |
| #1800 | feat(crud): centralize custom-fields response normalization | open | 1 (squashed) | 1 |
| #1796 | feat(workflows): code-based workflow definitions (carry-forward of #1738) | qa | 24 | ~10 |

**Usable for per-commit analysis:** PRs #1818, #1817, #1796. (#1814 is docs-only; #1800 is squashed and doesn't expose per-commit cadence.)

**Code-bearing commit total in sample:** 15.

## Numbers per gate

### Gate 2a — Unit tests with code

| Metric | Count | Rate |
|---|---|---|
| Code-bearing commits where unit tests landed in the same commit | 0 / 15 | **0%** |
| Code-bearing commits where unit tests landed in a separate later commit | 6 / 15 | 40% |
| Code-bearing commits where no unit tests landed at all (docs/dev-script changes) | 9 / 15 | 60% |

**Finding:** The current process has zero enforcement of "tests land with code." Every code commit in the sample either deferred tests to a separate commit or skipped them entirely.

### Gate 1 — Design system

| Metric | Count |
|---|---|
| End-of-PR auto-review-pr findings flagging DS violations across the 5 PRs | **0** |
| Diff-level "no hardcoded status colors / no arbitrary text sizes" checks: clean | All 5 |

**Finding:** The sample is biased toward backend / configs / docs / workflow registry work — minimal UI surface. Cannot distinguish "DS is already clean" from "no UI to gate." DS gate value is **undetermined** in this sample.

### Gate 2b — E2E (UI) tests

| Metric | Count |
|---|---|
| Code-bearing commits with UI implications (touched `*.tsx`, frontend, or `packages/ui`) | ~2 / 15 (PR #1796 workflow editor) |
| Of those, e2e Playwright spec landed in same commit | 0 / 2 |
| Of those, e2e Playwright spec landed in a separate later commit | 2 / 2 |

**Finding:** Same pattern as unit tests but with smaller n. Two UI commits in PR #1796 had their e2e specs land in `c20add2` and `c73bb60` — separate later commits.

### Gate 3 — Code review (fast subset, security + architecture)

End-of-PR `om-auto-review-pr` autofix activity:

| PR | Autofix passes | Critical/High | Medium | Low (informational) |
|---|---|---|---|---|
| #1818 | 0 (clean first pass) | 0 | 0 | 2 |
| #1817 | ≥2 (peer-review fixes 080584f, 824a041, 1afb9aa) | 0 | 3 mechanical (signature, heading, import path) | — |
| #1814 | 0 | 0 | 0 | 0 |
| #1800 | 0 | 0 | 0 | 0 |
| #1796 | ≥2 | 0 | ~6 domain bugs (soft-deleted overrides, customize/reset flow, registry registration, regex bug) | 5 |

**Findings caught at end-of-PR that a per-commit code-review fast subset *might* have caught earlier:**

| PR | Issue | Per-commit catch likelihood |
|---|---|---|
| #1817 | findWithDecryption signature wrong arg count (5 vs 4) | High — mechanical type error |
| #1817 | Import path wrong (`lib/crud/factory` vs actual) | High — grep/static check |
| #1817 | Heading inconsistency in docs | Low — structural |
| #1796 | Regex doesn't allow dots in workflowId | Medium — needs domain context |
| #1796 | Soft-deleted overrides not handled | Low — domain bug, needs integration test |
| #1796 | Customize/reset flow broken | Low — domain bug, integration only |
| #1796 | Registry registration missing in standalone template | None — only live CI caught it |

**Estimated per-commit fast-review catch rate: ~3 / 15 commits (20%)** — and all 3 were already caught at end-of-PR by the existing `om-auto-review-pr` autofix pass within 1–2 iterations.

## What end-of-PR caught that per-commit would have caught earlier

| Gate | Catches end-of-PR misses earlier | Catches new failure modes |
|---|---|---|
| Gate 2a (unit tests with code) | n/a — end-of-PR doesn't enforce this | **Yes** — closes the 0% same-commit gap |
| Gate 1 (DS) | 0 (no DS issues caught at end-of-PR in sample) | Undetermined (sample is backend-heavy) |
| Gate 2b (e2e) | 0 (no e2e gaps caught at end-of-PR in sample) | **Yes** for UI commits — closes the 0/2 same-commit gap |
| Gate 3 (code-review fast) | ~3 mechanical issues out of ~9 found, all already auto-fixed | Marginal — duplicates existing pass |

## Decision implications

The original spec proposed three gates. The data says they have very different value:

**Strong signal — ship in v1.10.0:**
- **Gate 2a (unit tests with code).** 0% of code commits in the sample land tests in the same commit. This is a real, measurable, unambiguous gap. Mechanical to enforce: if `git diff --cached` contains non-test code, it must also contain a test file.

**Weak signal in this sample — ship narrowly with measurement:**
- **Gate 2b (e2e with UI).** 0/2 same-commit rate but tiny sample. Worth shipping for UI commits with explicit measurement: if first 5 UI-bearing PRs after v1.10.0 still show <50% same-commit e2e landing, gate is valuable.

**Undetermined — defer to v1.11+:**
- **Gate 1 (DS).** Sample lacks UI-heavy PRs. Defer until 5 UI-heavy PRs are in the next sample.
- **Gate 3 (code-review fast subset).** ~20% catch rate, and all caught items were already auto-fixed by end-of-PR pass. Marginal value over existing infrastructure. Ship only if a future sample shows end-of-PR is missing things per-commit would catch — current data doesn't.

## Recommended scope for v1.10.0

Narrowed from original spec's three-gate proposal to **one strong gate + one measured gate**:

1. **Gate A (was 2a) — Tests-with-code (always).** Mechanical check: code change requires test in same commit. Lightweight inline shell check, no Skill invocation needed.
2. **Gate B (was 2b) — E2E-when-applicable (UI commits only).** Path-glob heuristic from original spec. Measurement-tracked.
3. **Defer:** original Gate 1 (DS), original Gate 3 (code-review fast).

This is honest scope: it ships the change the data justifies, defers the changes the data doesn't, and avoids re-introducing v1.9.0's biggest mistake — building gates with no evidence they solve a real failure.

## Files for cross-reference

- v1.9.0 spec (rolled back): `docs/specs/2026-05-06-ralph-loop-per-commit-gates.md` (file present in v1.9.0 commit `e5691c2`, removed in revert `67e1c78`)
- v1.9.0 yank notice: GitHub Release `v1.9.0`, body
- v1.9.1 rollback: commit `7f4b661`
