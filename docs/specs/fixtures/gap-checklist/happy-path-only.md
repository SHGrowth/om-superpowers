---
project: appt-demo
generated: 2026-06-08
phase: 1-scoped
total_epics: 1
total_stories: 1
coverage_categories:
  - error-path
  - permission-abuse
  - concurrency
  - nfr-multitenancy
  - nfr-gdpr
  - nfr-audit
---

# Gap Analysis — Appointment Demo (happy-path-only fixture)

> Expect `bin/gap-checklist-gate` → exit 1: the epic has no coverage for any category.

## Epic 1: Appointment booking
**Goal**: a patient can book an appointment.
**Business value**: fills the calendar.

### Story 1.1: Book an appointment
- **Description**: as a patient, I want to book an appointment so that I secure a slot.
- **Acceptance criteria**:
  - [ ] patient selects a free slot and confirms
- **Source**: inputs/transcript.txt:12
- **Priority**: P0
- **Dependencies**: none
- **Status**: pending

#### Coverage
<!-- Intentionally empty — this is the happy-path-only failure fixture. -->
