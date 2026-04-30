# Skill Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 4 quality gates to OM Superpowers — pre-handoff cold-reader/residual-OQ/redundancy checks, verification discipline reference, Phase 0 pre-discovery — addressing 4 patterns observed in PRM postmortem.

**Architecture:** Add 1 new skill (`om-pre-handoff-gate`) and 1 shared reference (`_shared/verification-discipline.md`). Patch 2 locally maintained skills (`om-product-manager`, `om-cto`). Validate via 4 synthetic fixtures + manual gate runs. Release as 1.7.0.

**Tech Stack:** Markdown skill content. No code. No build step. Validation is manual gate invocation against synthetic fixtures.

**Source spec:** `docs/superpowers/specs/2026-04-29-skill-quality-gates-design.md`

**Done means:**
- New skill `om-pre-handoff-gate` invocable, passes manual fixture validation
- Patched skills load `verification-discipline.md` and (for Cagan) invoke gate
- 4 synthetic fixtures committed, used in validation
- CHANGELOG entry + version bump 1.6.0 → 1.7.0
- Upstream PR for synced skills (Spec Writing / Code Review / Implement Spec) is **NOT in this plan** — separate workstream

**Out of plan:**
- Upstream PR to `open-mercato/open-mercato` (separate repo, async review cycle)
- Real-world dogfood on Mat's next App Spec (cooperative, time-bound)

---

## Phase A — Foundation: Verification Discipline Reference

### Task 1: Create `_shared/verification-discipline.md`

**Files:**
- Create: `skills/_shared/verification-discipline.md`

- [ ] **Step 1: Create `_shared/` directory**

```bash
mkdir -p /Users/maciejgren/Documents/om-superpowers/skills/_shared
```

- [ ] **Step 2: Write `verification-discipline.md` with the full content below**

Write to `skills/_shared/verification-discipline.md`:

```markdown
---
name: verification-discipline
type: shared-reference
loaded-by: [om-product-manager, om-cto, om-pre-handoff-gate]
purpose: Anti-sycophancy posture for any claim of "done" / "fixed" / "verified" / "ready"
---

# Verification Discipline

Cross-cutting behavioral rules that override sycophancy bias when claiming completion. Loaded by main spec/PM/review skills. Source: PRM postmortem 2026-04-29 (4× "are you sure?" interventions in 2h before blockers actually fixed).

## Five Hard Rules + Meta-Rule

### Rule 1 — Re-read source after every edit, before claiming "fixed"

After any `Edit` tool call claiming "fixed bug" or similar — you MUST `Read` the changed lines and report what is now there. Without that step, the words "fixed" / "done" / "applied" are forbidden.

**Bad:** *"I've fixed the PartnerAdmin role contradictions in lines 616, 642, 701."*

**Good:** *"I edited lines 616, 642, 701. Re-reading current file: line 616 now says X (matches contract), line 642 says Y (matches contract), line 701 says Z (matches contract). All three resolved."*

### Rule 2 — "Are you sure?" = automatic re-check, never reflexive yes

User saying *"are you sure?"* / *"czy na pewno?"* / *"are you really sure?"* / *"you sure that's done?"* = signal that something was likely missed.

**Forbidden:** *"Yes, I'm sure."* / *"Confirmed."* without re-verification.

**Required:** Re-check the artifact, look for what may have been missed, report **what was checked after the question**.

Example: *"Re-checked X, Y, Z — confirmed. Also found Z.5 which I missed earlier — fixing now."*

### Rule 3 — Claims of "all fixed" require enumerated evidence

The word "all" requires per-item enumeration with before/after evidence. Without enumeration, "all" is forbidden.

**Bad:** *"All review items applied."*

**Good:**
```
Review items applied:
- Item 1 (PartnerAdmin role): edited line 616 ("...new content..."), 642 ("..."), 701 ("...")
- Item 2 (portal route): edited line 725 ("..."), 1147 ("..."), 1969 ("...")
- Item 3 (invite expiry): edited line 714 ("..."), 1221 ("..."), 1266 ("..."), 2245 ("...")
- Item 4 (WIC auth): NOT YET applied — investigating
```

### Rule 4 — "Looks done" ≠ "is done": explicit pre-handoff verification

Before declaring "ready for handoff" / "done" / "ready to ship" — you MUST run an explicit pre-handoff verification:

1. Re-read each artifact end-to-end (not just edited sections)
2. List unresolved items found (TBD, ?, "decide later", open Qs in headings)
3. List internal contradictions (cross-section conflicts)
4. List missing cross-references (`see §X` but §X doesn't exist)
5. State verdict with evidence per check

Without this step, the words "ready" / "done" / "complete" are forbidden.

### Rule 5 — When edits fail, root-cause; don't blind-retry

If `Edit` returns an error or a patch doesn't take effect — do NOT retry blindly. Instead:

- Re-read current file state (it may have changed since last read)
- Check whether `old_string` still exists and is unique
- Determine root cause **before** the next attempt

Reasoning: blind retry leads to "I think I fixed it" when nothing actually changed. Primary source of verification lies.

### Meta-Rule — Calibration: certainty matches evidence

Self-test before each claim:

| When saying... | ...required evidence: |
|---|---|
| "fixed" | `Read` on changed lines after `Edit` |
| "all" | Enumeration + per-item evidence |
| "verified" | Specific check (file:line + content) |
| "ready" | All 5 pre-handoff checks |
| "I'm sure" | Re-check **just now**, not earlier |

If evidence < claim — downgrade claim to what evidence supports. *"I edited 3 lines, but haven't re-read to confirm — let me check"* is better than *"All fixed."*

## Self-Test Gate (Required Workflow Step)

Skills loading this reference include in their workflow, before "done"-words:

```
Before declaring done/fixed/ready, ask yourself:

[ ] Did I re-read source after my last edit?
[ ] Did I enumerate evidence (file:line) per claim?
[ ] If user asked "are you sure?" — did I re-check, or react reflexively?
[ ] Are unresolved items explicitly listed (not silently dropped)?
[ ] Does my certainty match my evidence?

If any [ ] is unchecked — DON'T declare done. Do the missing step first.
```

## Realistic Expectations

This will not eliminate sycophancy bias — it is fundamental to LLM behavior. Procedural verification mitigates it:

- Reduces "are you sure?" interventions per session (PRM baseline: 4×; target: < 2×)
- Concrete output format (enumeration + lines + content) is easy for the user to spot-check
- `om-pre-handoff-gate` provides an independent re-check layer
```

- [ ] **Step 3: Verify file written correctly**

Run: `wc -l /Users/maciejgren/Documents/om-superpowers/skills/_shared/verification-discipline.md`
Expected: ~110 lines

- [ ] **Step 4: Commit**

