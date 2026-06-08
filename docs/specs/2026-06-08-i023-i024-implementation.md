# Implement I023 (delete the magic 5) + I024 (structural completeness gate) — gap-analysis batch mode

**Date:** 2026-06-08
**For:** the implementer session in this repo. Self-contained — every part has a runnable acceptance check. **Prerequisite: PR #6 (v1.18.0) must be merged first** — both changes edit `skills/om-cto/references/gap-analysis-batch.md`, which only exists on that branch. Branch off updated `main` after the merge.
**Reviewer loop:** when done, the change gets a round review (the reviewer *runs* the gates + acceptance below, doesn't read the diff). Leave the seeded fixtures/repros in place.
**Do NOT** touch the verified-good v1.18.0 gate (`bin/gap-validate-finding`) behavior — these two changes sit *around* it, not inside it.

---

## Part 1 — I023: delete the hand-rolled "batches of 5" (NO framework)

**Change (one edit to `gap-analysis-batch.md` Phase 2):** replace "batch the pending stories into groups of 5 … wait for all 5" with **dispatch all `pending` investigation subagents in a single Task-tool message.** The Task tool already bounds its own concurrency; the magic 5 buys nothing.

**Keep exactly as-is:** grounding stays a **sequential orchestrator drain** through `bin/gap-validate-finding` — one `gh` caller, the I019 rate invariant. Do not parallelize grounding.

**Explicitly out of scope — do NOT do these:**
- Do **not** adopt the `Workflow` primitive for this (attended) path. (It was the original I023 draft; it was wrong — `pipeline()` can't serialize a single stage, and the Workflow script sandbox has no Bash so it can't call the gate. Reserved for a future *headless* scan only.)
- Do **not** claim this makes serialization "structural." It's still the sequential drain (prose-bound); that's an accepted, separate item.

**Acceptance (runnable):**
1. `grep -nE "groups of 5|batch into|of 5|wait for all 5" skills/om-cto/references/gap-analysis-batch.md` → **zero hits.**
2. The Phase-1 → `/clear` → Phase-2 interactive shape is unchanged (no `Workflow` opt-in introduced); grounding is still described as a sequential single-`gh`-caller drain.

---

## Part 2 — I024: structural pre-Phase-2 completeness gate (a SCRIPT, not prose)

**The hole:** Phase 1 builds whatever stories the docs imply; a happy-path-only tree produces a confident-looking backlog that silently omits the hard 20%. Phase 1 only *mentions* NFRs — and a mention doesn't bind (`feedback_text_channel_does_not_bind`, N=17). **So the fix must be structural, mirroring `bin/gap-validate-finding` one layer up — NOT a prose "remember to check" instruction.** A prose gate here reintroduces the exact failure it's meant to close; that is the one way to get this wrong.

**Ship three things:**

### 2a. A machine-checkable per-epic coverage schema in the MD
Extend the Phase-1 MD template so every epic carries a coverage block a script can parse — each of a **fixed 6-category checklist**, satisfied one of two ways:

| Category (fixed) | Satisfied by |
|---|---|
| Error / failure path | a `pending` story ref **or** `out-of-scope: <reason>` |
| Permission / abuse / negative case | a `pending` story ref **or** `out-of-scope: <reason>` |
| Concurrency / race | a `pending` story ref **or** `out-of-scope: <reason>` |
| NFR: multi-tenancy | a `pending` story ref **or** `out-of-scope: <reason>` |
| NFR: GDPR / data-retention | a `pending` story ref **or** `out-of-scope: <reason>` |
| NFR: audit | a `pending` story ref **or** `out-of-scope: <reason>` |

Exact markup is yours, constrained by: a single deterministic `grep`/parse must decide, per epic, whether each category is in a valid state. The list is **fixed per run** but **extensible per domain** (a dental run may add "clinical-data retention") — make the category list a declared set the script reads, not hard-coded magic.

### 2b. `bin/gap-checklist-gate <md-file>` — the structural gate
Sibling to `bin/gap-validate-finding`. Exit codes:
- `0` — every epic has all categories in a valid state (story ref or explicit `out-of-scope: <reason>`). Phase 2 may start.
- `1` — at least one epic has a category in neither state. Print which epic + which category. Phase 2 must NOT start.

### 2c. Wire Phase 2 to call it, and PM to populate
- In `gap-analysis-batch.md`, between Phase 1 (tree built) and `/clear` → Phase 2: the orchestrator runs `bin/gap-checklist-gate <md>` and **refuses to proceed on exit 1.**
- The *populator* is `om-product-manager` (delegate — do not author story-critique logic inside the reference): PM proposes the missing stories or the `out-of-scope` reasons for each flagged category. PM populates; the **script** binds.
- Record the **known limitation** in the reference (mirror `gap-validate-finding`'s scope-honesty): a green checklist means "these six dimensions are addressed," **not** "the tree is complete." A dimension not on the list (i18n, data-migration, observability) passes untouched — the price of decidability. Extend the list per domain when needed.

**Acceptance (runnable):**
1. **Blocks happy-path-only:** seed an MD with one epic "Appointment booking" / one positive story / no coverage for error-path, permission, concurrency. `bin/gap-checklist-gate <md>` → **exit 1**, naming the unaddressed categories.
2. **Passes complete input (no-op, no padding):** seed an MD whose epic addresses all six categories (mix of story refs and `out-of-scope: <reason>`). `bin/gap-checklist-gate <md>` → **exit 0**, no changes demanded.
3. **Grep invariant after populate:** after the PM populate step, no epic has any of the six categories in neither state (the same check the gate enforces).
4. **Populate ≠ duplicate:** the added stories / out-of-scope reasons come from an `om-product-manager` invocation, not net-new authoring logic embedded in `gap-analysis-batch.md`.
5. **Phase 2 refuses on exit 1:** the reference's Phase-2 entry is gated on `bin/gap-checklist-gate` returning 0 — not a prose "remember to check."

---

## Definition of done

1. Part 1: `grep` for the magic 5 → zero; grounding still a sequential single-`gh`-caller drain; no `Workflow` introduced.
2. Part 2: `bin/gap-checklist-gate` exists and is structural (exit 0/1); acceptance 1–2 pass by running it; Phase 2 is wired to refuse on exit 1; PM is the populator; the known-limitation note is in the reference.
3. The v1.18.0 gate (`bin/gap-validate-finding`) is untouched and its REPRO1–3 + 6-block checks still pass.
4. Leave this file and any seeded fixtures in place for the round review.

**The single thing that fails the review:** if I024's gate is enforced by prose instead of `bin/gap-checklist-gate` (exit-code) — that's the N=17 failure reintroduced, and it does not ship.
