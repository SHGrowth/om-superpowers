# Gap Analysis — Batch Mode

Multi-document engagement scoping. Turns a *folder* of client materials
(transcripts, spec docs, requirement dumps) into an evidence-backed Epic/Story
tree where every story carries a `gh search code`-grounded verdict and an
atomic-commit effort, then derives a summary + prioritized backlog.

**This is om-cto's fourth mode, not a separate skill.** Advisory mode answers a
*single* question interactively and statelessly. Batch mode is the same gap
analysis at engagement scale: a directory in → a persisted, resumable backlog
out. It inherits Advisory's currency (atomic commits), its Output Contract, and
its source-of-evidence rule — folding it in here, rather than shipping a
top-level `gap-analysis` skill, is deliberate (om-superpowers surface-budget
rule; the v1.16.0 `om-orchestrate` deletion is the precedent). Source spec:
`agents-master/improvements/I019.md`.

## When this mode applies

- A *directory of client docs* (or several pasted documents) → **batch mode** (this file).
- A *single capability question* ("does OM do X?") → **Advisory** (`references/advisory.md`), unchanged.

If the user points at one folder and asks "what would we build on top of OM,"
that's batch mode.

## Why the whole pipeline lives in om-cto, not a PM handoff

The intake → Epic/Story-tree half *looks* like `om-product-manager` territory.
It isn't: PM turns vague intent into well-formed stories with success criteria
and makes **no claim about the platform**. This tree is *subordinate to the
verdict* — it exists only as the addressing scheme for "does OM already provide
this," and every node carries an atomic-commit effort under this mode's gate.
The currency, the Output Contract, and the live-search source rule are
gap-analysis invariants; fold the tree-building out to PM and you fork those
three invariants across a skill boundary. So the tree is built here. (Clean
handoffs still hold in both directions: a PM story tree can be *handed in* as
intake docs; this backlog can feed PM for refinement.)

---

## Three phases, and why `/clear` between 1 and 2

The phases have different cognitive shapes:

- **Phase 1 — Scoping** is *input-heavy*: loads transcripts/specs (tens of thousands of tokens) → a slim structured MD.
- **Phase 2 — Verification** is *codebase-heavy*: walks OM via parallel subagents + live `gh search code`. Carrying phase 1's raw inputs into phase 2 wastes context better spent on grounding.
- **Phase 3 — Synthesis** reads only the now-filled MD → derived artifacts.

Between phase 1 and phase 2 the user runs `/clear` so phase 2 starts clean with
only the structured MD. Phases 2 and 3 share context.

The MD's `status: pending | done | needs-review` per story is what makes the run
**resumable**: an interrupted phase 2 resumes by re-invoking — done stories are
skipped, no flags needed.

---

## Phase 1 — Scoping (docs → Epic/Story tree)

**Goal**: read all client materials, produce one structured MD with an Epic →
Story tree where every story has an empty gap-analysis placeholder.

1. **Project slug** — kebab-case (`dentalos`, `bolttech-b2b`). Drives output filenames. Ask if unclear.
2. **Read all inputs.** Walk the input directory. Track each fact's source — you cite it in the story `**Source**` field.
3. **Extract requirements** across inputs: explicit feature requests, pain points in transcripts, integrations, compliance/multi-tenancy/GDPR/audit needs, reporting.
4. **Group into Epics** (4–10). A coherent area of value. Not one giant epic, not fifty tiny ones.
5. **Break each Epic into Stories** small enough for a single subagent to verify in one pass (1–3 acceptance criteria, one bounded capability). User/role perspective where possible.
6. **Suggest priority and dependencies.** P0 (blocking foundation), P1 (core), P2 (nice-to-have). Dependencies reference Story IDs.
7. **Write the MD** to `./gap-analysis/<project>.md` (create the dir). Template below.
8. **Hand off to phase 2** with the exact-shape instruction:

   > Phase 1 complete. Saved `<full-path>`.
   > Next: run `/clear`, then re-invoke om-cto with: `Run gap-analysis batch phase 2 on <full-path>`

**Do not start phase 2 in the same session.**

### MD tree template

