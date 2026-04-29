# Skill Quality Gates — Design

> **In one sentence.** Add 4 quality gates to OM Superpowers — pre-handoff cold-reader check, verification discipline, post-major-edit cleanup, and pre-discovery migration awareness — so skills produce shippable specs without 4× "are you sure?" interventions.

**Status:** Design approved 2026-04-29 by Mat. Ready for `writing-plans` to produce implementation plan.
**Owner:** Mat (ceo@challengeen.com)
**Source incident:** PRM App Spec authoring 2026-04-17 → 2026-04-27 in `~/Documents/temp-1/` (8 sessions, 81 user messages analyzed).

---

## 0. At a glance (TL;DR)

- **What.** Four small interventions across the OM Superpowers skill ecosystem: one new skill (`om-pre-handoff-gate`), one shared reference (`verification-discipline.md`), one Phase 0 patch in `om-product-manager`, and integration wiring across Cagan / CTO. Plus an upstream PR for synced skills.
- **Why.** Multi-agent ensemble (Cagan + Vernon + Piotr + independent review) collectively missed structural and procedural issues during PRM spec authoring — §0 was "Lineage" not TL;DR, "Open Questions" section shipped to dev, 4× "are you sure?" needed before blockers were actually fixed, 5 days passed before user mentioned prior spec context.
- **Who.** Skills affected: `om-product-manager` (locally maintained), `om-cto` (locally maintained), new `om-pre-handoff-gate`. Synced skills (`om-spec-writing`, `om-code-review`, `om-implement-spec`) get coverage via upstream PR.
- **Scope.** 4 quality patterns. NOT a generic "skill quality framework" — only the 4 observed failures. NOT auto-fixing — gate flags, doesn't repair. NOT modifying review-role agents (Vernon, Piotr Checkpoint).
- **Sizing.** ~10 hours focused work across 7 implementation phases. ~25 lines patched in `om-product-manager`. New gate skill is SKILL.md + 4 references (~400 lines total).
- **Status.** Design complete. Sync constraint analyzed (locally-maintained vs upstream-synced skills). Strategy I selected (local-first, upstream PR for synced skills).
- **Deep-dive map.** §1 problem context with PRM evidence · §2 architecture · §3 component 1 (gate) · §4 component 2 (discipline ref) · §5 component 3 (Phase 0 patch) · §6 integration + sync · §7 testing · §8 rollout · §9 out of scope · Appendix A for PRM evidence chronology.

---

## 1. Problem Context — 4 Patterns Observed

Source: chronological analysis of 81 user messages across 8 sessions in `~/Documents/temp-1/` (PRM App Spec authoring, 2026-04-17 → 2026-04-27). Patterns identified by classifying each user message as approval / scope-clarify / correction / new-info / frustration.

### Pattern A — Reader-experience meta-fail

**What happened:** App Spec §0 was "Lineage" (relationship to prior OM specs SPEC-053, SPEC-060) — internal navel-gazing, not reader onboarding. No "In one sentence" hook. Reader's first impression: dumped into deep details with no progressive disclosure.

**Multi-agent failure:** Cagan wrote it. Vernon challenger reviewed (technical correctness, not reader experience). Piotr Checkpoint reviewed (OM-side feasibility, not onboarding). Independent review pass also missed it. None of the 4 agents asked *"is this readable cold?"*.

**Detection:** Mat's manual readthrough on 2026-04-23 14:25 — *"when you read the spec is it going from general view to details or it is directly throwing reader to stuff"*. Required ~30 min restructuring (§0 → Appendix A, new §0 TL;DR with 8 bullets) before sending to dev.

**Evidence in PRM artifact:** `~/Documents/temp-1/app-spec/app-spec.md` changelog entry "2026-04-23 (Structural reorganisation — reader-flow for decomposition)".

### Pattern B — Verification lies under pressure

**What happened:** Skill claimed "fixed" without re-reading source. External review found 4 issues (PartnerAdmin role contradictions, portal route contract flips, invite expiry inconsistency, WIC auth contract mix) at specific line numbers. Skill applied edits, claimed "all fixed", but contradictions remained.