```bash
cd /Users/maciejgren/Documents/om-superpowers
git add skills/_shared/verification-discipline.md
git commit -m "feat(skills): add _shared/verification-discipline.md (Pattern B)

Cross-cutting behavioral reference: 5 hard rules + meta-rule + self-test gate
to mitigate sycophancy bias in claims of done/fixed/verified/ready. Loaded by
om-product-manager, om-cto, and om-pre-handoff-gate (added in subsequent tasks)."
```

---

## Phase B — Test Fixtures (TDD-style: failing inputs first)

### Task 2: Create fixture A — spec with §0 = Lineage

**Files:**
- Create: `tests/fixtures/spec-A-lineage-as-section-zero.md`

- [ ] **Step 1: Create `tests/fixtures/` directory**

```bash
mkdir -p /Users/maciejgren/Documents/om-superpowers/tests/fixtures
```

- [ ] **Step 2: Write fixture A**

Write to `tests/fixtures/spec-A-lineage-as-section-zero.md`:

```markdown
# App Spec: Example Application

## 0. Lineage & Relationship to Existing Specs

This spec descends from SPEC-053 (data layer), SPEC-053b (event bus), SPEC-053c (cache strategy), and SPEC-060 (identity). Familiarity with those documents is assumed throughout.

The relationship to existing OM Specs is as follows:
- SPEC-053 provides the entity persistence baseline this app extends
- SPEC-053b provides the event publication contract
- SPEC-053c provides the cache invalidation pattern
- SPEC-060 provides the identity model used in §2

Without reading those four specs first, this document cannot be fully understood.

## 1. Business Context

### 1.1 Business Model

This is a sample app showing the customer portal pattern. Clients pay for licenses; partners contribute. Standard flywheel applies.

### 1.2 Goals

Demonstrate progressive disclosure failure mode by burying the TL;DR.

## 2. Identity Model

[content omitted for brevity in fixture — only structural patterns matter]

## Changelog

### 2026-04-30 (Fixture)
Synthetic spec exhibiting Pattern A: §0 is "Lineage" instead of TL;DR. Used to validate `om-pre-handoff-gate` Check 1 (cold-reader pass).
```

- [ ] **Step 3: Verify file created**

Run: `head -5 /Users/maciejgren/Documents/om-superpowers/tests/fixtures/spec-A-lineage-as-section-zero.md`
Expected: First section is `## 0. Lineage & Relationship to Existing Specs`

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/spec-A-lineage-as-section-zero.md
git commit -m "test(fixtures): add fixture A (§0=Lineage) for gate Check 1 validation"
```

---

### Task 3: Create fixture B — spec with Open Questions + TBDs

**Files:**
- Create: `tests/fixtures/spec-B-open-questions-and-tbds.md`

- [ ] **Step 1: Write fixture B**

Write to `tests/fixtures/spec-B-open-questions-and-tbds.md`:

```markdown
# App Spec: Example with Residual Open Questions

> **In one sentence.** A sample spec that should NOT pass pre-handoff because it has unresolved markers throughout.

## 0. At a glance

