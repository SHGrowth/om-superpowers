---
project: dental-demo
generated: 2026-06-08
phase: 1-scoped
coverage_categories:
  - error-path
  - permission-abuse
  - concurrency
  - nfr-multitenancy
  - nfr-gdpr
  - nfr-audit
  - clinical-data-retention
---
<!-- A domain-declared 7th category (clinical-data-retention) is left unaddressed,
     AND the coverage block exercises a fabricated story ref and a reasonless out-of-scope.
     Expect exit 1 flagging all three. No inline `#` comments — the gate parses literally. -->

# Gap Analysis — 7th category + malformed coverage

## Epic 1: Patient intake
#### Coverage
- error-path: Story 9.9
- permission-abuse: out-of-scope:
- concurrency: Story 1.2
- nfr-multitenancy: Story 1.2
- nfr-gdpr: out-of-scope: anonymized at rest; confirmed
- nfr-audit: Story 1.3

### Story 1.1: Intake form
- **Status**: pending
### Story 1.2: Tenant + concurrency handling
- **Status**: pending
### Story 1.3: Audit trail
- **Status**: pending