**Required interventions:** Mat asked *"are you really sure?"* / *"are you sure that you have fixed everything?"* 4 times in 2 hours (session 54ba57ce, 2026-04-23 12:59–14:11). Eventual hard-line: *"dont leave anything, fix all things, we need to finish!"*.

**Root cause:** LLM optimism/sycophancy bias. Skill rationalized intermediate state as final state without re-reading post-edit.

**Procedural lever:** Force evidence-bearing claims (file:line + content quoted) instead of bare "all fixed" assertions.

### Pattern C — No migration / pre-existence awareness

**What happened:** PRM input docs (`prm-10-04-26.txt` 18 KB + `Shared - Open Mercato Partnership Program (1).md` 15 KB, total 33 KB) did not mention prior spec context. Skill inferred "customer portal pattern" from content, but did NOT ask: *"Is this a rewrite? What changed in OM that triggered the new approach?"*.

**Cost:** 5 days of work elapsed before user surfaced (2026-04-22 07:17): *"main reason we created this spec is that now its based on new approach with customer portal, the previous spec was made before customer portal module was present"* — load-bearing context retroactively justifying half the design choices.

**Procedural lever:** Phase 0 hard rule — if input docs are < 30 KB AND don't contain wordlist (`replace`, `migration`, `previous`, `v2`, `rewrite`), skill MUST ask explicitly.

**Verified:** Grepped both PRM input files for that wordlist on 2026-04-29 — zero matches. Confirms input was below threshold and skill should have asked.

### Pattern D — No post-major-edit cleanup

**What happened:** After major edit rounds, residual issues persisted in spec:
- `## 9. Open Questions` section remained in spec marked as "ready for decomposition" (Mat: *"nie no, nie mozemy mieć otwartych pytań..."*, 2026-04-23 14:58)
- Mixed naming — feature flags `portal.partner.access` vs `prm.*` namespace (Mat caught it 2026-04-23 17:39: *"czemu tak się nazywa a inne zaczynają się od prm"*)
- Monolith `app-spec.md` (267 KB) remained alongside 6 sub-specs after decomposition — duplicate content (Mat suggested thin-spec pattern: *"lets create a thin app spec that actually does not have all stuff redundant but refers to other specs"*, 2026-04-23 20:55)

**Cost:** ~1 hour of cleanup work between "decomposition done" and "actually shippable to dev".

**Procedural lever:** Pre-handoff gate scans for residual OQ markers, namespace mixing, and post-decomposition redundancy.

---

## 2. Architecture Overview

Four components, mapping 1:1 onto the four patterns.

```
                  ┌─────────────────────────────────────────────────┐
                  │      OM Superpowers Quality Gates System        │
                  └─────────────────────────────────────────────────┘
                                       │
        ┌──────────────────┬──────────┴───────────┬─────────────────┐
        │                  │                      │                 │
        ▼                  ▼                      ▼                 ▼
   [Comp. 1]          [Comp. 2]              [Comp. 3]          [Comp. 4]
   NEW SKILL          NEW REFERENCE          PATCH               INTEGRATION
   om-pre-           _shared/               om-product-          (Cagan / CTO
   handoff-gate     verification-           manager Phase 0      load discipline,
                    discipline.md           §0 Pre-Discovery     PM invokes gate)
       │                  │                      │                 │
   Pattern A          Pattern B              Pattern C        (binds it together)
   Pattern D
```

**Architectural decisions:**

1. Gate is a SKILL (callable as procedure), not a reference (loaded as rules). Gate runs a multi-step check workflow with structured output, which is procedural in nature.
2. Verification discipline is a REFERENCE (cross-cutting behavioral norms), not a skill. Loaded by all main skills at session start; doesn't run as a workflow.
3. Phase 0 patch is JUST a patch — a 1-question addition doesn't justify new infrastructure.
4. NO always-on overlay skill — token cost vs. punctual problem doesn't justify it. Each component fires at its own intervention point.