```markdown
---
project: <slug>
generated: <ISO date>
sources:
  - inputs/requirements.md
  - inputs/transcript-2026-04-15.txt
phase: 1-scoped
total_epics: <n>
total_stories: <n>
---

# Gap Analysis — <Project Display Name>

> This file is the source of truth across all three phases.

## Epic 1: <Epic name>
**Goal**: <one-sentence outcome>
**Business value**: <why it matters to the client>

### Story 1.1: <Story title>
- **Description**: <as a [role], I want [capability], so that [outcome]>
- **Acceptance criteria**:
  - [ ] <criterion>
- **Source**: <source-file>:<location or quote>
- **Priority**: P0 | P1 | P2
- **Dependencies**: <story IDs, or "none">
- **Status**: pending

#### Gap analysis
<!-- Filled by phase 2 via the gate. Do not edit by hand. -->
- **Verdict**: ⚪ not yet analyzed
- **Evidence**:
- **Grounding query**:
- **Grounding source**:
- **Gaps**:
- **Effort**:
- **Suggested implementation path**:
- **Investigated**:
```

Story IDs (`Epic.Story`, e.g. `2.4`) are stable — never renumber after phase 1.

---

## Phase 2 — Verification (the gated batch loop)

**Goal**: for every `status: pending` story, dispatch a read-only subagent to
investigate OM, then **gate** its findings before writing them into the MD.

### Architecture: orchestrator + subagents + gate

- **You are the orchestrator.** You parse the MD, batch subagent calls, **validate each returned block through `bin/gap-validate-finding`**, edit the MD, update statuses. You do **not** explore the codebase yourself.
- **Subagents** are read-only investigators (one story each). They do not edit files. They propose the grounding query; they do not need to be trusted on whether they ran it.
- **The gate** (`bin/gap-validate-finding`) is the structural surface *outside each subagent's model loop*. This is load-bearing: prose rules in a subagent prompt do **not** bind it against fabrication-shape failures (`feedback_text_channel_does_not_bind`, N=17 incl. S012; I018). `bin/claude-validated` cannot help here — it wraps `claude -p`, and these subagents run via the **Task tool**, which it does not intercept. So the binding check lives in the orchestrator's parse step. The gate must verify the *goal* (a story-grounded verdict), not a *proxy* (a query↔verdict agreement a strawman query satisfies) — S012 is exactly a gate that went green on the proxy; the `--story` token guard re-ties it to the goal.

### Steps

