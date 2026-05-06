# Per-Atomic-Commit Gates (Ralph Loop)

Shared reference loaded by `om-auto-create-pr` (step 6) and `om-auto-continue-pr` (step 4). Defines the gate sequence that **every atomic commit** must pass before it lands on the PR branch.

Source spec: `docs/specs/2026-05-06-ralph-loop-per-commit-gates.md`.

## Why this exists

The Ralph loop only works when each iteration produces a **trustworthy** commit. "Trustworthy" means: the design system is intact, behavior is tested, and the code has been reviewed. Pushing those checks to end-of-PR means a single bad commit can poison the whole branch and force a multi-step revert. Per-commit gates keep the commit history's promise — each commit is self-contained, testable, reviewed, and DS-clean.

## Atomic commit definition

One commit per Progress Step (the `- [ ]` lines in `.ai/runs/<plan>.md`). One Step = one atomic commit = one gate run. Do not bundle multiple Steps into one commit. Do not split one Step across commits unless explicitly noted in the plan.

This replaces the older "one commit per Step when meaningful, otherwise one commit per Phase" cadence. Gates are atomic-commit-scoped; per-Phase commits don't fit.

## The three gates (in this order)

| # | Gate | Tool | Always-on? | What it checks |
|---|------|------|------------|----------------|
| 1 | Design system | `om-ds-guardian` | When the diff touches frontend (see e2e applicability heuristic below) | Hardcoded colors, arbitrary text sizes, raw HTML form controls, deprecated components, missing empty/loading states |
| 2 | Tests | `yarn test` (unit) + `om-integration-tests` (e2e) | Unit: always. E2E: when applicable (see heuristic). | Unit: changed packages pass. E2E: scoped Playwright tests for touched modules pass. |
| 3 | Code review | `om-code-review` (fast subset) | Always | Security + architecture compliance. Full checklist still runs end-of-PR via `om-auto-review-pr`. |

A commit is committable only when **every applicable gate** returns clean. "Not applicable" must be logged with the matching check (see Logging shape below); silent skips are not permitted.

## E2E applicability heuristic

Run the e2e gate when the staged diff matches **any** of:

```bash
# 1. Backend page or component (.tsx/.css under modules/*/backend/)
git diff --cached --name-only | grep -E '^apps/[^/]+/src/modules/[^/]+/backend/.*\.(tsx|css)$'

# 2. Frontend or shared UI package
git diff --cached --name-only | grep -E '^(frontend|packages/ui)/'

# 3. Existing Playwright spec touched
git diff --cached --name-only | grep -E '\.spec\.(ts|tsx)$'

# 4. Component referenced by an existing Playwright spec (rename/removal case)
# Heuristic: if any *.tsx file is renamed or removed and a Playwright spec
# elsewhere imports its old path, treat as applicable.
```

If none of the four conditions match, log `e2e: not applicable — backend-only diff` (or whichever check failed) and skip gate 2's e2e half. Unit half (`yarn test`) is always run.

For e2e runs, scope to specs whose paths reference the touched modules — not the full suite. Full-suite e2e remains an end-of-PR concern handled by the existing validation gate.

## Pre-commit semantics (gate the staged index)

Gates run **on the staged diff before `git commit`**. Sequence:

```bash
# 1. Stage the work for the current Step
git add <files>

# 2. Run gates against the staged index. None has run a commit yet.
#    Each gate returns OK / FAIL / NOT-APPLICABLE.

# 3. Only on all-clean (or all-applicable-clean) → commit
git commit -m "<conventional subject>"
```

Pre-commit (rather than post-commit + revert) keeps history clean. If a gate fails after the retry budget, the failing changes stay in the index for inspection — no partial-progress commit lands.

## Retry budget (fix-forward)

Each Step gets **3 retry attempts**. Sequence on failure:

1. Read the gate's findings.
2. Fix the underlying issue (do not silence the gate or weaken the rule).
3. Re-stage. Re-run the failing gate. Earlier-passing gates do not need to re-run unless the fix changed files outside the original scope.
4. If still failing after 3 attempts → label PR `needs-human`, post a comment naming the gate + the unresolved finding, write the failure to the plan's Gate log, **stop**.

Counter persistence: store under "Gate retries" in the plan file, keyed by Step ID:

```markdown
## Gate retries

| Step | Gate | Attempts | Last error |
|------|------|----------|------------|
| 2.3 | ds | 1/3 | hardcoded `text-emerald-600` in src/app/customers/list.tsx:47 |
```