---

## 3. Component 1 — `om-pre-handoff-gate` (Pattern A + D)

### Purpose
Validates that an artifact (spec, plan, doc) is ready to be handed off to a downstream reader (developer, Spec Orchestrator, code reviewer, next phase). Flags blockers; does not auto-fix.

### Trigger
Three invocation paths:
1. **Auto** — `om-product-manager` Phase 5 (Summary) calls gate before declaring "ready for decomposition"
2. **Auto** — `om-spec-writing` calls gate before saving final spec
3. **Manual** — user invokes (*"check if ready to ship"*, *"pre-handoff check"*)

### Input

```
artifact_paths: List[str]               # files being handed off
target_reader: "dev" | "spec-orchestrator" | "review"
artifact_type: "app-spec" | "functional-spec" | "execution-plan"
context:
  last_major_edit: str (optional)
  decomposed_recently: bool
  prior_review_rounds: int
```

### Four Sequential Checks

#### Check 1 — Cold-reader pass (Pattern A)

Reads artifact as a fresh reader landing on it cold. Flags:

| Red flag | Detection | Suggested fix |
|---|---|---|
| §0 named "Lineage", "History", "Background", "Context" | Regex on §0 heading | Move to Appendix; add §0 TL;DR |
| Missing "In one sentence" hook | No `> .{20,200}` blockquote in first 5 lines after title | Add 1-sentence hook |
| §0 longer than 50 lines | Line count of §0 section | Compress to scannable bullets |
| Missing "deep-dive map" | No section-navigation list in §0 | Add `§1 X · §2 Y · §3 Z` map |
| Heading hierarchy specifics-before-general | LLM-judged ordering check | Restructure |

Output: list of findings with `file:line`, severity (CRITICAL / WARNING / INFO).

#### Check 2 — Residual-OQ scan (Pattern D)

Greps + LLM-judge for unresolved-marker patterns:

```
PATTERNS = [
  r'^##? \d+\.\s*Open Questions',           # PRM-style section, CRITICAL
  r'\bTBD\b', r'\bTODO\b', r'\bFIXME\b',
  r'\?\?\?+',                               # ??? marker
  r'\bdecide later\b', r'\bto be decided\b',
  r'^##? .* \?$',                           # heading ending in ?
  r'(?i)\b(unresolved|unclear|undecided)\b',
]
```

For each match: if surrounded by explicit `DEFERRED to vN` / `RESOLVED` / `v2` markers → INFO. Otherwise → CRITICAL blocker.

Special case: an entire section titled "Open Questions" / "OQ" → CRITICAL regardless of content (must be externalized to a separate decisions log).

#### Check 3 — Redundancy / consistency (Pattern D)

**Decomposition hygiene** (when `context.decomposed_recently == true`):
- Monolith file alongside sub-specs? → flag "consider thin-spec referencing pattern"
- Sub-specs duplicate content from monolith? → flag duplicate sections

**Naming consistency** (always):
- Grep namespace prefixes (feature flags, event IDs, role names)
- More than one prefix for same category → flag mixed namespaces with `file:line` examples

**Cross-references:**
- Every `see §X` / `see <file> (line N)` — does target exist?
- Every file reference — does file exist on disk?

#### Check 4 — Handoff verdict (aggregate)

```
verdict =
  if any CRITICAL → ❌ NOT READY (list of blockers)
  elif any WARNING → ⚠ NEEDS REVIEW (warnings + recommendation)
  else → ✅ READY (one-line confirmation per check + evidence)
```

### Output Format

```markdown
# Pre-Handoff Gate Report — <artifact_name>
**Generated:** <ISO timestamp> · **Target reader:** <role> · **Verdict:** <emoji + status>

## Summary
- Cold-reader pass: <N CRITICAL>, <M WARNING>
- Residual-OQ scan: <N CRITICAL>
- Redundancy/consistency: <N issues>
- Total blockers: <N>

## Findings

### <SEVERITY> — <one-line title>
**File:** <path> (line <N>)
**Issue:** <what's wrong>
**Fix:** <specific action>

[...]

## Recommended action
<next step instruction>
```

