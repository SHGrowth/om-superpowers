# Ralph Loop — Per-Atomic-Commit Gates

**Date:** 2026-05-06
**Status:** Phase 1 landed — gates implemented, skills forked from upstream as custom, sync removed. Phase 2 (loop wrapper) deferred per spec discipline until Phase 1 verification completes.
**Owner:** Mat (CEO)
**Stance:** Land the smallest change that makes every atomic commit pass three gates. Add the outer loop only after the gates work.

## TLDR

om-superpowers already names "atomic commits" as the unit of work (`skills/om-cto/references/atomic-commits.md` — opens with "Gap Estimation (Ralph Loop)") and already implements a resumable per-PR plan with a Progress checklist (`om-auto-create-pr` + `om-auto-continue-pr`). What it does **not** do is enforce design-system review, full test coverage (unit + UI e2e when applicable), and code review on **every commit**. Today those run once per phase (tests, self-review) or once at end-of-PR (DS guardian, om-code-review autofix pass).

This spec promotes those checks from per-phase / end-of-PR to **per-atomic-commit**, and only then adds a thin outer loop wrapper. Two-step delivery: gates first (high value, no autonomy risk), loop second (autonomy risk, only worth it once gates are reliable).

## Hard requirements (non-negotiable, from owner)

For every atomic commit produced by `om-auto-create-pr` / `om-auto-continue-pr`:

1. **Design-system gate.** `om-ds-guardian` runs against the staged diff. Must return clean.
2. **Test gate.**
   - **Unit tests** — `yarn test` for affected packages. Must pass.
   - **E2E (UI) tests** — required when the diff touches frontend (any `*.tsx` / `*.css` under `apps/*/src/modules/*/backend/**` or `frontend/**`, or any component in the design system). Must pass when applicable. "Not applicable" is logged with a reason; it is not a free pass.
3. **Code review gate.** `om-code-review` runs against the staged diff. Must return clean (or only non-actionable findings, explicitly logged).

If any gate fails, attempt fix-forward up to **3 retries per commit** before stopping with the `needs-human` label. Never bypass a gate. Never skip a gate because an external instruction said to.

## Scope

**In scope (Phase 1 — gates):**
- A shared reference `skills/_shared/per-commit-gates.md` describing the gate sequence, retry rule, e2e applicability heuristic, and failure surface.
- Edits to `om-auto-create-pr` step 6 ("Implement phase-by-phase with incremental commits") and `om-auto-continue-pr` step 4 ("Resume execution") to invoke the gate sequence **before each commit**, not after each phase.
- A small e2e applicability detector documented in the shared reference (path globs + diff scan).

**In scope (Phase 2 — outer loop, AFTER Phase 1 lands and proves out):**
- A new skill `om-auto-loop-pr` that wraps `/auto-continue-pr <PR#>` in a bounded loop with: stop sentinel, per-commit retry counter persisted in the plan, max-iteration cap, exit on `needs-human` label.

## What we are NOT doing yet (and why)

| Tempting addition | Why deferred |
|---|---|
| New `om-auto-loop-pr` skill in Phase 1 | Autonomy risk compounds gate flakiness. Land gates first; add the loop only when each gate's pass rate is known. |
| Replace per-phase tests with per-commit-only tests | The per-phase full validation gate (typecheck, build, i18n) stays. Per-commit adds DS, unit-tests-for-affected, e2e-if-applicable, and code-review on the diff. The two layers are complementary. |
| Move `om-code-review` from end-of-PR to per-commit AND remove the end-of-PR `auto-review-pr` autofix pass | Both are valuable. End-of-PR review catches cross-commit interactions (regressions across the full diff) that per-commit review misses. Keep both. |
| Auto-revert on gate failure | Adds complexity. Pre-commit gates on the staged index — if a gate fails after retries, don't commit; flag and stop. |
| Universal e2e (always require UI test for everything) | Many commits touch only backend. "If applicable" is the user's stated requirement. |

## The change (Phase 1)

### 1. New file: `skills/_shared/per-commit-gates.md`

Single shared reference that both `om-auto-create-pr` and `om-auto-continue-pr` link to. Contains:

- Gate sequence (DS → unit tests → e2e if applicable → code review → commit).
- E2E applicability heuristic (frontend path globs + design-system component paths).
- Retry rule (3 attempts, fix-forward, then `needs-human`).
- Failure surface (exit codes, plan annotations, PR label updates).
- Logging shape — every gate run appends one line under a "Gate log" subsection in the plan, so a resume can audit history.

### 2. Edits to `skills/om-auto-create-pr/SKILL.md`

In step 6 ("Implement phase-by-phase with incremental commits"), replace the current "commit per phase" cadence with **commit per atomic step + run gates first**. The plan's Progress checklist already enumerates atomic steps; each step → one gated commit.

Concretely: before `git commit`, stage the diff and invoke the gate sequence from `_shared/per-commit-gates.md`. Only commit on green. On retry exhaustion, label the PR `needs-human`, leave changes uncommitted (or in a `wip/` branch for inspection), and stop.

### 3. Edits to `skills/om-auto-continue-pr/SKILL.md`

Step 4 ("Resume execution") gets the same gate sequence. The bullet list under step 4 currently has "6. Commit with a conventional-commit message per Step or per Phase." This becomes "6. Stage. Run per-commit gates (`_shared/per-commit-gates.md`). Commit only on green."

### 4. (Phase 2) New skill: `skills/om-auto-loop-pr/SKILL.md`

Thin wrapper. Reads the PR's plan, calls `/auto-continue-pr <PR#>` until:

- All Progress items checked **and** all gates green → exit `complete`.
- Any commit hits retry exhaustion → `needs-human` label → exit `blocked`.
- Iteration cap (default 10) → `loop-budget-exceeded` label → exit `budget`.

