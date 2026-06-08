---
project: appt-demo
generated: 2026-06-08
phase: 1-scoped
total_epics: 1
total_stories: 4
coverage_categories:
  - error-path
  - permission-abuse
  - concurrency
  - nfr-multitenancy
  - nfr-gdpr
  - nfr-audit
---

# Gap Analysis — Appointment Demo (complete fixture)

> Expect `bin/gap-checklist-gate` → exit 0: every category is a real story ref or an explicit out-of-scope.

## Epic 1: Appointment booking
**Goal**: a patient can book, and the hard paths are accounted for.
**Business value**: fills the calendar without silent gaps.

#### Coverage
- error-path: Story 1.2
- permission-abuse: Story 1.3
- concurrency: Story 1.4
- nfr-multitenancy: Story 1.3
- nfr-gdpr: out-of-scope: no PII beyond name/slot is stored for v1; client confirmed
- nfr-audit: out-of-scope: audit deferred to phase 2 of the engagement; client confirmed

### Story 1.1: Book an appointment
- **Description**: as a patient, I want to book an appointment so that I secure a slot.
- **Acceptance criteria**:
  - [ ] patient selects a free slot and confirms
- **Status**: pending

### Story 1.2: Handle booking failures
- **Description**: as a patient, I see a clear error when a slot is taken or the booking fails.
- **Acceptance criteria**:
  - [ ] slot-taken and system-error paths show actionable messages
- **Status**: pending

### Story 1.3: Enforce who can book for whom
- **Description**: as the clinic, only authorized roles book on a patient's behalf; tenants are isolated.
- **Acceptance criteria**:
  - [ ] permission denial on cross-patient/cross-tenant booking
- **Status**: pending

### Story 1.4: Prevent double-booking under concurrency
- **Description**: as the clinic, two concurrent bookings for the same slot cannot both succeed.
- **Acceptance criteria**:
  - [ ] concurrent booking of one slot yields exactly one winner
- **Status**: pending