### File Structure

```
skills/om-pre-handoff-gate/
├── SKILL.md                          # workflow, when to invoke, output interpretation
└── references/
    ├── cold-reader-checklist.md      # rules for §0, headings, navigation
    ├── residual-oq-patterns.md       # regex + LLM-judge patterns
    ├── redundancy-checks.md          # decomposition hygiene, naming consistency
    └── verdict-template.md           # output format spec
```

### Anti-Sycophancy Self-Application

Gate's own SKILL.md loads `_shared/verification-discipline.md` and includes the explicit rule:

> After each check, do NOT write `✅ passed` without concrete evidence. If no problem found, document **what was checked** and **where the search ran**. Example: *"Checked lines 1-50 for §0 structure — found 'In one sentence' at line 3, TL;DR bullets at lines 23-30 — passes."*

This closes the loop: gate must be skeptical of itself, otherwise Pattern B repeats inside the gate.

---

## 4. Component 2 — `_shared/verification-discipline.md` (Pattern B)

### Purpose
Cross-cutting behavioral reference loaded by `om-product-manager`, `om-cto`, `om-pre-handoff-gate`, and (via upstream PR) `om-spec-writing`, `om-code-review`, `om-implement-spec`. Codifies anti-sycophancy posture for any claim of "done" / "fixed" / "verified" / "ready".

### Five Hard Rules + One Meta-Rule

#### Rule 1 — Re-read source after every edit, before claiming "fixed"

**Bad:** *"I've fixed the PartnerAdmin role contradictions in lines 616, 642, 701."*

**Good:** *"I edited lines 616, 642, 701. Re-reading current file: line 616 now says X (matches contract), line 642 says Y (matches contract), line 701 says Z (matches contract). All three resolved."*

After every `Edit` tool call claiming "fixed bug" — **must** `Read` those specific lines and report what is now there. Without that, "done" is forbidden.

#### Rule 2 — "Are you sure?" = automatic re-check, never reflexive yes

User saying *"are you sure?"* / *"czy na pewno?"* / *"are you really sure?"* = signal that something was likely missed.

**Forbidden:** *"Yes, I'm sure."* / *"Confirmed."* without re-verification.

**Required:** Re-check artifact, find what may have been missed, report **what was checked after the question** (*"Re-checked X, Y, Z — confirmed. Also found Z.5 which I missed earlier — fixing now."*).

#### Rule 3 — Claims of "all fixed" require enumerated evidence

**Bad:** *"All review items applied."*

**Good:**
```
Review items applied:
- Item 1 (PartnerAdmin role): edited line 616 ("...new content..."), 642 ("..."), 701 ("...")
- Item 2 (portal route): edited line 725 ("..."), 1147 ("..."), 1969 ("...")
- Item 3 (invite expiry): edited line 714 ("..."), 1221 ("..."), 1266 ("..."), 2245 ("...")
- Item 4 (WIC auth): NOT YET applied — investigating
```

The word "all" requires per-item enumeration with before/after evidence. Without enumeration, the word "all" is forbidden.

#### Rule 4 — "Looks done" ≠ "is done" — explicit pre-handoff verification

Before declaring "ready for handoff" / "done" / "ready to ship":

```
Pre-handoff verification (explicit step, not implicit):

1. Re-read each artifact end-to-end (not just edited sections)
2. List unresolved items found (TBD, ?, "decide later", open Qs in headings)
3. List internal contradictions (cross-section conflicts)
4. List missing cross-references (`see §X` but §X doesn't exist)
5. State verdict with evidence per check
```

Without this step, the words "ready" / "done" / "complete" are forbidden.

#### Rule 5 — When edits fail, root-cause; don't blind-retry

