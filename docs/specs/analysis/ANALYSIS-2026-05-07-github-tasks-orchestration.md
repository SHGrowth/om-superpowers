# Pre-Implementation Analysis: GitHub-Tasks Orchestration

**Reviewer:** Piotr (om-cto)
**Spec:** `docs/specs/2026-05-07-github-tasks-orchestration.md` @ commit `2609c8e`
**Date:** 2026-05-07
**Note:** This is a meta-spec (om-superpowers self-architecture), not an OM platform feature. The standard 13-BC-categories audit applies loosely — the *spirit* of pre-impl analysis is what matters: find the gaps before code is written.

## Executive Summary

**Verdict: NEEDS-WORK.** The architecture is sound — Issues-as-work-units, label state machine, e2e singleton, lean GitHub language. The decomposition into three phases is correct (Phase 1 = singleton, the real win; Phase 2 = parallelism, the speedup). But four critical issues block implementation, and one foundational concern (community fitness) is half-addressed. Estimated 2-3 hours of spec revision before any code can begin. After revision, Phase 1 is shippable.

The single question that should make us rethink: **does this spec actually ship if our hypothetical OM developer doesn't have `yarn test:integration:ephemeral`?** Today it doesn't — the e2e agent is hardcoded for one project's runner. That's a community-fitness blocker, not a polish item.

## Critical Issues (must fix before implementation)

### C1 — Claim protocol relies on a `422` that doesn't exist

The spec line 67:
> *GitHub returns 422 if another agent already claimed.*

`gh issue edit --add-assignee` is **additive**. A second `--add-assignee` succeeds and adds a second assignee. There is no atomic CAS in GitHub's REST API for assignees. The race scenario:

1. Agent A: `gh issue edit 42 --add-assignee A` → succeeds
2. Agent B: `gh issue edit 42 --add-assignee B` → also succeeds
3. Both A and B believe they own issue 42 → diverging work, conflicting commits, the exact failure mode v1.11.3 was supposed to prevent

**Fix shape:**
- Use a unique label per claim (`claim:<actor>-<timestamp>`) and verify-after-add via re-fetch. If multiple `claim:*` labels appear, lowest-timestamp wins, others self-evict.
- OR use `gh issue lock` semantics (only one actor can hold the lock at a time) — but that conflicts with comment-based handoff.
- OR put the claim in a single-instance label like `assigned-to:<actor>` (replace, not add). Manage via `--remove-label assigned-to:* --add-label assigned-to:<me>` then verify.

Pick one and document atomically. Until this is fixed, every multi-agent claim is racy.

### C2 — Spawning model is ambiguous

The spec describes two incompatible spawning patterns and never picks:

- **Pattern A** (lines 82-87): `nohup claude -p "/om-pr-tick" &` — spawns one process per agent slot. But `/om-pr-tick` isn't a `/loop` invocation; it's a single tick. Process exits after one iteration.
- **Pattern B** (line 94): "Agents run their respective `/loop 1m` (cron mode) tick prompts." That implies `nohup claude -p "/loop 1m /om-pr-tick" &` — long-running process internally re-invoking on cron schedule.

These are *fundamentally different processes*:

| | Pattern A (single tick) | Pattern B (`/loop 1m`) |
|---|---|---|
| Re-invocation | External shell loop or user-driven | In-process /loop primitive |
| Exit when no work | Natural (process ends) | Must call /loop stop explicitly |
| Process count | Many short-lived | N long-lived |
| Log volume | Many small files | Fewer large files |
| Crash recovery | Next tick fires fresh | Process dies, no respawn |

Pattern B can't naturally exit when the queue drains — `/loop 1m` keeps polling forever unless the agent runs `/loop stop`. Pattern A needs an external dispatcher (something has to fire the next tick). Neither is wrong; both need infrastructure the spec doesn't acknowledge.

**Fix shape:** pick Pattern A with an external `while [[ <work-remains> ]]; do ... done` shell wrapper as the dispatcher. That's Ralph-proper, matches the user's "spin by default" intent, and naturally terminates when `gh issue list --label status:ready` returns empty for N consecutive ticks. The wrapper is a 20-line bash script; document it explicitly.

### C3 — BC strategy missing for v1.11.6 → v1.12.0 transition

What happens when an OM developer running om-superpowers v1.11.6 today upgrades to v1.12.0?

