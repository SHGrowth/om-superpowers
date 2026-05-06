# Autonomous Loop Policy — `/loop` self-pace is for polling, not for queued work

**Date:** 2026-05-07
**Status:** Shipped — v1.11.5
**Owner:** Mat (CEO)
**Triggered by:** patryk-standalone forensic, session `b8267188-…` (cmux)

## What happened

A long-running autonomous session in `~/Documents/patryk-standalone/standalone-app/` (PRM Spec #5: RFP broadcast/response) was orchestrated under `om-cto` → `om-implement-spec`. Mid-run, the user told the agent to "do that in our ralph loop approach." The agent invoked the harness `/loop` skill *without an interval* — i.e., the **self-paced / dynamic** mode, which makes the agent call `ScheduleWakeup` between iterations.

`ScheduleWakeup`'s tool description provides this guidance:

> The Anthropic prompt cache has a 5-minute TTL… Don't pick 300 s — it's the worst-of-both. For idle ticks with no specific signal to watch, default to **1200–1800 s** (20–30 min).

The agent followed that default. Four wake-ups were recorded:

| Time | `delaySeconds` | Reason given |
|---|---|---|
| 22:59 | 1200 | "Active spec implementation loop … one cache miss buys a long resume window" |
| 23:11 | 1200 | "C1 ~90% done; resume in 20 min to land integration tests + C2" |
| 23:22 | 1200 | "20-min cadence per loop — next iteration starts C2" |
| 23:31 | 1500 | "25-min cadence … cache-friendly idle window keeps prompt cache warm across iterations" |

## What's wrong with this

1. **The run was never idle.** The run plan (`.ai/runs/2026-05-07-prm-spec-05-rfp-broadcast-response.md`) had a Progress checklist with C1.10, C2.x, C3a–d, C4, C5 unchecked. There was no external signal to wait for — no build, no PR review, no async event. The agent had work it could do *immediately*.
2. **The "idle ticks" default doesn't fit chained autonomous coding.** It exists for polling scenarios (long external build, PR review queue), where checking sooner has no value. Applied to queued spec work, every wake-up inserts a 20–30 min do-nothing gap per commit.
3. **The cache-warmth rationale is internally contradictory.** Prompt cache TTL is 300 s. Picking 1500 s and writing "cache-friendly idle window keeps cache warm" guarantees the opposite. The agent fabricated a justification that contradicts the tooltip's own first sentence.

Net cost: the second half of the autonomous run took ~2 hours longer than necessary, with the agent sleeping more than it coded.

## Root cause

The `/loop` skill is harness-owned — om-superpowers doesn't ship it and can't directly patch its tooltip or default delay. What om-superpowers controls is the **dispatch context** and **policy guidance** — what an agent reads when it's about to enter "autonomous Ralph mode" via om-cto, om-implement-spec, or om-auto-continue-pr.

Before v1.11.5, those skills said nothing about `/loop` mode selection. The README's "Autonomous Ralph-style runs" section recommended `/loop 5m /auto-continue-pr <PR#>` (cron mode with a 5-minute interval) but did not forbid self-pace. The agent had no policy to anchor against.

## Fix shape (v1.11.5)

Three doc layers, no enforcement code:

1. **`README.md` — "Autonomous Ralph-style runs" anti-pattern callout.** Explicit "do NOT use `/loop` self-paced for chained autonomous coding" with the cache-TTL contradiction explained. Two correct patterns documented: `/loop 5m /auto-continue-pr <PR#>` (cron mode), or a single long conversation.
2. **`skills/om-cto/references/impl-orchestrator.md` — § Autonomous loop policy.** Three-paragraph rule for orchestrated implementation runs. Same two correct patterns. Cites this forensic.
3. **`skills/om-implement-spec/SKILL.md` and `skills/om-auto-continue-pr/SKILL.md` — Rules section one-liner.** "MUST NOT call `ScheduleWakeup` between phases / iterations / checklist items. With unchecked items in the run plan, delay >270 s is an anti-pattern." Cross-references the orchestrator policy.

Plus a feedback memory in the user's auto-memory store so my future sessions don't re-derive the rule from scratch.

## Why doc-only, no hook

A `PreToolUse` hook that intercepts `ScheduleWakeup` and rejects calls with delay >270 s when an unchecked run plan exists *would* enforce the rule mechanically. It's rejected for v1.11.5 because:

- The trigger condition ("am I in the middle of a queued autonomous run?") is hard to detect reliably from a hook — it requires reading `.ai/runs/*.md` and parsing Progress checklists.
- False positives would block legitimate polling-mode wake-ups in non-spec contexts.
- The cost of one bad run (this incident) is recoverable. The cost of a flaky enforcement hook is annoying every time it misfires.

If the policy keeps getting violated despite this fix, revisit and add the hook — but layer-1 (docs) gets a fair trial first.

## Verification — how we'd know this fix is working

- Future autonomous PRM/standalone runs orchestrated via `om-cto` show *zero* `ScheduleWakeup` calls in their session jsonl when a run plan with unchecked items is open.
- Users who type "ralph loop" mid-run see the orchestrator route to `/loop 5m /auto-continue-pr <PR#>` (or stay in-conversation), not `/loop` self-pace.
- The contradictory "cache-friendly idle window keeps cache warm" rationale never appears again in `ScheduleWakeup` reason fields.
