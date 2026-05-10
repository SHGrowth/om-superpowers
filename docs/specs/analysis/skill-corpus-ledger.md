# Skill-corpus ledger

Longitudinal record of skill-corpus health. One row per audit. Re-run the queries from [`ANALYSIS-2026-05-10-skill-corpus-audit.md`](ANALYSIS-2026-05-10-skill-corpus-audit.md) (Methodology + Reproducible queries sections) on a 60-day cadence and append a row.

## Audits

| Date | Window | Top-level skills | Description chars | Skills demoted | Skills deleted | Notes |
|---|---|---|---|---|---|---|
| 2026-05-10 | 30d | 11 | 3,031 | 7 (om-user-proxy, om-spec-writing, om-module-scaffold, om-data-model-design, om-system-extension, om-integration-builder, om-backend-ui-design) | 1 (om-orchestrate) | v1.16.0 baseline. See `ANALYSIS-2026-05-10-skill-corpus-audit.md`. |

## Promotion candidates

If a skill in `references/` ever shows a sustained spike in `Skill` invocations across two consecutive audits, promote it back to top-level. None outstanding.

## Methodology drift

Note any change to the audit method (new channel, different window, different mining query) so historical rows are interpretable.

| Date | Change |
|---|---|
| 2026-05-10 | Methodology established: two-channel (Skill invocations + Read activity), 30-day window, all `~/.claude/projects/` sessions. |
