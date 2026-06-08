# Fix: `bin/gap-checklist-gate` fails OPEN on missing `coverage_categories`

**Date:** 2026-06-08
**Status:** One blocker from the v1.19.0 round review (`feat/i023-i024-gap-analysis`). Everything else passed; this is the only required change. Self-contained — runnable repro + acceptance below. Leave the fixtures in place.
**Severity:** Medium (a real bypass of the completeness gate).

## The bug

When the MD frontmatter has no `coverage_categories` block (or an empty one), the gate's "for each declared category" loop is **vacuously satisfied** and returns **exit 0**. So any MD that omits the category list — an old template, a hand-edit, an orchestrator that didn't write it — **bypasses the completeness gate entirely** and proceeds to Phase 2 with zero checking.

This is the exact "garbage-in → green gate, looks complete, isn't" failure I024 exists to prevent, and it contradicts the sibling gate's discipline: `bin/gap-validate-finding` **fails closed** when its precondition (`--story`) is absent. This gate must do the same with its precondition (declared categories). Relying on "the Phase-1 template always writes the list" is the prose-doesn't-bind assumption the gate exists to remove.

## Repro (verified)

```bash
# complete.md with the coverage_categories frontmatter block stripped:
awk 'BEGIN{skip=0} /^coverage_categories:/{skip=1;next} skip&&/^  - /{next} skip&&!/^  - /{skip=0} {print}' \
  docs/specs/fixtures/gap-checklist/complete.md > /tmp/nofm.md
bin/gap-checklist-gate /tmp/nofm.md
# CURRENT:  GATE PASS … >>> EXIT=0      <-- wrong: vacuous pass / bypass
```

## The fix

In `bin/gap-checklist-gate`: if **zero categories are declared** (frontmatter `coverage_categories` absent or empty), **fail closed** — exit 1 with a clear message, e.g.:

```
FAIL: no coverage_categories declared in frontmatter — completeness unverifiable; Phase 1.5 incomplete
```

(Recommended: fail-closed, since it matches the sibling gate and the gate's own purpose. Acceptable alternative: default to the canonical six — `error-path, permission-abuse, concurrency, nfr-multitenancy, nfr-gdpr, nfr-audit` — and enforce those. Pick one; do **not** leave absence as a pass.)

## Acceptance

1. **The repro above returns non-zero** (not a vacuous pass). Add it as a permanent fixture — `docs/specs/fixtures/gap-checklist/no-categories.md` → exit 1.
2. **No regression** (re-run all, behavior unchanged):
   - `complete.md` → exit 0
   - `happy-path-only.md` → exit 1 (names all categories)
   - fabricated story ref (`Story 9.9`) → exit 1 ("not in the MD")
   - `out-of-scope:` with empty/whitespace reason → exit 1
   - blank category value → exit 1
   - multi-epic where one epic is happy-path-only → exit 1 naming that epic
   - a declared 7th category left unaddressed → exit 1

## Not in scope (do NOT change as part of this)

- `bin/gap-validate-finding` — untouched, verified.
- The fuzzy-`gh` false-contradiction rate (review #4) and the "non-empty reason ≠ good reason" semantic gap — these are **measurement** questions for the first real engagement, not code changes.
