---
project: appt-demo
generated: 2026-06-08
phase: 1-scoped
total_epics: 1
total_stories: 4
# NO coverage_categories declared — gate must FAIL CLOSED (exit 1), not pass.
# Regression fixture for the v1.19.0 fail-open bug (docs/specs/2026-06-08-i024-gate-failopen-fix.md).
# Note: the epic below DOES carry a full coverage block; the point is that with no
# declared category set, completeness is unverifiable, so it must not pass.
---

# Gap Analysis — Appointment Demo (no-categories fixture)

> Expect `bin/gap-checklist-gate` → exit 1: precondition (declared categories) missing.

## Epic 1: Appointment booking
**Goal**: a patient can book.
**Business value**: fills the calendar.

#### Coverage
- error-path: Story 1.2
- permission-abuse: Story 1.3
- concurrency: Story 1.4
- nfr-multitenancy: Story 1.3
- nfr-gdpr: out-of-scope: no PII beyond name/slot in v1; client confirmed
- nfr-audit: out-of-scope: deferred to phase 2; client confirmed

### Story 1.1: Book an appointment
- **Status**: pending

### Story 1.2: Handle booking failures
- **Status**: pending

### Story 1.3: Enforce who can book for whom
- **Status**: pending

### Story 1.4: Prevent double-booking under concurrency
- **Status**: pending