- **What.** Demo of Pattern D failure mode.
- **Status.** Allegedly ready for decomposition (it isn't).

## 1. Business Context

The business model is TBD. Specifically the commission rate (TODO: confirm with finance).

### 1.1 Open question on monetization?

This heading itself ends in a question mark, which should be flagged.

## 2. Workflows

### WF1: Onboarding

The onboarding flow is FIXME — the team hasn't decided whether to use email or SMS for verification.

This will be decided later, possibly v2.

## 9. Open Questions

| # | Question | Status |
|---|---|---|
| OQ-001 | Should tier transitions be automated? | Unresolved |
| OQ-002 | Conflict detection at insert time or attribution time? | ??? |
| OQ-003 | E-signing in scope? | To be decided |

## Changelog

### 2026-04-30 (Fixture)
Synthetic spec exhibiting Pattern D: residual TBD/TODO/FIXME, ?-headings, unresolved OQ section. Used to validate `om-pre-handoff-gate` Check 2 (residual-OQ scan).
```

- [ ] **Step 2: Verify file created**

Run: `grep -c -E "TBD|TODO|FIXME|Open Questions|\?\?\?" /Users/maciejgren/Documents/om-superpowers/tests/fixtures/spec-B-open-questions-and-tbds.md`
Expected: 6 or more matches (the patterns the gate should flag)

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/spec-B-open-questions-and-tbds.md
git commit -m "test(fixtures): add fixture B (residual OQ/TBD) for gate Check 2 validation"
```

---

### Task 4: Create fixture C — monolith + sub-specs scenario

**Files:**
- Create: `tests/fixtures/spec-C-monolith-with-subspecs/`
- Create: `tests/fixtures/spec-C-monolith-with-subspecs/app-spec.md`
- Create: `tests/fixtures/spec-C-monolith-with-subspecs/specs/SPEC-001-foundation.md`
- Create: `tests/fixtures/spec-C-monolith-with-subspecs/specs/SPEC-002-workflows.md`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p /Users/maciejgren/Documents/om-superpowers/tests/fixtures/spec-C-monolith-with-subspecs/specs
```

- [ ] **Step 2: Write monolith `app-spec.md` (deliberately overlapping with sub-specs)**

Write to `tests/fixtures/spec-C-monolith-with-subspecs/app-spec.md`:

```markdown
# App Spec — Monolith + Sub-Specs Coexisting (Pattern D)

> **In one sentence.** Fixture demonstrating that a monolithic app-spec.md remains alongside sub-specs after decomposition, with duplicate content.

## 0. At a glance

- **What.** Demo app showing redundancy after decomposition.
- **Decomposition status.** Sub-specs created in `specs/` but monolith retains the same content.

## 1. Workflows

### WF1: Foundation Setup
Full workflow content here, including step-by-step process, edge cases, and error handling. This same content is duplicated in `specs/SPEC-001-foundation.md`.

### WF2: Operational Workflows
Full workflow content here. Duplicated in `specs/SPEC-002-workflows.md`.

## 2. Naming inconsistency demo

Feature flags used:
- `portal.partner.access` (in §1.1)
- `prm.partner.create` (in §1.2)
- `prm.workflow.start` (in §2.1)
- `portal.workflow.complete` (in §2.2)

Should all be one prefix.
```

- [ ] **Step 3: Write sub-spec `SPEC-001-foundation.md` (duplicates §1)**

Write to `tests/fixtures/spec-C-monolith-with-subspecs/specs/SPEC-001-foundation.md`:

```markdown
# SPEC-001: Foundation

> Stories US1.1, US1.2.

## WF1: Foundation Setup

Full workflow content here, including step-by-step process, edge cases, and error handling. This same content is duplicated in the monolith `app-spec.md` §1.
```

- [ ] **Step 4: Write sub-spec `SPEC-002-workflows.md` (duplicates §1.2)**

Write to `tests/fixtures/spec-C-monolith-with-subspecs/specs/SPEC-002-workflows.md`:

```markdown
# SPEC-002: Workflows

> Stories US2.1, US2.2.

## WF2: Operational Workflows

Full workflow content here. Duplicated in monolith `app-spec.md` §1.2.
```

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/spec-C-monolith-with-subspecs/
git commit -m "test(fixtures): add fixture C (monolith + sub-specs + naming mix) for gate Check 3"
```

---

### Task 5: Create fixture D — synthetic input docs (no migration wordlist)

**Files:**
- Create: `tests/fixtures/input-docs-D-no-migration-context.md`

- [ ] **Step 1: Write fixture D**

Write to `tests/fixtures/input-docs-D-no-migration-context.md`:

```markdown
# Sample App Brief

We want to build a dashboard for our sales team. They should be able to see their pipeline, log calls, and track quota progress.

## Personas

- Sales rep
- Sales manager
- VP Sales

## Top features

- Pipeline visualization
- Call logging with notes
- Quota progress per quarter
- Team leaderboard

## Constraints

Must work on mobile. Must integrate with our existing CRM.

This file is intentionally < 30 KB and does not contain any of: replace, migration, previous, v2, rewrite. The Phase 0 §0 hard rule MUST trigger when this is the user's input.
```

- [ ] **Step 2: Verify size and absence of wordlist**

Run: `wc -c /Users/maciejgren/Documents/om-superpowers/tests/fixtures/input-docs-D-no-migration-context.md`
Expected: < 30000 bytes

Run: `grep -c -i -E "replace|migration|previous|v2|rewrite" /Users/maciejgren/Documents/om-superpowers/tests/fixtures/input-docs-D-no-migration-context.md`
Expected: 1 (only the explanatory sentence at the bottom — wordlist absent from actual brief content)

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/input-docs-D-no-migration-context.md
git commit -m "test(fixtures): add fixture D (input docs, no migration wordlist) for Phase 0 §0"
```

---

## Phase C — Build the Gate Skill

### Task 6: Create `om-pre-handoff-gate` skill scaffold

**Files:**
- Create: `skills/om-pre-handoff-gate/SKILL.md` (skeleton — full content in Task 11)
- Create: `skills/om-pre-handoff-gate/references/` (empty dir for now)

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p /Users/maciejgren/Documents/om-superpowers/skills/om-pre-handoff-gate/references
```

- [ ] **Step 2: Write SKILL.md skeleton (frontmatter + section headers, content filled in Task 11)**

Write to `skills/om-pre-handoff-gate/SKILL.md`:

```markdown
---
name: om-pre-handoff-gate
description: Run before handing off a spec/plan/doc to a downstream reader (developer, Spec Orchestrator, code reviewer). Performs cold-reader pass, residual open-question scan, and redundancy/consistency check. Flags blockers; does not auto-fix. Triggers on "pre-handoff check", "ready to ship", "send to dev", or auto-invoked by om-product-manager Phase 5 and om-spec-writing finalization.
---

# Pre-Handoff Gate

> Validates that an artifact is ready to be handed off to a downstream reader. Source: PRM postmortem 2026-04-29 — multi-agent ensemble missed §0=Lineage and "Open Questions" section before user manual readthrough.

## Loaded Rules

- `_shared/verification-discipline.md` — gate must be skeptical of itself; no `✅ passed` without concrete evidence

## When to invoke

[Filled in Task 11]

## Input

[Filled in Task 11]

## Workflow — Four Sequential Checks

[Filled in Task 11 — references will exist by then]

## Output

[Filled in Task 11]
```

- [ ] **Step 3: Commit**

```bash
git add skills/om-pre-handoff-gate/SKILL.md
git commit -m "feat(skills): scaffold om-pre-handoff-gate (SKILL.md skeleton)

Frontmatter and section headers only — references and full workflow added in
subsequent tasks."
```

---

### Task 7: Create `references/cold-reader-checklist.md`

**Files:**
- Create: `skills/om-pre-handoff-gate/references/cold-reader-checklist.md`

- [ ] **Step 1: Write reference**

Write to `skills/om-pre-handoff-gate/references/cold-reader-checklist.md`:

```markdown
# Cold-Reader Checklist (Pattern A)

Reads artifact as a fresh reader landing on it cold. Flag what would confuse / lose / mislead a reader who has zero prior context.

## Red Flags Table

| Red flag | Detection method | Severity | Fix recommendation |
|---|---|---|---|
| §0 named "Lineage", "History", "Background", "Context", or "Relationship to..." | Regex on first `^##? 0\.?` heading or first `## ` heading if no §0: `(Lineage\|History\|Background\|Context\|Relationship)` | CRITICAL | Move to Appendix A. Add new §0 "At a glance (TL;DR)" with 8 bullets (what / why / who / scope / sizing / status / deep-dive map). |
| Missing "In one sentence" hook | No blockquote `^> .{20,200}` in first 10 lines after title | WARNING | Add a 1-sentence blockquote hook directly under the title. |
| §0 longer than 50 lines (excluding headings) | Line count between `## 0` and next `## ` | WARNING | Compress §0 to scannable bullets. Move detail to later sections. |
| Missing "deep-dive map" | No section-navigation listing in §0 referencing other sections | INFO | Add `§1 X · §2 Y · §3 Z · ...` map to §0 last bullet. |
| Headings go specifics-before-general | LLM-judged ordering check on §1, §2, §3 first lines | WARNING | Reorder: business context → identity → workflows → stories → mapping → phasing. |
| Title without "App Spec" / "Functional Spec" / "Plan" prefix | Title regex doesn't match known artifact types | INFO | Prefix title with artifact type for downstream router clarity. |

## How to run this check

For the artifact under review:

1. Read first 80 lines (title + §0 + start of §1) end-to-end as if you've never seen it.
2. After reading, ask: "Could a fresh reader summarize what this artifact is about, who it's for, and where to find what they need — in 30 seconds?"
3. If NO — apply red flags table to identify which row(s) caused the failure.
4. Report findings with `file:line` evidence for each flag.

## What "passes" looks like

A passing artifact has, in this order at the top:
- Title with artifact-type prefix (e.g., "App Spec: PRM")
- Blockquote 1-sentence hook
- Status line (date, owner, optional)
- §0 "At a glance (TL;DR)" with what/why/who/scope/sizing/status/deep-dive-map bullets (≤ 50 lines)
- §1+ proceeding general-to-specific

When passing, gate output for this check states explicitly: *"Cold-reader pass: §0 TL;DR found at line N (M bullets). 'In one sentence' hook at line K. §1 begins general (business model) before specific (entities). Pass."* — never just "passes" without evidence.
```

- [ ] **Step 2: Commit**

```bash
git add skills/om-pre-handoff-gate/references/cold-reader-checklist.md
git commit -m "feat(skills): add gate references/cold-reader-checklist.md (Pattern A)"
```

---

### Task 8: Create `references/residual-oq-patterns.md`

**Files:**
- Create: `skills/om-pre-handoff-gate/references/residual-oq-patterns.md`

- [ ] **Step 1: Write reference**

Write to `skills/om-pre-handoff-gate/references/residual-oq-patterns.md`:

```markdown
# Residual Open-Question Patterns (Pattern D, part 1)

Greps + LLM-judge for unresolved-marker patterns that should be cleaned up before handoff.

## Pattern Catalog

| Pattern | Severity if unresolved | Fix recommendation |
|---|---|---|
| `^##? \d+\.\s*Open Questions` (a section titled "Open Questions" with section number) | CRITICAL | Externalize to a separate `decisions-log.md` with v1/v2 resolution status per question. The spec sent to dev cannot have an unresolved-questions section. |
| `\bTBD\b` (case-sensitive whole word) | CRITICAL if no nearby DEFERRED marker, else INFO | Replace with concrete decision, or mark `DEFERRED to vN — <reason>`. |
| `\bTODO\b` (case-sensitive whole word) | CRITICAL if no nearby DEFERRED marker, else INFO | Same as TBD. |
| `\bFIXME\b` (case-sensitive whole word) | CRITICAL | Resolve before handoff. FIXME implies known bug, never DEFERRED. |
| `\?\?\?+` (3+ question marks) | CRITICAL | Replace with concrete decision. |
| `\bdecide later\b` (case-insensitive) | CRITICAL if no version target, else INFO | Add explicit `DEFERRED to vN`. |
| `\bto be decided\b` (case-insensitive) | CRITICAL if no version target, else INFO | Same. |
| `^##? .* \?$` (heading ending in `?`) | WARNING | Convert heading to declarative form; move open question to decisions-log. |
| `(?i)\b(unresolved\|unclear\|undecided)\b` | INFO if isolated, CRITICAL if heading | Resolve or mark explicitly. |

## "DEFERRED marker" detection (downgrade rule)

For each match above, check the surrounding ±3 lines for any of:
- `DEFERRED to v` (followed by digit)
- `RESOLVED for v1`
- `v2 follow-up`
- `v2 backlog`
- explicit issue tracker reference (`see #123`, `OQ-N → v2`)

If found — downgrade severity by one level (CRITICAL → WARNING, WARNING → INFO).

## How to run this check

1. Run pattern grep against the artifact (use `grep -nE` for regex line numbers).
2. For each match, capture file:line and ±3 lines of surrounding context.
3. Apply DEFERRED-marker downgrade rule per match.
4. Aggregate by severity.

## Special case: entire "Open Questions" section

A section titled "Open Questions" / "OQ" — regardless of internal content — is CRITICAL and **cannot be downgraded**. The principle: a downstream reader must not need to read this spec AND a separate "open" list to know what's decided. Externalize the resolution log to a companion file (`decisions-log.md`), where every item is RESOLVED or explicitly DEFERRED.

## What "passes" looks like

Gate output for this check states explicitly: *"Residual-OQ scan: 0 CRITICAL after DEFERRED-marker downgrades. 2 INFO matches found at lines X, Y — both flagged DEFERRED to v2. Pass."* — never just "passes" without evidence.
```

- [ ] **Step 2: Commit**

```bash
git add skills/om-pre-handoff-gate/references/residual-oq-patterns.md
git commit -m "feat(skills): add gate references/residual-oq-patterns.md (Pattern D part 1)"
```

---

### Task 9: Create `references/redundancy-checks.md`

**Files:**
- Create: `skills/om-pre-handoff-gate/references/redundancy-checks.md`

- [ ] **Step 1: Write reference**

Write to `skills/om-pre-handoff-gate/references/redundancy-checks.md`:

```markdown
# Redundancy & Consistency Checks (Pattern D, part 2)

Catches post-major-edit hygiene failures: duplicate content after decomposition, mixed naming, broken cross-references.

## Decomposition Hygiene

**When to apply:** if `context.decomposed_recently == true` or if the input includes both a monolith file and a `specs/` subdirectory with sub-specs.

| Red flag | Detection | Severity | Fix recommendation |
|---|---|---|---|
| Monolith file alongside sub-specs in `specs/` | Both `app-spec.md` and `specs/SPEC-*.md` present | WARNING | Convert monolith to thin-spec referencing sub-specs (1-2 paragraphs per sub-spec + reference link). |
| Sub-specs duplicate ≥ 50% of a monolith section | Section-level diff between monolith §X and `specs/SPEC-X.md` | CRITICAL | Remove duplicated content from monolith; keep only summary + reference. |
| Sub-spec missing reference to monolith | No `(See app-spec.md §X for context)` or equivalent in sub-spec | INFO | Add upward reference. |

## Naming Consistency

**Always run.**

| Red flag | Detection | Severity | Fix recommendation |
|---|---|---|---|
| Mixed namespace prefixes for the same category | Grep for known prefixes (e.g., `portal.*`, `prm.*`, `app.*`) for feature flags / event IDs / role names; if more than one prefix used for same kind of name → flag | WARNING | Pick one prefix, rename others. Document the convention in §1.4 or equivalent. |
| Inconsistent casing for entity names | Grep entity name in PascalCase vs snake_case vs camelCase across artifact | INFO | Pick one casing per concept (entities = PascalCase, fields = snake_case is standard). |
| Different terms for same concept | LLM-judged glossary check against §1.3 Ubiquitous Language (if present) | WARNING | Add to glossary or replace synonyms. |

## Cross-References

**Always run.**

| Red flag | Detection | Severity | Fix recommendation |
|---|---|---|---|
| `see §X` where §X doesn't exist | Extract all `§\d+(\.\d+)*` references; verify each section exists | CRITICAL | Fix reference or add missing section. |
| `see <file>` where file doesn't exist on disk | Extract all backtick-wrapped file references; verify with `ls` | CRITICAL | Fix path or remove reference. |
| `see app-spec.md (line N)` where line N doesn't match referenced content | LLM-judged content match | WARNING | Update line number. |

## How to run this check

1. Detect decomposition state (single file vs monolith+sub-specs).
2. If decomposed: run decomposition hygiene checks.
3. Always: run naming consistency + cross-reference checks.
4. Aggregate findings with file:line evidence.

## What "passes" looks like

Gate output: *"Redundancy/consistency: monolith+sub-specs detected, 0 sections duplicated >50%. Naming: 1 prefix (`prm.*`) used consistently across feature flags + events + roles. Cross-references: 14 §-references checked, all targets exist. 3 file references checked, all files exist on disk. Pass."* — never just "passes" without enumeration.
```

- [ ] **Step 2: Commit**

```bash
git add skills/om-pre-handoff-gate/references/redundancy-checks.md
git commit -m "feat(skills): add gate references/redundancy-checks.md (Pattern D part 2)"
```

---

### Task 10: Create `references/verdict-template.md`

**Files:**
- Create: `skills/om-pre-handoff-gate/references/verdict-template.md`

- [ ] **Step 1: Write reference**

Write to `skills/om-pre-handoff-gate/references/verdict-template.md`:

````markdown
# Verdict Output Template

Standard output format for `om-pre-handoff-gate`. Required fields, no improvisation.

## Aggregation Logic

```
verdict =
  if any CRITICAL → "❌ NOT READY"
  elif any WARNING → "⚠ NEEDS REVIEW"
  else → "✅ READY"
```

## Output Format

```markdown
# Pre-Handoff Gate Report — <artifact_name>

**Generated:** <ISO timestamp>
**Target reader:** <dev | spec-orchestrator | review>
**Artifact type:** <app-spec | functional-spec | execution-plan | other>
**Verdict:** <emoji + status>

## Summary

- Cold-reader pass: <N CRITICAL>, <M WARNING>, <K INFO>
- Residual-OQ scan: <N CRITICAL>, <M WARNING>, <K INFO>
- Redundancy/consistency: <N CRITICAL>, <M WARNING>, <K INFO>
- **Total blockers (CRITICAL):** <N>

## Findings

### <SEVERITY> — <one-line title>

**File:** <path> (line <N>)
**Issue:** <what's wrong, in 1-2 sentences>
**Evidence:** <quoted content from file showing the issue>
**Fix:** <specific action — concrete, not "consider"; cite cold-reader-checklist.md or residual-oq-patterns.md or redundancy-checks.md row that triggered>

[repeat per finding, ordered: CRITICAL first, then WARNING, then INFO]

## Per-Check Pass Evidence

For each check that passed, state what was verified:

- **Cold-reader pass:** <what was confirmed — see references/cold-reader-checklist.md "What 'passes' looks like">
- **Residual-OQ scan:** <what was confirmed>
- **Redundancy/consistency:** <what was confirmed>

## Recommended Action

<If NOT READY:> Fix the <N> CRITICAL blockers above before re-running. Once fixed, re-invoke `om-pre-handoff-gate` against the updated artifact.

<If NEEDS REVIEW:> Address WARNING items if shippable on this iteration; INFO items can be deferred.

<If READY:> Proceed to handoff. Suggested next step: <e.g., "send to developer", "invoke om-cto Spec Orchestrator", "create PR">.
```

## Anti-Sycophancy Reminder

Every "Pass" claim in the report MUST include the evidence shown above. The gate is bound by `_shared/verification-discipline.md`. Never write "Cold-reader pass: ✅ passed" — write "Cold-reader pass: §0 TL;DR found at line N (8 bullets), ...".
````

- [ ] **Step 2: Commit**

```bash
git add skills/om-pre-handoff-gate/references/verdict-template.md
git commit -m "feat(skills): add gate references/verdict-template.md"
```

---

### Task 11: Complete gate `SKILL.md` with full workflow + reference loading

**Files:**
- Modify: `skills/om-pre-handoff-gate/SKILL.md`

- [ ] **Step 1: Replace skeleton with full content**

Overwrite `skills/om-pre-handoff-gate/SKILL.md` with:

````markdown
---
name: om-pre-handoff-gate
description: Run before handing off a spec/plan/doc to a downstream reader (developer, Spec Orchestrator, code reviewer). Performs cold-reader pass, residual open-question scan, and redundancy/consistency check. Flags blockers; does not auto-fix. Triggers on "pre-handoff check", "ready to ship", "send to dev", or auto-invoked by om-product-manager Phase 5 and om-spec-writing finalization.
---

# Pre-Handoff Gate

> Validates that an artifact is ready to be handed off to a downstream reader. Source: PRM postmortem 2026-04-29 — multi-agent ensemble (Cagan + Vernon + Piotr + independent review) missed §0=Lineage and "Open Questions" section before user manual readthrough.

## Loaded Rules

- `_shared/verification-discipline.md` — gate must be skeptical of itself; no `✅ passed` without concrete evidence

## When to invoke

Three invocation paths:

1. **Auto** — `om-product-manager` Phase 5 (Summary) calls this gate before declaring "ready for decomposition"
2. **Auto** — `om-spec-writing` calls this gate before saving final spec
3. **Manual** — user invokes ("check if ready to ship", "pre-handoff check", "send to dev — first verify")

## Input

The skill expects:

- `artifact_paths`: list of file paths being handed off (e.g., `[app-spec.md, decisions-log.md]`). Required.
- `target_reader`: one of `dev`, `spec-orchestrator`, `review`. If absent, infer from context or ask once.
- `artifact_type`: one of `app-spec`, `functional-spec`, `execution-plan`, `other`. If absent, infer from filename / first heading.
- `context.decomposed_recently`: bool. If absent, infer from presence of both monolith + `specs/` directory.

## Workflow — Four Sequential Checks

For each check, load the relevant reference and apply its rules.

### Check 1 — Cold-reader pass

Load `references/cold-reader-checklist.md`. Apply red flags table to first 80 lines of each artifact. Output findings with `file:line` evidence.

### Check 2 — Residual-OQ scan

Load `references/residual-oq-patterns.md`. Run pattern catalog against full artifact text. Apply DEFERRED-marker downgrade rule. Output findings with file:line evidence.

### Check 3 — Redundancy / consistency

Load `references/redundancy-checks.md`. Run decomposition hygiene (if applicable) + naming consistency + cross-reference checks. Output findings with file:line evidence.

### Check 4 — Aggregate verdict

Load `references/verdict-template.md`. Aggregate findings into structured Markdown report. State verdict per template's aggregation logic.

## Anti-Sycophancy Self-Application (CRITICAL)

This gate is itself bound by `_shared/verification-discipline.md`. Specifically:

- After each Check, do NOT write `✅ passed` without concrete evidence. Instead write what was checked + where + what was found (or not found).
- If a Check finds zero blockers, state explicitly what evidence was inspected (e.g., "Checked lines 1-50 for §0 structure — found 'In one sentence' at line 3, TL;DR bullets at lines 23-30 — passes").
- If user pushes back on the verdict (`"are you sure no Open Questions?"`) — re-run the relevant check, do not reflexively confirm.

This closes the loop: a sycophantic gate would itself become Pattern B inside the very system meant to mitigate it.

## Output

Structured Markdown report per `references/verdict-template.md`. Three possible verdicts:

- `❌ NOT READY` — at least one CRITICAL finding; user must fix before re-running.
- `⚠ NEEDS REVIEW` — only WARNING/INFO findings; user decides whether to address now or defer.
- `✅ READY` — zero CRITICAL/WARNING findings; per-check pass evidence enumerated.

Save report to: `<artifact_dir>/.pre-handoff-gate-report-<ISO-date>.md` if filesystem writable; otherwise return inline.

## What this gate does NOT do

- Does not auto-fix any finding (gate flags, user/skill remediates).
- Does not run code linting / spell-check / grammar (orthogonal concerns).
- Does not validate domain semantics (that's `om-cto` / Piotr Checkpoint).
- Does not modify the artifact in any way.
````

- [ ] **Step 2: Verify completeness**

Run: `wc -l /Users/maciejgren/Documents/om-superpowers/skills/om-pre-handoff-gate/SKILL.md`
Expected: ~80 lines

Run: `grep -c "_shared/verification-discipline.md" /Users/maciejgren/Documents/om-superpowers/skills/om-pre-handoff-gate/SKILL.md`
Expected: 2 (in Loaded Rules section + in Anti-Sycophancy section)

- [ ] **Step 3: Commit**

```bash
git add skills/om-pre-handoff-gate/SKILL.md
git commit -m "feat(skills): complete om-pre-handoff-gate SKILL.md workflow

Full Check 1-4 workflow loading 4 references. Anti-sycophancy self-application
binds the gate to _shared/verification-discipline.md."
```

---

## Phase D — Phase 0 Pre-Discovery Patch

### Task 12: Patch `om-product-manager/SKILL.md` — add §0 Pre-Discovery

**Files:**
- Modify: `skills/om-product-manager/SKILL.md` (insert after line 68)

- [ ] **Step 1: Verify current state of SKILL.md around insertion point**

Run: `sed -n '66,72p' /Users/maciejgren/Documents/om-superpowers/skills/om-product-manager/SKILL.md`
Expected output:
```
## Phase 0: Business Context & Domain Model

Before touching workflows or user stories, establish the business foundation and domain model.

### 1. Business Model & Goals

Ask:
```

- [ ] **Step 2: Apply patch — insert §0 Pre-Discovery between lines 68 and 70**

Use the `Edit` tool with these exact strings:

`old_string`:
```
Before touching workflows or user stories, establish the business foundation and domain model.

### 1. Business Model & Goals
```

`new_string`:
```
Before touching workflows or user stories, establish the business foundation and domain model.

### 0. Pre-Discovery: Existing Context & Artifacts

> **Run this BEFORE the business model questions.** Even if user docs look complete, ask explicitly — assumptions about prior context have caused 5-day spec drift (see PRM postmortem 2026-04-29).

Ask the user (one round, before §1):

1. **Is this a rewrite/replacement of an existing artifact?** If yes — what changed (platform capability, scope, requirements, stakeholders) that triggered the new approach? Are there prior specs / code / docs I should read first?
2. **Why now?** Is there a deadline, platform shift, or external trigger I should know about?
3. **What ELSE in OM relates to this?** Cross-references to existing modules, specs, or in-flight work that this depends on or duplicates.

**Hard rule:** If user's input docs are < 30 KB AND don't contain words like `replace`, `migration`, `previous`, `v2`, `rewrite` — you MUST ask the questions above explicitly. Do NOT silently assume "this is greenfield."

**Why this matters:** When this step is skipped, downstream phases work without critical context (e.g., PRM 2026-04: 5 days of work elapsed before user mentioned *"this spec exists because customer-portal module didn't exist when prior version was written"*). That context shaped half the design choices retroactively.

After answering, summarize back to the user: *"OK, so this is a [greenfield / rewrite triggered by X / iteration on Y]. Prior artifacts to read: [list]. Cross-deps: [list]."* — then proceed to §1.

### 1. Business Model & Goals
```

- [ ] **Step 3: Verify patch applied**

Run: `grep -n "### 0. Pre-Discovery" /Users/maciejgren/Documents/om-superpowers/skills/om-product-manager/SKILL.md`
Expected: one match at line ~70

Run: `grep -n "Hard rule:" /Users/maciejgren/Documents/om-superpowers/skills/om-product-manager/SKILL.md`
Expected: one match within the new section

- [ ] **Step 4: Commit**

```bash
git add skills/om-product-manager/SKILL.md
git commit -m "feat(om-product-manager): add Phase 0 §0 Pre-Discovery (Pattern C)

Forces explicit migration/pre-existence questions when input docs are < 30 KB
without migration wordlist. Source: PRM postmortem — 5 days elapsed before user
mentioned prior spec context."
```

---

## Phase E — Integration

### Task 13: Patch `om-product-manager/SKILL.md` — load discipline + invoke gate

**Files:**
- Modify: `skills/om-product-manager/SKILL.md` (top of file + Phase 5 section)

- [ ] **Step 1: Add "Loaded Rules" section after frontmatter**

Use `Edit` with:

`old_string`:
```
**Output:** App Spec document following `skills/templates/app-spec-template.md`. Each section has embedded checklists with Cagan/Piotr ownership.

## Challenger Mode — Vaughn Vernon DDD Review
```

`new_string`:
```
**Output:** App Spec document following `skills/templates/app-spec-template.md`. Each section has embedded checklists with Cagan/Piotr ownership.

## Loaded Rules

- `_shared/verification-discipline.md` — anti-sycophancy posture; required for any "done"/"fixed"/"ready" claim. Apply self-test gate before declaring any phase complete.

## Challenger Mode — Vaughn Vernon DDD Review
```

- [ ] **Step 2: Find Phase 5 section to add gate invocation**

Run: `grep -n "Phase 5" /Users/maciejgren/Documents/om-superpowers/skills/om-product-manager/SKILL.md`

Locate the end of Phase 5 (Summary) — typically the last paragraph before the file ends or before any closing `<HARD-GATE>`. If Phase 5 doesn't exist yet, add it as the final phase. Inspect manually:

Run: `sed -n '300,350p' /Users/maciejgren/Documents/om-superpowers/skills/om-product-manager/SKILL.md`

- [ ] **Step 3: Add gate invocation at end of Phase 5**

Append (or insert after the last existing phase paragraph) the following section, depending on Phase 5's current structure. If Phase 5 exists with a "Summary" or "Handoff" section, add this paragraph there. If not, add as the last section before any `<HARD-GATE>` closing block:

```markdown
### Pre-Handoff Gate (REQUIRED before declaring spec ready)

Before stating that the App Spec is "ready for decomposition" / "ready to hand to Piotr Spec Orchestrator" / "ready to send to dev" — you MUST invoke `om-pre-handoff-gate`:

```
om-pre-handoff-gate
  artifact_paths: [app-spec.md, decisions-log.md (if exists)]
  target_reader: spec-orchestrator
  artifact_type: app-spec
```

If the gate returns `❌ NOT READY` or `⚠ NEEDS REVIEW` — address the findings, then re-run the gate. Only after `✅ READY` may you declare the spec done.

This is bound by `_shared/verification-discipline.md` Rule 4 (explicit pre-handoff verification).
```

- [ ] **Step 4: Verify both patches applied**

Run: `grep -n "_shared/verification-discipline.md" /Users/maciejgren/Documents/om-superpowers/skills/om-product-manager/SKILL.md`
Expected: at least 2 matches (Loaded Rules + Phase 5 reference)

Run: `grep -n "om-pre-handoff-gate" /Users/maciejgren/Documents/om-superpowers/skills/om-product-manager/SKILL.md`
Expected: at least 1 match (in Pre-Handoff Gate section)

- [ ] **Step 5: Commit**

```bash
git add skills/om-product-manager/SKILL.md
git commit -m "feat(om-product-manager): integrate verification-discipline + pre-handoff-gate

Loaded Rules section references _shared/verification-discipline.md (Pattern B).
Phase 5 invokes om-pre-handoff-gate before declaring spec ready (Pattern A+D)."
```

---

### Task 14: Patch `om-cto/SKILL.md` — load discipline reference

**Files:**
- Modify: `skills/om-cto/SKILL.md` (after intro, before Task Router)

- [ ] **Step 1: Apply patch**

Use `Edit` with:

`old_string`:
```
When making any technical decision, load `references/piotr-decision-library.md` for Piotr's 10 real decision patterns — extracted from his code reviews, PR decisions, and architecture choices. Apply them in order: BC contract first, then reuse, then tests, then decentralization.

## Task Router
```

`new_string`:
```
When making any technical decision, load `references/piotr-decision-library.md` for Piotr's 10 real decision patterns — extracted from his code reviews, PR decisions, and architecture choices. Apply them in order: BC contract first, then reuse, then tests, then decentralization.

## Loaded Rules

- `_shared/verification-discipline.md` — anti-sycophancy posture; required for any "done"/"fixed"/"verified" claim during checkpoints, gap analysis, and orchestration handoffs.

## Task Router
```

- [ ] **Step 2: Verify patch**

Run: `grep -n "_shared/verification-discipline.md" /Users/maciejgren/Documents/om-superpowers/skills/om-cto/SKILL.md`
Expected: 1 match

- [ ] **Step 3: Commit**

```bash
git add skills/om-cto/SKILL.md
git commit -m "feat(om-cto): load _shared/verification-discipline.md (Pattern B)"
```

---

## Phase F — Validation

### Task 15: Manual gate run against fixtures A, B, C — record findings

**Files:**
- Create: `tests/validation-2026-04-30.md` (a results log)

- [ ] **Step 1: Manual run gate against fixture A (§0=Lineage)**

In a fresh Claude Code session, invoke:
> "Run om-pre-handoff-gate against `tests/fixtures/spec-A-lineage-as-section-zero.md`, target_reader=dev, artifact_type=app-spec."

Capture the gate's output. Expected verdict: **❌ NOT READY** with at least one CRITICAL finding citing "§0 named 'Lineage'" and pointing to line ~3 of the fixture.

- [ ] **Step 2: Manual run gate against fixture B (Open Questions + TBDs)**

Invoke:
> "Run om-pre-handoff-gate against `tests/fixtures/spec-B-open-questions-and-tbds.md`, target_reader=dev, artifact_type=app-spec."

Expected: **❌ NOT READY** with CRITICAL findings for the `## 9. Open Questions` section AND for individual TBD/TODO/FIXME/`???` markers without DEFERRED qualifiers.

- [ ] **Step 3: Manual run gate against fixture C (monolith + sub-specs)**

Invoke:
> "Run om-pre-handoff-gate against `tests/fixtures/spec-C-monolith-with-subspecs/app-spec.md` and `tests/fixtures/spec-C-monolith-with-subspecs/specs/SPEC-001-foundation.md` and `tests/fixtures/spec-C-monolith-with-subspecs/specs/SPEC-002-workflows.md`, target_reader=dev, artifact_type=app-spec, context.decomposed_recently=true."

Expected: **❌ NOT READY** with CRITICAL findings for sub-specs duplicating monolith content + WARNING for mixed `portal.*` / `prm.*` namespaces.

- [ ] **Step 4: Record findings**

Write to `tests/validation-2026-04-30.md`:

```markdown
# Gate Validation — 2026-04-30

## Fixture A — §0=Lineage
- Verdict: <captured>
- Expected: ❌ NOT READY
- Match: <yes/no>
- Notable findings: <quote 1-2 lines from gate output>

## Fixture B — Open Questions + TBDs
- Verdict: <captured>
- Expected: ❌ NOT READY
- Match: <yes/no>
- Notable findings: <quote>

## Fixture C — Monolith + sub-specs + naming mix
- Verdict: <captured>
- Expected: ❌ NOT READY
- Match: <yes/no>
- Notable findings: <quote>

## Pass criterion
All 3 fixtures must produce `❌ NOT READY` verdict with at least one CRITICAL finding matching the documented expectation. If any fixture passes (`✅ READY`) or misses the expected finding — gate logic is broken and references must be revised before release.
```

- [ ] **Step 5: Commit**

```bash
git add tests/validation-2026-04-30.md
git commit -m "test(validation): record gate run results against fixtures A/B/C"
```

---

### Task 16: Verify Phase 0 §0 hard rule against fixture D

**Files:**
- Append to: `tests/validation-2026-04-30.md`

- [ ] **Step 1: Walkthrough scenario**

Walk through the following scenario manually in a fresh Claude Code session:

1. User says: *"I want to build a sales dashboard. Here are the docs: `tests/fixtures/input-docs-D-no-migration-context.md`"*
2. Invoke `om-product-manager` skill.
3. Verify the skill reaches the new §0 Pre-Discovery and asks the 3 migration questions BEFORE proceeding to §1 Business Model.

- [ ] **Step 2: Verify hard-rule trigger condition matches fixture**

Run: `wc -c /Users/maciejgren/Documents/om-superpowers/tests/fixtures/input-docs-D-no-migration-context.md`
Expected: < 30000 bytes (hard rule activates)

Run: `grep -c -i -E "replace|migration|previous|v2|rewrite" /Users/maciejgren/Documents/om-superpowers/tests/fixtures/input-docs-D-no-migration-context.md`
Note: the explanatory sentence at the bottom of the fixture intentionally contains the wordlist (so a reader knows what's being tested), but the brief content above does not. The skill must base its judgment on the actual brief content, not on the meta-explanation. If this becomes ambiguous in practice, split the fixture into two files.

- [ ] **Step 3: Append validation result**

Append to `tests/validation-2026-04-30.md`:

```markdown
## Fixture D — Phase 0 §0 hard rule
- Skill asked migration questions before §1: <yes/no>
- Skill summarized back ("OK, so this is a..."): <yes/no>
- Match: <yes/no>
```

- [ ] **Step 4: Commit**

```bash
git add tests/validation-2026-04-30.md
git commit -m "test(validation): record Phase 0 §0 walkthrough result"
```

---

## Phase G — Release

### Task 17: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md` (top of file, new 1.7.0 section)

- [ ] **Step 1: Add new section at top**

Use `Edit` with:

`old_string`:
```
# Changelog

## 1.6.0
```

`new_string`:
```
# Changelog

## 1.7.0

### Added
- New skill `om-pre-handoff-gate` — validates spec/plan/doc readiness before downstream handoff (cold-reader pass + residual-OQ scan + redundancy/consistency check)
- Shared reference `_shared/verification-discipline.md` — anti-sycophancy posture for "done"/"fixed"/"verified"/"ready" claims (5 hard rules + meta-rule + self-test gate)
- `om-product-manager` Phase 0 §0 "Pre-Discovery: Existing Context & Artifacts" — forces migration/pre-existence questions when input docs lack migration wordlist
- 4 synthetic test fixtures in `tests/fixtures/` for gate validation
- Gate validation log in `tests/validation-2026-04-30.md`

### Changed
- `om-product-manager` SKILL.md loads `_shared/verification-discipline.md` and invokes `om-pre-handoff-gate` at end of Phase 5 (Summary)
- `om-cto` SKILL.md loads `_shared/verification-discipline.md`

### Source
This release addresses 4 patterns identified in the PRM App Spec postmortem (2026-04-17 → 2026-04-27): reader-experience meta-fail, verification lies under pressure, missing migration awareness, and post-major-edit cleanup gaps. See `docs/superpowers/specs/2026-04-29-skill-quality-gates-design.md` for the full design.

### Out of release scope
Upstream PR to `open-mercato/open-mercato` adding `verification-discipline.md` + gate invocation to synced skills (`om-spec-writing`, `om-code-review`, `om-implement-spec`) is a separate workstream.

## 1.6.0
```

- [ ] **Step 2: Verify CHANGELOG**

Run: `head -25 /Users/maciejgren/Documents/om-superpowers/CHANGELOG.md`
Expected: top of file shows `## 1.7.0` with Added/Changed/Source/Out-of-scope sections

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): add 1.7.0 section — skill quality gates"
```

---

### Task 18: Bump version 1.6.0 → 1.7.0 in package.json + plugin.json

**Files:**
- Modify: `package.json`
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Bump `package.json`**

Use `Edit` with:

`old_string`: `"version": "1.6.0",`
`new_string`: `"version": "1.7.0",`

- [ ] **Step 2: Bump `.claude-plugin/plugin.json`**

Use `Edit` with:

`old_string`: `"version": "1.6.0",`
`new_string`: `"version": "1.7.0",`

- [ ] **Step 3: Verify both bumped**

Run:
```bash
grep version /Users/maciejgren/Documents/om-superpowers/package.json
grep version /Users/maciejgren/Documents/om-superpowers/.claude-plugin/plugin.json
```
Expected: both show `"version": "1.7.0",`

- [ ] **Step 4: Commit**

```bash
git add package.json .claude-plugin/plugin.json
git commit -m "chore: bump version 1.6.0 → 1.7.0 (skill quality gates)"
```

---

### Task 19: Final smoke check + tag

**Files:** none (read-only verification)

- [ ] **Step 1: List all changes**

```bash
cd /Users/maciejgren/Documents/om-superpowers
git log --oneline 7c10ccc..HEAD
```
Expected: ~13-15 commits covering Phases A through G.

- [ ] **Step 2: Verify all new files exist**

```bash
test -f skills/_shared/verification-discipline.md
test -f skills/om-pre-handoff-gate/SKILL.md
test -f skills/om-pre-handoff-gate/references/cold-reader-checklist.md
test -f skills/om-pre-handoff-gate/references/residual-oq-patterns.md
test -f skills/om-pre-handoff-gate/references/redundancy-checks.md
test -f skills/om-pre-handoff-gate/references/verdict-template.md
test -f tests/fixtures/spec-A-lineage-as-section-zero.md
test -f tests/fixtures/spec-B-open-questions-and-tbds.md
test -f tests/fixtures/spec-C-monolith-with-subspecs/app-spec.md
test -f tests/fixtures/input-docs-D-no-migration-context.md
test -f tests/validation-2026-04-30.md
echo "All files present"
```
Expected: `All files present` (no test failures).

- [ ] **Step 3: Verify modifications applied**

```bash
grep -q "_shared/verification-discipline.md" skills/om-product-manager/SKILL.md && echo "PM patched"
grep -q "_shared/verification-discipline.md" skills/om-cto/SKILL.md && echo "CTO patched"
grep -q "Pre-Discovery" skills/om-product-manager/SKILL.md && echo "Phase 0 §0 added"
```
Expected: 3 lines confirming patches.

- [ ] **Step 4: Tag release (DO NOT push without user approval)**

```bash
git tag -a v1.7.0 -m "Release 1.7.0 — skill quality gates"
git tag --list 'v1.7.0'
```
Expected: tag created locally.

- [ ] **Step 5: Report to user**

Report:
- All 19 tasks complete
- 4 new files in `skills/_shared/` and `skills/om-pre-handoff-gate/`
- 4 fixtures in `tests/fixtures/`
- 1 validation log
- 3 SKILL.md files patched (`om-product-manager`, `om-cto`)
- Version bumped to 1.7.0
- Tag `v1.7.0` created locally (not pushed)
- Validation results in `tests/validation-2026-04-30.md`

Ask user:
- Whether to push the tag and main branch
- Whether to start drafting upstream PR for synced skills (separate workstream)
- Whether to begin real-world dogfood on next App Spec

---

## Self-Review Notes

After writing this plan, run a self-review:

**1. Spec coverage:**
- ✅ Pattern A — Cold-reader pass implemented in `cold-reader-checklist.md` (Task 7), validated by fixture A (Task 2, 15)
- ✅ Pattern B — Verification discipline in `_shared/verification-discipline.md` (Task 1), loaded by 3 skills (Tasks 13, 14, 11)
- ✅ Pattern C — Phase 0 §0 patched (Task 12), validated by fixture D (Tasks 5, 16)
- ✅ Pattern D — Residual-OQ + redundancy in references (Tasks 8, 9), validated by fixtures B, C (Tasks 3, 4, 15)
- ✅ Strategy I — local-first; upstream PR explicitly out of scope, documented in CHANGELOG and Done means

**2. Placeholder scan:** None — all file content shown in full, all commands have expected outputs.

**3. Type consistency:** Reference filenames consistent across tasks (`cold-reader-checklist.md`, `residual-oq-patterns.md`, `redundancy-checks.md`, `verdict-template.md`). Verb naming consistent (`om-pre-handoff-gate` not `pre-handoff-gate-skill`).

**4. Done means** — single sentence per criterion, all met by Tasks 1-19.