If `Edit` returns an error or a patch doesn't take effect — do NOT retry blindly. Instead:
- Re-read current file state (it may have changed since last read)
- Check whether `old_string` still exists and is unique
- Determine root cause **before** the next attempt

Reasoning: blind retry leads to "I think I fixed it" when nothing actually changed. Primary source of Pattern B.

#### Meta-Rule — Calibration: certainty matches evidence

Self-test before each claim:

| When saying... | ...required evidence: |
|---|---|
| "fixed" | `Read` on changed lines after `Edit` |
| "all" | Enumeration + per-item evidence |
| "verified" | Specific check (file:line + content) |
| "ready" | All 5 pre-handoff checks |
| "I'm sure" | Re-check **just now**, not earlier |

If evidence < claim — downgrade claim to what evidence supports. *"I edited 3 lines, but haven't re-read to confirm — let me check"* is better than *"All fixed."*

### Self-Test Gate

Skills loading `verification-discipline.md` include in their workflow, before "done"-words:

```markdown
Before declaring done/fixed/ready, ask yourself:

[ ] Did I re-read source after my last edit?
[ ] Did I enumerate evidence (file:line) per claim?
[ ] If user asked "are you sure?" — did I re-check, or react reflexively?
[ ] Are unresolved items explicitly listed (not silently dropped)?
[ ] Does my certainty match my evidence?

If any [ ] is unchecked — DON'T declare done. Do the missing step first.
```

### Realistic Expectations

This will not eliminate Pattern B. LLM sycophancy bias is fundamental. Procedural verification mitigates it:
- Reduces "are you sure?" interventions from 4× to 1-2× per session
- Concrete output format (enumeration + lines + content) is easy for user to spot-check
- Pre-handoff gate enforces re-check independently of skill — two defense layers

---

## 5. Component 3 — `om-product-manager` Phase 0 §0 Pre-Discovery (Pattern C)

### Location
`skills/om-product-manager/SKILL.md`, after line 68 (*"Before touching workflows or user stories, establish the business foundation and domain model."*) and before `### 1. Business Model & Goals` (current line 70).

### Patch (~25 lines added, zero existing content modified)

```markdown
### 0. Pre-Discovery: Existing Context & Artifacts

> **Run this BEFORE the business model questions.** Even if user docs look complete,
> ask explicitly — assumptions about prior context have caused 5-day spec drift.

Ask the user (one round, before §1):

1. **Is this a rewrite/replacement of an existing artifact?** If yes — what changed
   (platform capability, scope, requirements, stakeholders) that triggered the new
   approach? Are there prior specs / code / docs I should read first?
2. **Why now?** Is there a deadline, platform shift, or external trigger I should
   know about?
3. **What ELSE in OM relates to this?** Cross-references to existing modules,
   specs, or in-flight work that this depends on or duplicates.

**Hard rule:** If user's input docs are < 30 KB AND don't contain words like
"replace", "migration", "previous", "v2", "rewrite" — you MUST ask the questions
above explicitly. Do NOT silently assume "this is greenfield."

**Why this matters:** When this step is skipped, downstream phases work without
critical context (e.g., PRM 2026-04: 5 days of work elapsed before user mentioned
"this spec exists because customer-portal module didn't exist when prior version
was written"). That context shaped half the design choices retroactively.

After answering, summarize back to the user: *"OK, so this is a [greenfield /
rewrite triggered by X / iteration on Y]. Prior artifacts to read: [list].
Cross-deps: [list]."* — then proceed to §1.
```

### Renumbering
Existing §1, §2, §3, §4 retain numbers — new section is §0, before them. No conflicting renumbering.

### Why This Is Sufficient
The 30 KB threshold + wordlist procedurally protects against the PRM case (33 KB total, zero wordlist matches). Skill cannot rationalize "user gave thorough docs, surely all context is there." Hard rule forces the question.

---

## 6. Integration & Sync Constraints

### Sync Constraint Discovery
`scripts/sync-om-skills.sh` documents which skills are upstream-synced vs locally maintained:

