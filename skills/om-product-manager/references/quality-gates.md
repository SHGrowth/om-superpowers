# Quality Gates — Examples & Methodology

Reference material for Cagan's quality enforcement. Loaded on-demand during spec writing.

## Kill Vague Rules

| Vague | Why it's dangerous | Specific |
|-------|-------------------|----------|
| "Admin manages team" | What does "manage" mean? | "Admin invites by email, assigns role. Cannot delete users." |
| "System tracks WIP" | Who creates the data? | "BD creates deal in CRM. System counts deals in SQL+ stage per org per month." |
| "Tiers are evaluated" | By whom, when, based on what? | "Monthly scheduled job compares WIC+WIP+MIN against 4 threshold sets. PM approves changes." |

## Kill Vague ROI

| Vague ROI | Specific ROI |
|-----------|-------------|
| "OM benefits from pipeline" | "Each active agency generates avg 5 WIP/month = 5 new prospects in OM's pipeline" |
| "Agency gets visibility" | "AI-native tier = 2x higher match score = estimated 3x more RFP invitations/quarter" |
| "Better governance" | "Automated tier review saves PM 4h/week of manual spreadsheet work" |

If you can't quantify the ROI, the workflow might not be worth building.

## Kill Happy-Path-Only Stories

| Happy-path-only | Complete |
|----------------|----------|
| "BD submits RFP response. Success: PM sees it in comparison table." | "BD submits RFP response. **Happy:** PM sees it in comparison table, linked to case studies. **Alternate:** BD saves draft, resumes later — draft visible only to BD. **Failure:** BD submits with missing required fields → inline validation, no submission. BD submits after deadline → rejected with clear message, no partial state." |
| "Admin invites colleague by email. Success: colleague sets password, sees dashboard." | "Admin invites colleague. **Happy:** colleague receives email, sets password, sees scoped dashboard within 24h. **Alternate:** colleague already has account in another org → merge prompt, not duplicate. **Failure:** invalid email → rejected at form. Colleague never clicks link → invite expires after 7 days, admin sees 'pending' status." |
| "System imports KPI data. Success: dashboard updates." | "System imports KPI data. **Happy:** dashboard updates within 1 minute. **Alternate:** partial import (some rows valid, some not) → valid rows imported, invalid rows listed in error report, admin notified. **Failure:** import file malformed → rejected entirely, previous data unchanged, admin sees error with line numbers." |

## Cross-Story Impact Analysis — Methodology

### Impact Matrix

| Story | State changed | Stories affected | Impact | Mitigation |
|-------|--------------|-----------------|--------|------------|
| _example:_ US-01 | Agency tier upgraded | US-04 (benefits recalc), US-07 (match score changes) | Benefits and match score must update atomically or user sees stale data | Domain event `AgencyTierChanged` triggers downstream recalcs |
| _example:_ US-03 | BD leaves organization | US-02 (WIP count drops), US-05 (open deals orphaned) | Orphaned deals have no owner, WIP metrics inaccurate | Reassignment workflow required before removal completes |

### Conflict Patterns to Watch For

- **Race conditions:** Two stories modify the same entity — which wins? (e.g., manual tier override vs. automated evaluation)
- **Cascade storms:** Story A triggers event → Story B reacts → triggers event → Story C reacts → unbounded chain
- **Stale preconditions:** Story assumes state X, but Story Y changed it minutes ago (e.g., "user sees tier benefits" after downgrade but cache hasn't cleared)
- **Orphaned references:** Story deletes/archives an entity that other stories reference (e.g., removing a metric type that active tier rules depend on)
- **Timing gaps:** Story A and Story B are both correct individually, but the time between them creates an inconsistent window (e.g., tier changed but notifications haven't sent — user acts on stale info)

### If the Impact Matrix Reveals

- **Missing stories** (e.g., "we need a reassignment workflow") → add them before proceeding
- **Contradictions** (e.g., two stories can't both be true) → resolve them, don't defer as open questions
- **Missing domain events** (e.g., no event connects Story A's state change to Story B's reaction) → add them to the domain model