Reset to 0 when the Step finally lands green.

## Logging shape (audit trail in the plan)

Append one line per gate run under a `## Gate log` section in `.ai/runs/<plan>.md`:

```markdown
## Gate log

- 2026-05-06T14:21:33Z — Step 1.1 — ds: clean (n/a — no frontend) — unit: pass — e2e: n/a — code-review: clean → committed abc1234
- 2026-05-06T14:28:01Z — Step 1.2 — ds: fail (text-red-600 in cart.tsx:88) — retry 1/3
- 2026-05-06T14:31:14Z — Step 1.2 — ds: clean — unit: pass — e2e: clean (cart.spec.ts) — code-review: clean → committed def5678
```

The Gate log itself is part of the commit that lands the Progress checkbox flip — same commit that updates `- [ ]` to `- [x] — <sha>`. Don't make a separate commit per gate-log entry.

## Failure surface (what changes when gates fail)

| Outcome | PR label | Plan annotation | Skill exit |
|---------|----------|-----------------|------------|
| All gates clean | (no change) | Step flipped to `- [x] — <sha>`; Gate log line appended | Continue to next Step |
| Gate failed, retry < 3 | (no change) | Gate retries row updated | Loop back to fix-forward |
| Gate failed, retry budget exhausted | `needs-human` (added) | Gate retries row + Gate log final-failure line | **Stop**. Skill returns. Worktree left in inspection state (changes in index, not committed). |

Re-entry after `needs-human`: a human (or the user) clears the label and re-invokes `/auto-continue-pr <PR#>`. The skill resets the Step's retry counter to 0 and tries again. The Gate log preserves the failure history for audit.

## What this gate **does not** replace

- **Per-Phase targeted validation** (typecheck, build, i18n) in `om-auto-create-pr` step 6 sub-step 3 / `om-auto-continue-pr` step 4 sub-step 3 — keep it.
- **Full validation gate** before opening / completing the PR (`yarn build:packages`, `yarn generate`, `yarn typecheck`, `yarn test`, `yarn build:app`) — keep it.
- **End-of-PR `om-auto-review-pr` autofix pass** — keep it. It catches cross-commit interactions per-commit review can't see.

The per-commit gate is **additive**, layered before each commit. The existing layers run after.

## Invocation reference (copy-paste shapes)

### Gate 1 — DS guardian

Invoke `om-ds-guardian` against the staged diff:

```bash
git diff --cached > /tmp/staged.diff
# om-ds-guardian reads /tmp/staged.diff, returns clean | findings
```

If the diff is backend-only (no `*.tsx` / `*.css` / no `frontend/` / no `packages/ui/`), log `ds: n/a — backend-only diff` and skip.

### Gate 2a — Unit tests

Run targeted unit tests for the changed packages:

```bash
# Resolve packages from staged file paths
PKGS=$(git diff --cached --name-only | awk -F/ '/^packages\// {print $1"/"$2} /^apps\// {print $1"/"$2}' | sort -u)
for pkg in $PKGS; do
  yarn workspace "$pkg" test
done
```

If the diff has no test-bearing code (docs-only, plan-only), log `unit: n/a — no testable code changed` and skip.

### Gate 2b — E2E (if applicable)

Apply the heuristic above. When applicable, run `om-integration-tests` scoped to the touched modules:

```bash
# om-integration-tests resolves spec files from touched module paths
TOUCHED_MODULES=$(git diff --cached --name-only | grep -E '^apps/[^/]+/src/modules/[^/]+/' | awk -F/ '{print $4}' | sort -u)
# Invoke om-integration-tests with --modules "$TOUCHED_MODULES"
```

### Gate 3 — Code review (fast subset)

Invoke `om-code-review` against the staged diff in **fast mode** (security + architecture only):

```bash
git diff --cached > /tmp/staged.diff
# om-code-review reads /tmp/staged.diff with --fast flag
# Full checklist (style, naming, conventions, BC) deferred to end-of-PR auto-review-pr.
```

## When to skip the entire gate sequence (rare)

Only skip when the commit changes **nothing the gates could check**:

- The plan file itself (`.ai/runs/*.md`) and only the plan file.
- Pure docs commits under `docs/` with no executable content.
- Generated lockfiles when the only change is upstream-driven (`yarn.lock` only, no `package.json` change).

In all three cases, log a single Gate log line: `Step X.Y — gates: skipped (plan-only | docs-only | lockfile-only) → committed <sha>`.

Anything touching code, components, configs, schemas, migrations, or tests runs the full gate sequence.