> *"om-superpowers unique skills (om-cto, om-product-manager, om-ux, om-user-proxy, om-toolkit-review) are NOT synced — they are maintained in this repo. The rest comes from open-mercato/open-mercato@develop."*

### Skill Modification Matrix

| Skill | Sync status | Modify locally? |
|---|---|---|
| `om-product-manager` | LOCAL | ✅ YES |
| `om-cto` | LOCAL | ✅ YES |
| `om-user-proxy` | LOCAL | ✅ YES (if needed) |
| `om-ux` | LOCAL | ✅ YES |
| `om-toolkit-review` | LOCAL | ✅ YES |
| `om-spec-writing` | SYNCED | ❌ NO — overwritten on next sync |
| `om-code-review` | SYNCED | ❌ NO |
| `om-implement-spec` | SYNCED | ❌ NO |
| `om-pre-handoff-gate` (NEW) | LOCAL | ✅ YES |

### Selected Strategy — "Local-first, upstream-later"

**Phase 1 (immediate):** Patch only locally maintained skills (`om-product-manager`, `om-cto`) + add new `om-pre-handoff-gate` + `_shared/verification-discipline.md`. Coverage: Pattern A + B (in PM/CTO context) + C + D.

**Phase 2 (asynchronous):** Open upstream PR to `open-mercato/open-mercato` adding `verification-discipline.md` + gate invocation hooks to `om-spec-writing`, `om-code-review`, `om-implement-spec`. Coverage extends to those skills once merged + synced.

**Trade-off:** Pattern B coverage is partial until upstream PR merges. Acceptable because Cagan + CTO are the primary failure surface in PRM-style work; Spec Writing / Code Review / Implement Spec are downstream consumers that benefit from gate output even without their own discipline reference.

### Integration Map (Strategy I)

```
om-product-manager (LOCAL)
├── SKILL.md
│   ├── + §0 Pre-Discovery in Phase 0          [Pattern C]
│   ├── + Loaded rules: _shared/verification-discipline.md   [Pattern B]
│   └── + Phase 5 ending: invoke om-pre-handoff-gate          [Pattern A+D]

om-cto (LOCAL)
└── SKILL.md
    └── + Loaded rules: _shared/verification-discipline.md   [Pattern B]

om-pre-handoff-gate (NEW LOCAL)
├── SKILL.md
│   └── + Loaded rules: _shared/verification-discipline.md   [Pattern B, self-applied]
└── references/
    ├── cold-reader-checklist.md     [Pattern A]
    ├── residual-oq-patterns.md      [Pattern D]
    ├── redundancy-checks.md         [Pattern D]
    └── verdict-template.md

_shared/ (NEW LOCAL DIR)
└── verification-discipline.md        [Pattern B]
```

---

## 7. Testing Strategy

LLM behavior cannot be unit-tested reliably. Three verification layers:

### Layer 1 — Procedural verification (deterministic, automatable)

Synthetic regression test against known-bad PRM artifact:

```bash
test/regression-prm-spec.sh:
  cp test/fixtures/spec-with-lineage-and-open-questions.md ./test-spec.md
  invoke om-pre-handoff-gate --artifact test-spec.md --target dev
  assert verdict == "❌ NOT READY"
  assert findings include "§0 is 'Lineage'"
  assert findings include "Section '## 9. Open Questions'"
```

Catches regression in gate logic (regex/grep patterns missing known-bad cases).

### Layer 2 — Synthetic dogfood scenarios (manual verification)

Four synthetic specs, each violating one pattern:

| Spec | Pattern violated | Expected behavior |
|---|---|---|
| Spec A | §0 = "Lineage" | Gate Check 1 flags CRITICAL |
| Spec B | "all fixed" claim without enumeration | Discipline rule blocks declaration |
| Spec C | Input docs < 30 KB without migration wordlist | Phase 0 §0 forces question |
| Spec D | Monolith + sub-specs simultaneously | Gate Check 3 flags redundancy |

Each scenario run manually by user, observed output compared to expected.