1. **Load the MD.** Parse frontmatter + tree. List `status: pending` stories. Set `phase: 2-verifying`.
2. **Batch pending stories into groups of 5.** Per batch:
   1. **Dispatch 5 subagents in parallel** (single message, Task tool) using the prompt template below.
   2. **Wait for all 5.** Each returns a findings block in the schema below.
   3. **Gate each block — sequentially — before writing.** Write the story's
      title + acceptance criteria to a temp file and pass it with `--story`;
      the gate **requires** it to ground a `❌ Missing` (without the story it
      cannot prove the grounding query references the story rather than a
      strawman — the S012 self-confirm guard):
      ```bash
      printf '%s\n' "$STORY_TITLE_AND_CRITERIA" > /tmp/story-<id>.txt
      printf '%s\n' "$BLOCK" | bin/gap-validate-finding <story-id> --story /tmp/story-<id>.txt
      ```
      - **exit 0 (PASS)** → write the block into the story's `#### Gap analysis`, flip `**Status**` to `done`, set `**Investigated**`.
      - **exit 1 (FAIL)** → do **not** write. Mark `**Status**: needs-review`, re-dispatch *once* with a reinforced prompt (echo the gate's stderr reason into the retry). If it fails again, leave `needs-review` and move on. (Covers: malformed block, verdict contradicted by the live re-run, a degenerate/strawman grounding query, or a *permanent* `gh` query error.)
      - **exit 2 (RETRY-LATER)** → `gh` was *transiently* rate-limited/unreachable. Do **not** write, do **not** treat as a verdict failure. Re-queue the story and continue; retry the queued ones after the batch.
   4. **Report progress** briefly: "Batch N/M complete. X/Y done, Z needs-review."
3. **Resumability**: a story already `done` at phase-2 start is skipped.
4. **When all stories are `done` or `needs-review`**: set `phase: 3-synthesizing`, flow into Phase 3.

### Validate sequentially — this *is* the rate-limit discipline

Process the 5 returned blocks through the gate **one at a time**, not in
parallel. The gate re-runs a live `gh search code` for every `❌ Missing` and
every non-`live` `✅/🟡`; GitHub's code-search endpoint allows ~30 req/min plus
an undocumented secondary "abuse" limiter that trips on bursty parallel access.
Sequential validation + the gate's built-in `~2.5s` post-query sleep keeps a
40-story engagement under that ceiling. The orchestrator is the **single
canonical caller** of `gh` for grounding — subagents only *name* the query, they
do not race the API. If the gate returns RETRY-LATER repeatedly, surface the
deferral with `log`/a note and mark affected stories `needs-review` rather than
silently sampling (no silent caps).

**Serialization is prose-bound here, and that is safe by construction** (review
#6). The gate's `sleep` paces *its own* calls but cannot stop a caller from
invoking the gate in parallel — and `flock` is not portable on the target shell
(macOS bash 3.2 ships no `flock`). We do **not** add a lock, because the failure
mode is fail-safe: parallel invocations that trip GitHub's secondary limiter
return `exit 2` (RETRY-LATER) and get re-queued — they **never** produce a bad
write or a false verdict. The worst case is wasted latency, not a wrong backlog.
So: run the gate sequentially as instructed above; if you don't, the gate
degrades to slower-but-correct, not incorrect.

### Currency: atomic commits, never T-shirt sizes

Effort is an **atomic-commit score 0–5** per `references/atomic-commits.md` —
the same unit Advisory uses, so the two modes' backlogs reconcile. Do **not**
use XS/S/M/L/XL; the gate rejects T-shirt sizes (`bin/gap-validate-finding`
check 4). Score meaning (full table in `atomic-commits.md`):

| Score | Meaning |
|---|---|
| 0 | Platform does it, zero commits |
| 1 | 1 commit: config/seed only |
| 2 | 1–2 commits: small gap |
| 3 | 2–3 commits: medium gap |
| 4 | 3–5 commits: large gap |
| 5 | 5+ commits or external dependency |

**FLAG** any story whose plan touches `core-module` or `official-module` scope —
those carry upstream dependencies (see `atomic-commits.md` §Scope column).

### Source-of-evidence rule (verdict-conditional)

Vendored `om-reference/` is a daily snapshot — it answers "what did OM look like
at sync time," not "what does OM provide." om-superpowers has already shipped a
wrong verdict from exactly this (the TagsInput drift bug, README v1.13.0). Batch
mode fans out unattended across dozens of stories, so snapshot staleness
compounds silently. Therefore:

| Use | Allowed source |
|---|---|
| **Orientation** — which module/guide to look at, where a feature would live | vendored `om-reference/` (fast, offline) |
| **`✅`/`🟡` verdict evidence** | live `gh search code` hit. A vendored read MAY accompany it but MUST NOT be the sole citation. |
| **`❌ Missing` verdict evidence** | live `gh search code … → no match`, **always**. Never "the snapshot didn't mention it." |
| **Auditing the local app's own code** (impl phase) | local Glob/Grep, only here |

In one line: **vendored `om-reference/` is for orientation, never for a
verdict.** The gate enforces this — it re-runs the cited query rather than
trusting the subagent's pasted result.

### What the gate does NOT do (scope it honestly — I019 §88)

The gate is an asymmetric **falsifier**, not a truth oracle. Record these as
known gaps; do not let a green run read as "everything verified":

1. **Falsifier, not confirmer.** A `gh` hit proves a string matches — not that the matched code satisfies the story's acceptance criteria. A `✅` pointing at real-but-irrelevant code passes clean. Semantic judgment stays with the subagent. *This is the one residual semantic hole.*
2. **Strawman queries — CLOSED on the `❌` path (review #2 / S012).** The gate re-runs *the query the subagent named*, so a fully-unrelated strawman (`zzqxnonexistentmodule12345`) could once self-confirm a false `❌`. It no longer can: the gate requires the story (`--story`) and rejects any `❌` whose grounding query shares no noun token with the story title/criteria. The same token check guards vendored positives when the story is supplied. What it still can't catch is a *plausibly-related-but-too-narrow* query (`"AppointmentScheduler"` when the module is `modules/scheduling`) — the token overlaps, so it passes, but the search misses. That narrower case collapses into hole 1 (semantic relevance), not a free strawman.
3. **Live-`✅` accepted on shape-trust.** The gate does **not** re-run a `✅` that declares `**Grounding source**: live` — doing so on every positive would blow the rate budget. A fabricated live-`✅` is uncaught here; it surfaces downstream when implementation can't find the thing. Deliberate cost tradeoff: a false `❌` (tell the client to build what exists) is caught structurally; a false live-`✅` is not.

Net: the gate **falsifies ungrounded/stale `❌ Missing`, strawman-grounded `❌`,
and empty/vendored-only `✅/🟡`** — the TagsInput failure mode plus the S012
self-confirm, the two that matter. What remains is semantic relevance
(hole 1) and live-`✅` shape-trust (hole 3).

### Subagent prompt template

Fill `<STORY_ID>`, `<STORY_BLOCK>`, `<REPO_ROOT>`.

```
You are a read-only Open Mercato codebase investigator in a gap analysis.
Verify whether ONE story is already implemented in Open Mercato, and return a
structured findings block. Investigate only the story below.

## The story
<STORY_BLOCK>

## How to investigate
1. Orient with vendored om-reference/AGENTS.md (Task Router) — for routing ONLY, never as verdict evidence.
2. For the verdict, search live: `gh search code "<term>" --repo open-mercato/open-mercato`. Only merged code counts.
3. Try domain nouns and synonyms. Check entities (src/entities/), API routes, UI.
4. Name the single most decisive `gh search code` query in **Grounding query** — the orchestrator will RE-RUN it to verify your verdict, so pick the query that actually decides the verdict (e.g. the module path `modules/<x>`), not a vague term.

Tools: Read, Glob, Grep, Bash (read-only, including `gh search code`). Never Edit/Write.

## Output — return ONLY this block, no preamble:
- **Verdict**: ✅ Implemented | 🟡 Partial | ❌ Missing | ⚠️ Unclear
- **Evidence**:
  - `<repo-relative path>`: <role it plays>
- **Grounding query**: `<the single gh search code query string that decides this verdict>`
- **Grounding source**: live | vendored   <!-- 'live' = you ran gh and saw the result; 'vendored' = snapshot only -->
- **Gaps**:
  - <specific missing piece, or "none">
- **Effort**: <atomic-commit score 0–5; see scoring — NEVER XS/S/M/L/XL>
- **Suggested implementation path**:
  - <steps referencing existing OM patterns>

Rules the orchestrator's gate enforces (your block is rejected and re-dispatched if violated):
- Effort is a number 0–5, never a T-shirt size.
- No percentage without an N/M fraction. No hedges (approximately/around/roughly). No persona names.
- A ❌ Missing MUST name the `gh search code` query that returned no match; the orchestrator re-runs it.
```

---

## Phase 3 — Synthesis (MD → summary + backlog)

**Goal**: read the now-complete MD, produce two derived artifacts. Never
re-derive findings from memory — always read the MD (this is what keeps it
audit-friendly).

1. **Aggregate stats**: total epics/stories, verdict distribution, atomic-commit effort totals by verdict and by priority, stories blocked by dependencies, and `needs-review` count (surfaced separately, never folded into the distribution).
2. **Produce `<project>-summary.md`** (template below).
3. **Produce `<project>-backlog.md`** (template below) — a sequenced delivery plan; every item links its Story ID(s).
4. **Update source MD frontmatter**: `phase: complete`.
5. **Present all three files.** Phase 3 is idempotent — re-run freely.

### Summary template — `<project>-summary.md`

```markdown
---
project: <slug>
generated: <ISO date>
source: <project>.md
type: gap-analysis-summary
---

# Gap Analysis Summary — <Project Display Name>

## Executive summary
<2–3 plain-language paragraphs: how much already exists, the biggest risks, the recommended start. May be read by a client stakeholder.>

## Coverage at a glance
| Verdict | Stories | Share | Effort (commits) |
|---|---|---|---|
| ✅ Implemented | <n> | <n>/<total> | — |
| 🟡 Partial | <n> | <n>/<total> | <sum> |
| ❌ Missing | <n> | <n>/<total> | <sum> |
| ⚠️ Unclear | <n> | <n>/<total> | <sum> |

<!-- Share is N/total, never a bare percentage — the Output Contract forbids it. -->
**Total effort to close gaps**: <sum> atomic commits across <k> stories.

## Coverage by epic
| Epic | Implemented | Partial | Missing | Unclear | Notes |
|---|---|---|---|---|---|
| 1. <name> | <n> | <n> | <n> | <n> | <one-line takeaway> |

## Top 5 risks
Each cites a Story ID, why it matters, and what unblocks it. Prefer P0+❌, then P0+🟡, then P1+❌ with downstream deps. Don't pad to 5.

## Recommended sequencing
<Which epics first and why, referencing dependencies. Concrete.>

## What's already strong
<What OM already covers — frames the engagement positively.>

## Open questions
<⚠️ Unclear stories and scoping assumptions the client should confirm.>
```

### Backlog template — `<project>-backlog.md`

```markdown
---
project: <slug>
generated: <ISO date>
source: <project>.md
type: gap-analysis-backlog
---

# Implementation Backlog — <Project Display Name>

> Grouped into delivery phases by dependency order. Effort tags are atomic-commit scores (same currency as the gap analysis).

## Phase A — Foundation
<Stories whose absence blocks everything else. Usually P0 + ❌/🟡, no deps.>

### A.1 — <Item title>
- **Stories**: <1.1, 1.2>
- **Verdict context**: ❌ Missing
- **Effort**: <0–5>
- **Scope flag**: <app | core-module | official-module | n8n | external — FLAG core/official>
- **Dependencies**: none
- **Outcome**: <what's true when done>
- **Implementation notes**: <condensed suggested path from the MD>

## Phase B — Core capabilities
## Phase C — Differentiation & polish
## Out of scope (for now)
## Cross-cutting work

## Effort roll-up
| Phase | Items | Effort (commits) |
|---|---|---|
| A — Foundation | <n> | <sum> |
| B — Core | <n> | <sum> |
| C — Polish | <n> | <sum> |
| Cross-cutting | <n> | <sum> |
| **Total** | **<n>** | **<sum>** |
```

### Cross-check before writing files

- Every Story ID in the backlog exists in the source MD.
- Stories across phases (A+B+C+out-of-scope) = total minus `✅ Implemented` needing no work.
- Effort totals in the summary equal the backlog roll-up.

If anything doesn't add up, surface it as a footnote — never silently fudge.

---

## Acceptance tests (the ship bar — I019 §Verification)

The mode ships only if these pass. Tests 3 and 4 are binding.

1. **Path/load**: invoke batch mode on a 2-doc fixture; an MD tree is produced (no missing-file errors — everything is in this one reference).
2. **Currency**: `grep -E 'XS|XL'` over the backlog → zero hits. Effort is 0–5.
3. **Gate (binding), two halves**:
   - *Form*: a `❌ Missing` block with no citation → gate refuses to write (`needs-review`).
   - *Grounding*: a `❌ Missing` block carrying a well-formed query **for a capability that exists live** → the orchestrator re-runs the query, sees hits, rejects the block. (Verified: `bin/gap-validate-finding` returns exit 1 here. This is *not* a shape check — the query is actually re-run.)
4. **Staleness (the binding one) — assert on the persisted MD, not the subagent.** Seed a story for a capability present live but absent from the vendored snapshot. The subagent *may* return `❌ Missing` from the stale snapshot — testing its raw return tests the wrong layer. Assert on the **MD after orchestrator processing**: the gate's re-run contradicts the `no match`, so the story ends `needs-review`/re-dispatched, **never a persisted `❌ Missing`**.
5. **Currency-regression**: `grep -E '\b(XS|XL|[0-9]+%)\b'` over backlog + summary → zero hits.

If tests 3 and 4 pass, the stale-absence hole closes (the TagsInput failure mode)
and the false-`❌` half of the I018 fabrication hole closes with it. The
fabrication hole is **narrowed, not sealed** — the three residual holes above
(live-`✅`, narrow-query, semantic-relevance) are accepted tradeoffs, recorded
here so they are not mistaken for closed.

## Cross-refs

- `bin/gap-validate-finding` — the gate this mode is wired to.
- `references/atomic-commits.md` — the inherited currency + scope flags.
- `references/advisory.md` §Output Contract — the contract this gate enforces structurally; line 99's vendored-`OR` is tightened here (candidate I020 would tighten advisory itself).
- `bin/claude-validated` (I018) — the source of the five form checks (relocated into the orchestrator parse step, not the `claude -p` wrapper).