Phase 1 patches `om-implement-spec` Step 8 (Verification) to enqueue `status:needs-e2e` instead of running `yarn test:integration:ephemeral` inline. If the user has not spawned an e2e singleton agent, the issue sits in `status:needs-e2e` **forever**. No tests run. No PR ever ships. The spec doesn't say what happens.

**Fix shape:** make the patch *additive*. `om-implement-spec` detects whether an e2e singleton is alive (e.g., a sentinel file `/tmp/om-e2e-singleton.pid` written by the singleton agent on boot, or a recent comment from the e2e agent on any open issue). If alive → enqueue. If not alive → fall back to inline run (current v1.11.6 behavior). v1.12.0 ships as additive: nothing breaks for users who haven't opted into the orchestration.

### C4 — Project-agnostic config layer is missing (community-fitness blocker)

The spec hardcodes:
- `yarn test:integration:ephemeral` (line 13, line 143)
- `OM_PRM_WIC_IMPORT_SECRET` (line 143)
- PRM-specific run plan paths (line 182)

These are PRM-specific. An OM developer building a payments integration package or a marketplace add-on doesn't have either. The user clarified PRM is a playground; om-superpowers must serve any OM project.

**Fix shape:** introduce `.ai/orchestration.yml` (or `.ai/orchestration.json`) per repo. Declares:

```yaml
e2e:
  command: "yarn test:integration:ephemeral"   # or whatever this project calls it
  required_env: ["OM_PRM_WIC_IMPORT_SECRET"]   # project-specific
  timeout_minutes: 15
run_plan_dir: ".ai/runs"
spec_dir: ".ai/specs"
labels:
  prefix: "status:"   # or whatever the project's label convention is
```

The e2e singleton reads this on boot. If the file doesn't exist, the singleton refuses to start with a clear error pointing at a template. Coding agents that try to enqueue without an `.ai/orchestration.yml` get a clear "this repo isn't configured for orchestration; run `om-orchestrate init`" message. Without this layer, the orchestration design is fork-fodder.

## Important Issues (should fix; can ship without but will hurt)

### I1 — Cleanup / termination conditions for spawned agents

Once spawned, when do agents exit? If using Pattern A (per C2 fix), the wrapper handles it. If Pattern B, the agents poll forever. The spec must specify:

- Coding agent: exit after N consecutive ticks (default 5, ~5 min) with no claimable work. Process slots free up.
- E2E agent: exit after N consecutive ticks with no `status:needs-e2e` AND no `status:e2e-running` work. Process exits.
- Master orchestrator: when all originally-spawned agents have exited and no new work has arrived for K minutes (default 10), declare completion.

Otherwise: process leak. Every `/om-orchestrate` invocation accumulates background processes that never die.

### I2 — Cost estimate is hand-wavy

Spec line 260: "5 agents × 30 ticks/spec × $0.50/tick ≈ $75/spec. PRM 7-spec run ≈ $500 total."

Where do "30 ticks" and "$0.50/tick" come from? PRM Spec #5's actual session had ~170 text/tool entries — that's one session, not 30 ticks. And $0.50/tick depends on cache hit rate, which depends on whether the polling preamble stays stable across ticks (it should, if /loop cron mode delivers on its caching promise; but unmeasured).

Per the existing memory rule (`feedback_baseline_before_implementation`): **baseline before doctrine.** Run a single-spec single-agent workflow under v1.11.6 with timing/cost telemetry; multiply through to estimate parallel cost. The current spec's $500 figure could be 3× off in either direction.

**Fix shape:** before Phase 2 (parallelism) ships, baseline measurement of per-tick cost on a real PRM-style spec run. Phase 1 doesn't depend on this.

### I3 — Label collision with existing `in-progress` lock

Existing `om-auto-create-pr` / `om-auto-continue-pr` / `om-auto-review-pr` use a single `in-progress` label on PRs as the lock. New design adds `status:coding`, `status:needs-e2e`, etc. on issues *and* the linked PR.

When an issue is `status:coding` and its PR is `in-progress` (set by auto-create-pr), the two labels are redundant but not contradictory. Fine.

When the auto-* skill releases its lock (clears `in-progress`) but the orchestrator still considers the PR in `status:coding` — that's a lock-state divergence. Does the orchestrator re-claim? Confused?

**Fix shape:** the orchestration design should *replace* the `in-progress` label with `status:coding` on issues, not duplicate. The auto-* trio's PR-level `in-progress` label stays for its own purposes (preventing two auto-skills from clobbering the same PR mid-flight) but the orchestration's claim signal is on the *issue*, not the PR. Document the relationship explicitly. Failing to do this means agents reading PR labels get conflicting signals.