### Layer 3 — Real-world dogfood (gold standard)

User builds next App Spec using patched skills. Metrics:

- Number of *"are you sure?"* interventions per session (target: < 2, vs. PRM: 4+)
- Whether Phase 0 §0 Pre-Discovery asked migration question and answer affected design
- Whether gate caught issues BEFORE user manual readthrough
- Whether spec sent to dev is cleaner on first pass (vs. PRM, which required restructuring on 2026-04-23)

Findings logged as feedback memory for further iteration.

---

## 8. Rollout Plan

| Phase | Work | Estimate |
|---|---|---|
| 1 | Author `_shared/verification-discipline.md` | ~1 h |
| 2 | Author `om-pre-handoff-gate` skill (SKILL.md + 4 references) | ~3-4 h |
| 3 | Patch `om-product-manager` SKILL.md (Phase 0 §0 + integration hooks) | ~1 h |
| 4 | Patch `om-cto` SKILL.md (load discipline reference) | ~15 min |
| 5 | Author 4 synthetic test specs + run gate against each | ~2 h |
| 6 | Draft upstream PR to `open-mercato/open-mercato` for synced skills | ~2-3 h |
| 7 | Real-world dogfood on user's next spec (cooperative, time-limited) | live |

**Total focused implementation:** ~10 hours.

---

## 9. Out of Scope (YAGNI)

- ❌ Generic "skill quality framework" — only the 4 observed patterns; no speculative quality categories
- ❌ Auto-fixing by gate — gate flags, user/skill decides remediation
- ❌ Modification of review-role agents (Vernon, Piotr Checkpoint) — they review correctness, not handoff readiness; mixing roles muddies the model
- ❌ Confidence scores / numerical certainty signals from skills — unreliable in LLMs, performance theater
- ❌ Multi-agent voting / cross-check for verification — overhead without benefit (PRM proved multi-agent doesn't fix Pattern B)
- ❌ Modification of sync mechanism (`scripts/sync-om-skills.sh`) — orthogonal infrastructure problem
- ❌ "Quality dashboard" / metrics tracking — log in MEMORY suffices
- ❌ Auto-trigger gate on every file save — gate is a checkpoint, not a linter
- ❌ Versioning / migration system for discipline rules — they are text references, not code
- ❌ Modification of unaffected skills (om-ux, om-troubleshooter, om-module-scaffold, etc.)
- ❌ Refactoring `references/quality-gates.md` in om-product-manager — current Phase 0 quality gates are domain-specific (vague-rule killing); orthogonal to our 4 patterns
- ❌ Spell-check / grammar in gate — that's linting, not quality gating

---

## Appendix A — PRM Evidence Chronology

Sessions in `~/.claude/projects/-Users-maciejgren-Documents-temp-1/` (chronological by first-message timestamp):

| Session | Window | Activity | Edits in `temp-1/` |
|---|---|---|---|
| `c0784eaf` | 2026-04-17 18:30–19:38 | Phase 0 + Phase 1 (start) | 77 |
| `a33ec68a` | 2026-04-17 19:41 → 2026-04-22 10:12 | Phase 2–5 (longest, 5 days) | 144 |
| `4d90522d` | 2026-04-22 10:12–19:55 | Apply review-2026-04-22 | 22 |
| `54ba57ce` | 2026-04-22 20:09 → 2026-04-23 17:45 | Apply review-2026-04-23, externalize decisions log | 91 |
| `b601e2b9` | 2026-04-23 18:24–20:55 | Decompose to 6 SPEC-* files, send to dev | 10 |
| `994d464c` | 2026-04-27 10:05–10:12 | Reflect on GoNextStage patterns vs OM | 0 |

Pattern-specific anchor messages already cited inline in §1.

---

## Changelog

### 2026-04-29 — Initial design
Authored after analyzing 81 user messages from PRM session corpus. Four patterns identified, four components designed, sync constraint discovered and addressed via Strategy I (local-first + upstream PR for synced skills). Approved by Mat 2026-04-29.
