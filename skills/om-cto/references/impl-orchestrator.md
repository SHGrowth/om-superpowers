# Implementation Orchestrator Mode

When the user approves the specs and execution plan, Piotr coordinates implementation. Autonomous per-spec with user checkpoint between specs.

## Per-spec loop

For each spec in execution plan order:

### Step 1 — Dispatch implementation

Invoke the base `implement-spec` skill (or `auto-create-pr` for PR-based delivery) with:
- The functional spec file path
- The dispatch context below

The implementation skill will auto-invoke domain skills as needed:
- `module-scaffold` (new module creation)
- `data-model-design` (entity work)
- `system-extension` (UMES extensions)
- `backend-ui-design` (UI pages)
- `troubleshooter` (if verification fails)
- `code-review` (auto-chain after verification)
- `integration-tests` (write AND run)

### Step 2 — Verify completion

Confirm the implementation completed the full pipeline:
- Implementation done
- Unit tests: written and passing
- Integration tests: written, executed, and passing
- Code review: passed (Critical/High findings fixed)
- Spec updated with implementation status

If implementation reports blockers, Piotr diagnoses and resolves them before proceeding.

### Step 3 — Checkpoint with user

> "Spec N/M done: {Feature Name}.
> - Tests: X/X green
> - Code review: passed
> - Feature is live on localhost:3000
>
> Please test the feature. When ready:
> - **'next'** → I proceed to Spec N+1
> - **Any feedback** → I triage it (code bug / spec gap / business change) and handle accordingly"

### Step 3.5 — Proxy pre-triage

Before presenting feedback triage to the user, invoke `om-user-proxy` with the findings. The proxy can resolve:
- **Code bugs** — always fixable without user input (proxy resolves: "fix it")
- **Spec gaps** where the answer is in the app spec — proxy resolves with citation

The proxy escalates:
- **Business changes** — always needs user judgment
- **Spec gaps** where the answer is NOT in the app spec or lessons

### Step 4 — Triage user feedback

Every piece of user feedback (bug report, change request, observation) MUST be triaged before acting. The feedback may indicate a code bug, a spec gap, or a business requirement change — each requires a different response.

**Triage process:**

1. **Piotr classifies** the feedback into one of three levels:

| Level | Meaning | Example | Action |
|---|---|---|---|
| **Code bug** | Implementation doesn't match the spec | "Button doesn't save" / "Wrong API response" | Fix code, re-verify, re-checkpoint. No spec changes. |
| **Spec gap** | Spec is missing a scenario or detail the user expected | "What about bulk invite?" / "This should also notify by email" | Update the functional spec, re-implement affected parts, re-verify, re-checkpoint. |
| **Business change** | The underlying business requirement changed or was misunderstood | "Actually partners should NOT see this" / "We need a different workflow" | **Escalate to the user.** Present the change, ask the user to update the App Spec (or confirm the update), then Piotr re-runs Spec Orchestrator for affected specs. |

2. **If Piotr is unsure** whether it's a spec gap or business change, he **asks the user** to classify. Present both interpretations and let the user decide.

> **No autonomous re-dispatch to om-product-manager.** Business changes surface to the user, who decides whether to re-engage Cagan for a full App Spec revision or handle it as a scoped update. This prevents circular om-cto ↔ om-product-manager loops.

3. **After triage:**
   - Code bug → Piotr fixes autonomously
   - Spec gap → Piotr updates the functional spec, then re-implements
   - Business change → User confirms App Spec update → Piotr re-runs spec writing for affected specs → user re-reviews → Piotr re-implements

This ensures the App Spec and functional specs stay in sync with reality. Specs are living documents, not throwaway artifacts.

## After all specs complete

> "All N specs implemented and tested.
> - Total tests: X green
> - All code reviews: passed
>
> Ready to commit/push the full feature set, or would you like to review anything?"

---

## Dispatch Context: Implementation

When dispatching the base `implement-spec` skill from this orchestrator, pass this context:

- **Pipeline lock:** The full pipeline MUST be followed — Plan → Implement → Unit Tests → Integration Tests (run them!) → Docs → Self-Review → Update Spec → Verification → Code Review → Commit. No steps skipped. No early exit.
- **Subagent mode:** Technical decisions are in the spec's `## Technical Approach` section. Do NOT ask Extension Mode Decision — Piotr already decided.
- **Proxy gate:** For standalone extension-vs-core decisions, invoke `om-user-proxy` before asking the user.

## Dispatch Context: Code Review

When dispatching the base `code-review` skill from this orchestrator, pass this context:

- **CI/CD verification gate (MANDATORY):** Run the same checks CI runs — typecheck, unit tests, i18n, build. Every gate MUST pass before the review can conclude.
- **Template parity gate:** Run `yarn template:sync`. If drift is reported, invoke `om-user-proxy` before asking the user. The proxy resolves "yes, sync" if the drift is in files the current changes touch.
- **Backward compatibility gate:** Check every change against `BACKWARD_COMPATIBILITY.md`. Flag any violation as Critical.
- **Proxy gate:** Before presenting findings to user, run through `om-user-proxy`.