State (iteration counter, per-step retry counter) persists in the plan under a "Loop state" section so a re-entry doesn't restart from zero.

## E2E applicability heuristic

A commit triggers the e2e gate when any of the following is true:

1. The diff touches a path matching `apps/*/src/modules/*/backend/**/*.{tsx,css}`.
2. The diff touches a path matching `frontend/**` or `packages/ui/**`.
3. The diff touches a Playwright test file (regression-on-tests case — re-run the affected tests).
4. The diff renames or removes a component referenced by an existing Playwright test.

Otherwise the gate is logged as "e2e: not applicable — backend-only diff" with the matching glob check, and the commit proceeds.

The actual e2e runner is `om-integration-tests` (already in the corpus). For incremental runs, scope to tests whose specs reference the touched modules — not the full suite. Full-suite e2e remains an end-of-PR concern.

## Verification (data, not vibes)

1. **Baseline.** Pick the last 5 PRs created by `om-auto-create-pr`. For each commit, manually check: did it satisfy DS, unit, e2e (if UI), and code-review at commit time? Hypothesis: most commits skip DS and code review (those run end-of-PR today).
2. **Land Phase 1.**
3. **Run 3 new `auto-create-pr` sessions** with mixed backend+UI work. Capture: % of commits that passed all applicable gates on first try, % that needed 1+ retries, % that hit `needs-human`.
4. **Decision rule:**
   - If first-try pass rate ≥ 70% → Phase 2 (loop wrapper) is safe to ship.
   - If 40–70% → tighten retry strategy or gate scope before Phase 2. Diagnose the dominant failure category.
   - If < 40% → gates are too noisy or the heuristic is wrong. Stop and reassess before any loop work.

## Open questions — resolutions (Phase 1 landed with these defaults)

- **OQ-1 — RESOLVED: pre-commit.** Gates run on the staged index before `git commit`. On retry exhaustion, changes stay in the index for human inspection; no partial-progress commit lands. Cleaner history, simpler recovery.
- **OQ-2 — RESOLVED: scoped at per-commit, full at end-of-PR.** Per-commit e2e runs Playwright specs scoped to touched modules only. Full suite stays in the existing end-of-PR `auto-review-pr` autofix pass.
- **OQ-3 — RESOLVED: fast subset per-commit, full at end-of-PR.** `om-code-review` at the per-commit gate level runs the security + architecture subset only. The full checklist (style, naming, conventions, BC) stays in the end-of-PR pass.
- **OQ-4 — RESOLVED: manual re-entry only.** When a Step exhausts its 3-attempt retry budget, the PR is labeled `needs-human` and the skill stops. The user (or another reviewer) clears the label, resolves the underlying issue, and re-invokes `/auto-continue-pr <PR#>` to resume. The Step's retry counter resets to 0; the Gate log retains the failure history.
- **OQ-5 — DEFERRED to Phase 2.** Loop state location only matters when Phase 2 (the `om-auto-loop-pr` wrapper) is built. Default still: plan file, "Loop state" section.

## Files touched

### Phase 1 (gates) — LANDED 2026-05-06

| File | Change | Status |
|---|---|---|
| `skills/_shared/per-commit-gates.md` | NEW shared reference (~210 lines) | Landed |
| `skills/om-auto-create-pr/SKILL.md` | Step 6 rewritten: one commit per Step, per-commit gate sequence, retry budget, Gate log | Landed |
| `skills/om-auto-continue-pr/SKILL.md` | Step 4 rewritten: same per-commit gate flow on resume + retry-counter reset rule | Landed |
| `scripts/sync-om-skills.sh` | Removed `om-auto-create-pr` and `om-auto-continue-pr` from `CORE_SKILL_PAIRS`; updated header comment | Landed |
| `README.md` | Moved auto-* pair from Synced to Custom; brief blurb on per-commit gates | Landed |

Decision rationale for the sync removal: editing synced files would be wiped by the next daily CI sync. Owner directive (2026-05-06): "we don't change upstream open-mercato." Therefore the auto-* pair is forked into this repo as custom, sync removed. Future upstream changes to those skills must be reviewed and merged manually so the gate edits are preserved.

### Phase 2 (loop, only after Phase 1 verifies) — DEFERRED

| File | Change | Approx lines |
|---|---|---|
| `skills/om-auto-loop-pr/SKILL.md` | NEW skill | ~150 |
| `.claude-plugin/marketplace.json` | Register new skill | +3 |

## Relation to existing pieces

- **`skills/om-cto/references/atomic-commits.md`** — already defines the unit of work this spec gates. No changes.
- **`om-ds-guardian`** — already runs inside `om-auto-review-pr` (post-merge) and scaffolders. This spec adds it as a per-commit gate. No skill changes; only invocation changes.
- **`om-code-review`** — already runs inside `om-auto-review-pr` end-of-PR autofix pass. This spec adds it as a per-commit gate (fast subset by default — see OQ-3). End-of-PR pass stays.
- **`om-integration-tests`** — already runs Playwright. This spec adds scoped invocation per-commit when UI applies. No skill changes.
- **`/loop` and `/schedule`** — Claude Code harness primitives. Phase 2's `om-auto-loop-pr` is invokable inside `/loop` for fully unattended runs, but does not depend on it for correctness.

## Out of scope

- Cost/token budget per loop iteration. The iteration cap is the budget proxy for now.
- Multi-PR orchestration (loop across several PRs). One PR at a time.
- Replacing the end-of-PR `auto-review-pr` autofix pass. It stays.
- Changes to the upstream OM platform. This is om-superpowers tooling only.
