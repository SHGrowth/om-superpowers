---
project: appt-demo
generated: 2026-06-08
phase: 1-scoped
coverage_categories:
  - error-path
  - permission-abuse
  - concurrency
  - nfr-multitenancy
  - nfr-gdpr
  - nfr-audit
---

# Gap Analysis — Multi-epic, one epic incomplete

> Expect exit 1 naming Epic 2 only (Epic 1 is complete).

## Epic 1: Appointment booking
#### Coverage
- error-path: Story 1.2
- permission-abuse: Story 1.3
- concurrency: Story 1.4
- nfr-multitenancy: Story 1.3
- nfr-gdpr: out-of-scope: no PII in v1; confirmed
- nfr-audit: out-of-scope: deferred; confirmed

### Story 1.1: Book
- **Status**: pending
### Story 1.2: Booking failures
- **Status**: pending
### Story 1.3: Permissions + tenant isolation
- **Status**: pending
### Story 1.4: Concurrency
- **Status**: pending

## Epic 2: Billing
**Goal**: invoice a visit.

#### Coverage
- error-path: Story 2.2
<!-- permission-abuse, concurrency, and all NFR categories intentionally absent -->

### Story 2.1: Create invoice
- **Status**: pending
### Story 2.2: Handle payment failure
- **Status**: pending