### I4 — Secrets-in-comments rule not carried over

`om-auto-continue-pr` has a Rules entry: *"Never paste secrets, tokens, .env content, or raw credentials into PR comments or plan files."* The new agents (coding, e2e) don't carry this forward. The e2e agent in particular reads env vars and pastes test output — easy to leak `OM_PRM_WIC_IMPORT_SECRET` if tests echo it on failure.

**Fix shape:** carry the rule into the orchestration spec's "Communication style" section as a hard MUST NOT. The lean rule covers verbosity; this covers leakage. Different concerns.

## Nice-to-Have Gaps

### N1 — Webhook fallback mentioned but not designed

Line 268: "If we ever push to N=20, switch to webhook-driven instead of polling." Without even a sentence on what that looks like, this is a dangling thread. One sentence: "Webhook fallback would replace `/loop 1m` polling with a small HTTP receiver (gh webhook forward) that fires the next tick on label-change events; out of scope for v1." Done.

### N2 — Phase 3 (parallel decomposition) is the wrong priority

Phase 3 is "om-cto fans out 5 spec writers." Smallest payoff (CTO is 1-2h once per app). The v1.14.0 slot would be better spent on:

- **Phase 3-bis: GitHub Projects v2 migration** — visualization upgrade for humans, replaces label-based status with native status field, dependency field, kanban view.

That's higher utility than parallel CTO. Reorder.

### N3 — No mention of how `om-orchestrate init` would work

If an OM developer adopts om-superpowers tomorrow, what's the bootstrap experience? The spec implies `.ai/orchestration.yml` exists. How is it created? Probably an `om-orchestrate init` subcommand that:

1. Detects project shape (looks for `package.json` test scripts, existing `.ai/` dirs)
2. Writes a stub `.ai/orchestration.yml`
3. Creates the 11 status labels in the repo via `gh label create`
4. Verifies `gh auth status` and required scopes

Add a section "Bootstrap" or "Adoption" to the spec covering this. Otherwise community fitness fails at first contact.

## Answers to the Five Specific Questions

### Q1 — Generalizable beyond OM/PRM?

**Answer: not yet.** The protocol generalizes (labels, comments, polling). The implementation hardcodes PRM-specific commands and env vars. Fix C4 (`.ai/orchestration.yml`) closes this. Without C4, the spec is "ship for PRM, fork for everyone else." With C4, it's truly community-fit. C4 is non-negotiable for the user's stated goal.

### Q2 — Lock protocol interaction with auto-* trio?

**Answer: needs a reconciliation section.** See C1 (the 422 bug — the claim protocol as written is broken regardless of the auto-* trio) and I3 (label-state divergence between issue-level `status:coding` and PR-level `in-progress`). Both must be addressed in the spec text.

### Q3 — Spawning model viable?

**Answer: not as written.** The spec describes two incompatible spawning patterns and picks neither. See C2. Pick Pattern A (per-tick spawn via external bash wrapper) — it's simpler, terminates naturally, matches Ralph proper, and is what the user actually meant by "spin by default." Document the wrapper script in the spec.

### Q4 — v1.11.7 own spec or inline?

**Answer: inline.** No forensic, no separate spec needed. v1.11.5 and v1.11.6 each had a forensic spec because each was *triggered* by an incident with detailed analysis worth preserving. v1.11.7 is a codification of an already-established rule (the lean-language directive) — it's a refactor, not a forensic. Ship as: CHANGELOG entry + version bump + the 4 skill template rewrites + README v1.11.7 callout. Memory entry already saved. Same shape as the doc-and-chore commits, scoped tighter.

### Q5 — BC concerns for v1.11.6 users when Phase 1 lands?

**Answer: yes, one Critical (C3 above) and one Important (I3).** C3: without a singleton-detect-and-fallback mechanism, v1.12.0 silently breaks any user who upgrades but hasn't spawned the e2e agent. I3: label collisions with the existing `in-progress` lock on PRs are subtle and will surface as agents getting confused mid-flight. Both are fixable in the spec; both must be fixed before code.

Beyond those, no other BC concerns surface. The 13 OM-platform contract surfaces (auto-discovery files, types, function signatures, import paths, event IDs, widget spots, API URLs, DB schema, DI keys, ACL features, notification IDs, CLI commands, generated contracts) are mostly N/A — this design adds a new orchestration layer rather than modifying any existing platform surface.

## Risk Assessment

