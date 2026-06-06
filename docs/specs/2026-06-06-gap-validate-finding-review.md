# Review findings — `bin/gap-validate-finding` + `gap-analysis-batch.md` (v1.18.0)

**Date:** 2026-06-06
**Status:** Review findings for the uncommitted v1.18.0 work. **#1 and #2 block merge.** #3–#6 are fix-soon / measure / polish.
**For:** the implementer session working in this repo. This brief is self-contained — every finding has a runnable repro and a runnable acceptance check. **Do not** rewrite the gate's architecture; the core is verified-good (below). Fix only what's listed.
**Reviewer loop:** after you fix #1–#2 and the gate's self-tests pass, the change gets a round-2 review (the reviewer re-runs the gate, doesn't read the diff). Leave the repros in place so they can be re-run.

## What is already verified-good — do NOT "fix" these

Confirmed by running the gate against the live `gh` API and 6 crafted blocks:

- `gh search code` exits **0 / empty stdout** on zero results → the `❌ Missing` grounding path is correct as written. Do not add a nonzero-on-no-match workaround.
- Grounding re-run **catches the TagsInput trap live**: a `❌ Missing` whose query returns hits → `exit 1`, genuine re-run. Keep this.
- Form checks (T-shirt, bare %, persona, missing effort), `⚠️ Unclear` bypass, vendored-`✅` re-grounding, live-`✅` shape-trust — all behave to spec on bash 3.2. Keep.

## Findings

### #1 — [BLOCKER] Verdict misparse on incidental keywords

The verdict `case` (gate ~line 75) substring-matches `*Missing*` / `*Implemented*` / `*Partial*`, `❌`-first. A **positive** verdict line that merely contains the word "Missing" is classified as `missing`.

Repro (run from repo root):
```bash
printf '%s\n' '- **Verdict**: ✅ Implemented (no fields Missing)
- **Grounding query**: `modules`
- **Grounding source**: live
- **Effort**: 0' | bin/gap-validate-finding REPRO1
```
**Now:** reports `❌ Missing contradicted … exit 1` — a **correct `✅` is false-rejected**, because the line contains "Missing" and `modules` returns live hits. (With a no-hit query it silently mis-logs as `missing grounded` instead — same root cause.)
**Acceptance:** the block above writes (`exit 0`, logged as `implemented`). The emoji is authoritative; fall back to the verdict *word* only when it is the leading token of the verdict value, not a substring anywhere in the line.

### #2 — [BLOCKER] Degenerate grounding query self-confirms a `❌` (the S012 "right invariant" failure)

The gate checks *query ↔ verdict agreement* — a proxy a subagent satisfies by naming a strawman query unrelated to the story. This is the failure class recorded as `feedback_text_channel_does_not_bind` N=17 / S012 (a structural gate green on a proxy while silent on the goal).

Repro:
```bash
printf '%s\n' '- **Verdict**: ❌ Missing
- **Grounding query**: `zzqxnonexistentmodule12345`
- **Grounding source**: live
- **Effort**: 4' | bin/gap-validate-finding REPRO2
```
**Now:** `GATE PASS … missing grounded` — the gate confirmed an absence verdict against a query guaranteed to miss, with no tie to the story.
**Acceptance (orchestrator-side, no network):** the `❌` grounding query must be structurally non-degenerate — it must reference a noun drawn from the story title / acceptance criteria, **or** the orchestrator derives its own domain-noun query for `❌` rather than only re-running the subagent's. A `❌` citing a query that shares no token with the story is rejected (`exit 1` / `needs-review`). The reference currently defers this to "v2" (`gap-analysis-batch.md` §"What the gate does NOT do", hole 2) — S012 says that's too late for the `❌` path. Decide where the story-token check lives (gate needs the story passed in, or the orchestrator pre-checks before calling the gate) and wire it.

### #3 — [Low] Permanent `gh` failure looks like RETRY-LATER; leading-`-` query parsed as a flag

Repro:
```bash
printf '%s\n' '- **Verdict**: ❌ Missing
- **Grounding query**: `--bogus-flag-xyz`
- **Grounding source**: live
- **Effort**: 2' | bin/gap-validate-finding REPRO3
```
**Now:** `unknown flag` → `exit 2` (same as rate-limit) → orchestrator re-queues forever; the "give up if repeated" rule is reference prose with no counter.
**Acceptance:** query passed after `--` (or leading-`-` rejected in the form layer); a permanent `gh` failure returns a path the orchestrator marks `needs-review`, distinct from the transient rate-limit re-queue.

### #4 — [Low, operational] Fuzzy code-search inflates false `❌` contradictions

GitHub code search is token-fuzzy; a correct `❌` whose term appears in a comment/doc/unrelated package returns hits → forced `needs-review`. Fails safe, but inflates re-dispatch cost at engagement scale. **Not a code change yet** — instrument the `needs-review` rate on the first real run; if high, tighten grounding queries toward `modules/<x>` path-shape (ties to #2).

### #5 — [Low, inherited from I018/`claude-validated`] Coarse form checks

`%`-without-fraction is block-global (any `N/M` anywhere whitelists any `%` anywhere); the `~[0-9]` hedge branch is partly dead (`\b~5` after a space won't match). Fix here only if `bin/claude-validated` is touched too — keep the two in lockstep.

### #6 — [Note] Rate-limit serialization is prose, not structural

The gate's 2.5s sleep can't prevent parallel invocation; serialization is the reference's "validate sequentially" instruction. Fails safe (parallel → secondary limiter → `exit 2` → re-queue, never a bad write). **Pick one and make it true:** add `flock` + min-interval to the gate (structural, matches the rest), **or** state in `gap-analysis-batch.md` that serialization is prose-bound-because-fail-safe. Right now the reference implies a discipline the script doesn't enforce.

## Definition of done

1. `REPRO1` writes (`exit 0`, `implemented`); `REPRO2` is rejected (`exit 1` / `needs-review`); `REPRO3` resolves to `needs-review`, not an infinite re-queue.
2. The verified-good behaviors above still pass (re-run the original 6-block check — `⚠️ Unclear` bypass, vendored-`✅` re-ground, live-`✅` shape-trust, T-shirt/%/persona form rejects).
3. #6 resolved one way or the other (lock or documented).
4. Leave this file in place; the round-2 reviewer re-runs REPRO1–3 + the 6-block check against the patched gate.