### High Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Claim protocol race (C1)** | Two agents diverge on the same issue, conflicting commits, lost work | Fix the claim primitive before any code. Single-instance label + verify-after-add. |
| **Spawning model crash recovery** | If Pattern B (long-running /loop) is chosen and the process dies, work stalls | Pick Pattern A (per-tick spawn) — natural recovery via next tick |
| **v1.11.6 → v1.12.0 silent break** | Users who upgrade without spawning e2e agent get stuck PRs | Additive patch with singleton-detect fallback |

### Medium Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Cost overrun** | Real cost 3× the $500 estimate, unpredictable budgeting for community users | Baseline measurement before Phase 2 |
| **Project-config drift** | Each adopter writes a slightly different `.ai/orchestration.yml`, divergent label vocabularies | Ship a strict schema + validation on `om-orchestrate init` |
| **Process leak** | Spawned agents poll forever, accumulating background processes | Termination conditions (I1) |

### Low Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Comment noise on long PRs** | Already noted in spec; mitigation already specified (single edited 🤖 status comment) |
| **API rate limits at high N** | Already noted; webhook fallback path acknowledged |
| **Stale singleton mid-job** | Already noted; 15min stale recovery specified |

## Remediation Plan

### Before Implementation (Must Do — blocks Phase 1 v1.12.0)

1. **Fix C1** — rewrite the claim protocol section. Specify the single-instance label + verify-after-add pattern. Provide concrete `gh` commands. ~30 min.
2. **Fix C2** — pick Pattern A. Add a "Spawning script" section with the actual bash wrapper. ~30 min.
3. **Fix C3** — add an "Adoption / BC" section explaining additive patching with singleton-detect fallback. ~20 min.
4. **Fix C4** — add `.ai/orchestration.yml` schema + a "Bootstrap" section covering `om-orchestrate init`. ~45 min.
5. **Fix I3** — add a "Lock protocol reconciliation" subsection explaining issue-level `status:coding` vs PR-level `in-progress`. ~20 min.

Total: ~2.5 hours of spec revision. After this, Phase 1 (e2e singleton + label vocabulary + om-implement-spec patch) is implementable in 1-2 days.

### During Implementation (add to spec or to skills as built)

1. **Add I1** (cleanup conditions) inline in agent contracts. ~15 min during implementation.
2. **Add I4** (secrets rule) to the Communication style section. ~5 min.
3. **Address N3** (`om-orchestrate init` UX) — likely a separate skill, design at Phase 1 implementation time.

### Post-Implementation (Follow Up)

1. **I2** — baseline measurement of per-tick cost on a real workflow. Becomes input to Phase 2 go/no-go decision.
2. **N1** — one-line webhook-fallback note added to spec.
3. **N2** — reorder Phase 3 from "parallel CTO" to "Projects v2 migration." Update README phase table.

## Recommendation

**NEEDS-WORK on the spec.** Not ready for implementation as written, but the underlying architecture is sound. ~2.5 hours of spec revision (C1-C4 + I3) closes the implementability gaps. After that, Phase 1 is shippable as v1.12.0.

The right next move is **NOT** to start coding Phase 1. The right next move is to revise the spec to address C1-C4 + I3, re-circulate, and only then begin implementation.

Piotr's question that should make us rethink: **does the existing v1.11.6 (post-PR review gate) plus a lean-language v1.11.7 actually solve the problem we're trying to solve?** v1.11.6 ensures every spec gets a real review pass. v1.11.7 will make GitHub surfaces readable. If those two together kill the two failure modes (review skipped, comments unreadable) and PRM Specs #6 + #7 ship cleanly under that combination — *the orchestration spec doesn't need to ship at all until a multi-app/multi-team scenario surfaces.*

The orchestration design earns its keep when there are 3+ apps in flight needing parallel attention. With one app (PRM playground) and a sequential developer, v1.11.6 + v1.11.7 + the existing /loop cron mode (correctly used) may be sufficient. **Ship v1.11.7, watch what happens on PRM #6 + #7, then decide whether the orchestration spec graduates from design to implementation.**

That's the conservative read. The aggressive read is "ship Phase 1 now to fix the e2e-as-yield-target wartime problem." Both reads are defensible. The user's call.

## Final note

Best code is code you didn't write. Phase 1 is ~3 days of work (skill, patch, label setup, bootstrap UX, BC fallback). v1.11.7 is ~2 hours. If v1.11.7 alone gets the project across the next 2 specs cleanly, the orchestration design can wait. If it doesn't, v1.12.0 is ready to ship the moment the spec is revised.
