# Changelog

## 1.20.0 — gap-analysis batch mode: channel-layer grounding preflight (I036)

A third structural gate for the batch mode, alongside the verdict gate (`gap-validate-finding`, I019) and the intake gate (`gap-checklist-gate`, I024). Source spec: `agents-master/improvements/I036.md`. The two existing gates are **untouched**.

### Added — `bin/gap-grounding-preflight`, run before Phase 2 dispatches anything

The verdict gate re-runs each cited `gh search code` query and trusts the result. But an **empty** result is ambiguous — it means *either* "the code genuinely isn't there" *or* "the channel is dead" (gh unauthed / no repo access / repo renamed / search down). `gh search code` against an inaccessible or nonexistent repo **exits 0 with no output** — not an error (verified: `open-mercato/<bogus>` → `rc=0`, empty). So a dead channel makes every `❌ Missing` self-confirm (no hits ⇒ "missing" confirmed) and the gate **passes a silently false all-Missing backlog**. Nothing downstream catches it. Phases 1 + 1.5 never touch `gh`, so without a preflight the first symptom is the whole Phase-2 fan-out grinding to `needs-review` (loud case) or a confident wrong backlog (silent case).

- **New `bin/gap-grounding-preflight`** (sibling of the two gates, exit 0/1/2): probes `gh search code` against `open-mercato/open-mercato` with a **known-present control term** (`open-mercato`, overridable via `GAP_PREFLIGHT_TERM`). **exit 0** = control found, channel live; **exit 1** = gh missing/permanent-error, or the control returned no hits (the dead-channel state); **exit 2** = transient (rate-limit) → wait and re-run. The control term is the load-bearing idea: an empty answer to a query whose answer is *known* to be non-empty proves the channel is dead, not the code — the one thing the per-finding gate structurally cannot tell.
- **Phase-2 wiring:** the preflight is now the first action in Phase 2 and a hard precondition (alongside the Phase-1.5 completeness gate). Phase 2 dispatches nothing on a non-zero preflight.
- **Actionable on failure:** every non-zero exit prints the concrete fix for the cause it hit (`gh auth login`; check repo visibility; set `OM_REPO` if renamed; set `GAP_PREFLIGHT_TERM` if the control word changed; transient → wait ~60s). Phase 2's Step 0 tells the orchestrator to relay that stderr to the user verbatim — detection without a next command is useless to the human running the skill.
- **Scope honesty (mirrors the sibling gates):** a green preflight proves the channel answers and the repo is reachable — not that any individual verdict is correct (that stays the per-finding gate's job, with its own named holes).

### Verification

`bin/gap-grounding-preflight` → exit 0 against the real repo; `OM_REPO=open-mercato/<bogus> bin/gap-grounding-preflight` → exit 1 (control returns no hits — the silent-empty case); `gh` absent from PATH → exit 1. All three verified live. The two existing gates' diffs are empty.

## 1.19.0 — gap-analysis batch mode: drop the hand-rolled batching (I023) + structural completeness gate (I024)

Two follow-ups to v1.18.0's batch mode, both implemented against `docs/specs/2026-06-08-i023-i024-implementation.md`. Source specs: `agents-master/improvements/I023.md`, `I024.md`. The v1.18.0 verdict gate (`bin/gap-validate-finding`) is **untouched** — these changes sit around it.

### Changed — I023: delete the "batches of 5" (no framework)

Phase 2 dispatched investigation subagents in hand-counted groups of 5 — a self-imposed concurrency cap the Task tool already enforces. Replaced with **dispatch all `pending` subagents in one Task-tool message**. Grounding is unchanged: still a **sequential single-`gh`-caller drain** (the I019 rate invariant — the one thing that must not regress). No `Workflow` primitive adopted: the original I023 draft proposed it but the review found two blocking facts about the primitive (`pipeline()` has no per-stage barrier so it can't serialize grounding; the Workflow script sandbox has no Bash so it can't call the gate). `Workflow` is reserved for a future unattended/headless scan only.

### Added — I024: `bin/gap-checklist-gate`, a structural pre-Phase-2 completeness gate

A happy-path-only story tree produced a confident, complete-*looking* backlog that silently omitted the hard 20% (error paths, permission/abuse, concurrency, NFRs). Phase 1 only *mentioned* NFRs, and a mention does not bind (`feedback_text_channel_does_not_bind`, N=17). So completeness is now enforced **structurally — the I019 gate one layer up, at the intake instead of the verdict**:

- **New `bin/gap-checklist-gate <md>`** (sibling of `gap-validate-finding`, exit 0/1/2): every epic must address each category in the MD's `coverage_categories` list, satisfied by either a real `Story <id>` reference **or** `out-of-scope: <reason>`. A blank category, a reasonless `out-of-scope:`, or a reference to a story not in the MD all **fail** — the gate checks the goal, not a presence proxy. The category set is read from the MD frontmatter (extensible per domain). If that list is **absent or empty the gate fails closed (exit 1)** — a stripped or old MD must not silently bypass completeness, mirroring how `gap-validate-finding` fails closed on a missing `--story` (fixed in round review — `docs/specs/2026-06-08-i024-gate-failopen-fix.md`). The parser is literal: no inline `#` comments on `coverage_categories` / coverage lines (HTML `<!-- -->` comments are fine).
- **New MD schema:** Phase-1 frontmatter declares `coverage_categories`; every epic carries a `#### Coverage` block the gate parses.
- **Phase 1.5 wiring:** `om-product-manager` *populates* the coverage blocks (delegate — no story-critique logic added to the reference); `bin/gap-checklist-gate` *binds*. Phase 2 must not start, and the orchestrator must not `/clear`, until the gate returns 0.
- **Scope honesty (mirrors `gap-validate-finding`):** a green checklist means the *declared dimensions* are addressed, not that the tree is complete. A dimension off the list (i18n, data-migration, observability) passes untouched — the price of decidability. The reference records this, and says: extend the list, don't replace the gate with prose.

The single thing that would have failed review — enforcing I024 with prose instead of an exit-code gate (reintroducing the N=17 failure) — is avoided: the binding surface is the script.

### Verification

Fixtures in `docs/specs/fixtures/gap-checklist/`: `happy-path-only.md` → `bin/gap-checklist-gate` exit 1 (names the unaddressed categories); `complete.md` → exit 0. Part-1 grep (`groups of 5|batch into|of 5|wait for all 5`) over the reference → zero. `git diff` shows `bin/gap-validate-finding` unchanged; its REPRO1–3 + 6-block checks still pass.

## 1.18.0 — om-cto Batch Gap Analysis mode (folded from a candidate standalone skill)

### Added — a fourth om-cto mode for multi-document engagement scoping

A candidate standalone `gap-analysis` skill (`~/Downloads/gap-analysis/`, 3 files) answered the same question om-cto already answers — *client requirements vs. what Open Mercato already provides* — but in a different shape: batch / multi-story / file-persisted, versus Advisory's interactive / single-question shape. Rather than ship it as a 12th top-level skill, v1.18.0 **folds its distinctive machinery into `om-cto`** as a fourth mode. Net surface change: **+1 reference, +1 bin script, +0 top-level skills** — honoring the surface-budget rule and the v1.16.0 `om-orchestrate` deletion precedent. Source spec: `agents-master/improvements/I019.md`.

**New reference** `skills/om-cto/references/gap-analysis-batch.md` carries the genuinely-new machinery: doc intake → Epic/Story MD tree → batched read-only subagent verification → persisted resumable source-of-truth (`status: pending|done|needs-review`) → summary + backlog synthesis, with `/clear`-between-phases context discipline. All three candidate files are folded into this one file — which also **fixes a bug in the candidate**: its `SKILL.md` referenced `references/open-mercato-investigation.md` and `references/synthesis-templates.md`, but both sat flat in the folder root with no `references/` subdir, so the templates could never load. One file, no path bug.

**Routing:** `om-cto/SKILL.md` gains one Task-Router row, one Mode-Detection clause (a *directory* of client docs → Batch; a *single question* → Advisory, unchanged), and a Flow line. "Three modes" → "Four modes".

### Why it could not ship as-is — three conflicts resolved by the fold

1. **Currency.** The candidate measured effort in T-shirt person-days (XS–XL); om-cto standardized on **atomic-commit scores (0–5)** (`references/atomic-commits.md`). Run both and the backlogs can't merge. The folded mode inherits the atomic-commit currency; the gate rejects any leaked T-shirt size.

2. **Search source.** The candidate grepped the **local checkout** (stale/dirty/a vertical fork — it even named DentalOS). The folded mode adopts Advisory's verdict-conditional source-of-evidence rule, **tightened**: vendored `om-reference/` is for *orientation only, never a verdict*; every verdict cites live `gh search code`. This is grounded in empirical precedent — the **TagsInput drift bug** (v1.13.0), where a stale curated reference shipped a confident wrong verdict. Batch mode fans out unattended across dozens of stories, so snapshot staleness would compound silently.

3. **The I018 fabrication hole.** The candidate's subagents returned verdicts through a **pure-prose schema** with no `## Sources` rule, no no-match-must-be-cited rule, no fraction-not-percentage rule, and no enforcement outside the model loop — exactly the failure `feedback_text_channel_does_not_bind` (N=16) proved prose cannot fix.

### New — `bin/gap-validate-finding`, the structural gate (the load-bearing piece)

The candidate dispatches verification via the **Task tool**, which `bin/claude-validated` (a `claude -p` wrapper) does **not** intercept — so "run the subagents through claude-validated" is a category error. The binding check therefore lives in the **orchestrator's parse step**: a new sibling script `bin/gap-validate-finding` that each returned findings block must pass before being written to the MD. Two layers, both outside the subagent's model loop (per S011):

- **Form** — five I018-lineage regex checks, adapted to the atomic-commit currency: no percentage without `N/M`, no hedges (EN + the Polish hedges S011 surfaced), no persona labels, no leaked T-shirt size, effort present as a 0–5 score.
- **Grounding** — the orchestrator **re-runs** the subagent's cited `gh search code` query and compares the live result to the claimed verdict. A `❌ Missing` whose query returns live hits is rejected (the TagsInput trap); an empty `✅/🟡` is rejected. This is the correction the I019 review forced: a regex over the *citation string* only proves a string is present — it cannot tell a real `no match` from a hallucinated one. The re-run is the only thing that makes the staleness test pass. The script exits 0 (write) / 1 (fail → `needs-review` + re-dispatch once) / 2 (gh rate-limited → re-queue, don't penalize the verdict). Verified against live `gh`: a fabricated `❌ Missing` with a real-hit query returns exit 1; a true `❌` with a genuinely-empty query returns exit 0.

### Rate-limit discipline — not hand-waved

GitHub code search allows ~30 req/min + an undocumented secondary limiter. The orchestrator is the **single canonical caller** of `gh` for grounding (subagents only *name* the query), validates the 5 returned blocks **sequentially** (not in parallel), and the gate sleeps ~2.5s after each query (~24/min). RETRY-LATER deferrals are surfaced and marked `needs-review`, never silently sampled.

### Scope honesty — the gate is a falsifier, not a truth oracle

Recorded in the reference and the script header as known gaps, so a green run is not mistaken for "everything verified": (1) a `gh` hit proves a string matches, not that the code satisfies acceptance criteria; (2) a fabricated *live*-`✅` is accepted on shape-trust for rate budget and caught downstream at implementation. The gate **closes the stale-absence hole** (the TagsInput failure mode) and the false-`❌` half of the I018 hole; the fabrication hole is narrowed, not sealed. Spins off candidate **I020** (apply the same line-99 tightening to Advisory itself).

### Review pass — `docs/specs/2026-06-06-gap-validate-finding-review.md` (3 blockers/fixes folded in before merge)

A round-1 review ran the gate against live `gh` + crafted blocks and found three issues, now fixed (repros + a 12-case regression all green):

- **#1 verdict misparse (blocker).** The verdict `case` substring-matched `*Missing*`/`*Implemented*`, so a positive line like `✅ Implemented (no fields Missing)` classified as `missing` and got false-rejected. Fix: the **emoji is authoritative**; the verdict word is consulted only as the *leading token* of the verdict value, never as a substring of the line.
- **#2 degenerate-query self-confirm (blocker, S012).** The gate checked query↔verdict agreement — a *proxy* a subagent satisfies by naming a strawman query (`zzqxnonexistentmodule12345`) unrelated to the story. This is the `feedback_text_channel_does_not_bind` N=17/S012 failure class (a structural gate green on a proxy while silent on the goal). Fix: the gate now takes `--story <file>` and **requires** it to ground a `❌ Missing`; a `❌` whose query shares no noun token with the story title/criteria is rejected. The same token guard covers vendored positives. This closes the hole I019 §88 had deferred to "v2" on the `❌` path; what remains is the finer *too-narrow-but-related* query, which collapses into the semantic-relevance hole.
- **#3 permanent-gh / flag injection (low).** A leading-`-` grounding query parsed as a `gh` flag and a *permanent* gh failure returned `exit 2` (same as rate-limit) → infinite re-queue. Fix: leading-`-` queries are rejected in the form layer, the query is passed after `--`, and permanent `gh` failures now return `exit 1` (needs-review) — distinct from the transient `exit 2` re-queue.
- **#6 serialization (note).** `flock` is unavailable on the target shell (macOS bash 3.2); the reference now states explicitly that sequential validation is prose-bound *because it fails safe* — parallel access trips the secondary limiter → `exit 2` → re-queue, never a bad write.

The review's verified-good behaviors (live grounding re-run catching the TagsInput trap, `⚠️ Unclear` bypass, vendored-`✅` re-grounding, live-`✅` shape-trust, T-shirt/%/persona/missing-effort form rejects) were preserved and re-confirmed.

## 1.17.1 — versioned routing marker + alignment partial-execution fix + version-compare detection

### Fixed — v1.17.0's confirm-overwrite flow could leave consumers half-aligned

v1.17.0 shipped the SessionStart confirm-overwrite flow: hook offers alignment, agent runs `AskUserQuestion`, on YES the agent backs up `AGENTS.md`, reads canonical, writes canonical. In practice, observed in the first session that hit v1.17.0 in patryk-standalone: agent ran the `cp AGENTS.md AGENTS.md.bak` step and then **stopped** without performing the subsequent `Read` + `Write`. Result: `AGENTS.md.bak` and `AGENTS.md` were byte-identical (no marker on either), and on the next session the hook re-fired the offer (correctly — the marker was still missing).

Root cause: the v1.17.0 instruction block listed five steps for the Yes-flow and ended with "Continue with the user's original prompt", which was too inviting an off-ramp. The agent treated the alignment work as low-priority background and skipped to the user's actual prompt after creating the backup, never completing the overwrite.

v1.17.1 tightens the flow with three changes:

1. **Atomic execution framing** — the Yes-flow instruction now reads "These three tool calls happen back-to-back in a single agent response. Do not pause for the user, do not start work on their original prompt, until all four steps complete (or step 4 detects a problem)."
2. **Show-diff guard** — the v1.17.0 `Show diff first` option was ambiguous about whether to create the `.bak` preemptively. v1.17.1 makes it explicit: "If the user picks 'Show diff first', DO NOT create `AGENTS.md.bak` and DO NOT modify `AGENTS.md`. Read both files, present a focused diff, re-ask with only Yes/No options."
3. **Post-Write marker verification** — required step 4 now says "`Bash` `head -1 AGENTS.md` and confirm it contains `om-superpowers:routing v=<plugin-version>`. If the marker is NOT on line 1, the Write failed — investigate and retry before moving on." This catches the partial-execution case proactively rather than detecting it on the next session.

### Added — versioned marker format + version-compare detection

v1.17.0's marker (`<!-- om-superpowers:routing:v1.17.0 -->`) was a binary "this happened once" receipt. v1.17.1 promotes it into a **version pin** that the hook reconciles on every session:

**New marker format:** `<!-- om-superpowers:routing v=X.Y.Z synced=YYYY-MM-DD -->`

Both fields are stamped at canonical-generation time by `scripts/transform-agents-template.py` (today's date as ISO 8601). When a consumer aligns, they inherit both fields verbatim via the overwrite.

**Hook logic** (`hooks/session-start`):

| Consumer state | Hook behavior |
|---|---|
| No `AGENTS.md` | Initial alignment offer |
| `AGENTS.md` exists, no marker | Initial alignment offer ("likely scaffolded from older create-mercato-app or never aligned") |
| Marker `v=` matches plugin version | Silent (up to date) |
| Marker `v=` older than plugin version | Refresh offer with reason text: "aligned at plugin vX.Y.Z (synced YYYY-MM-DD); current plugin is vA.B.C — newer canonical may have updated routing rows, Critical Rules, or Mandatory Module Mechanisms" |

Refresh-offer wording differs from initial-alignment wording (different `OFFER_HEADER` + `QUESTION_TEXT`); the Yes/No/Show-diff flow is otherwise identical.

### No backward compatibility for v1.17.0-format markers

v1.17.0's marker format (`routing:v1.17.0`, no `v=` attribute syntax) is treated as "no marker" under v1.17.1's parser and triggers re-alignment. This is acceptable because zero v1.17.0 markers existed in the wild at the time of the format change — the v1.17.0 partial-execution bug prevented any successful alignment writes.

### Also fixed — silent hook crash under `set -euo pipefail` when marker absent

The marker-parsing grep (`grep -oE 'om-superpowers:routing v=[0-9.]+' AGENTS.md`) exits 1 when the marker is absent. Under `set -euo pipefail`, the pipe's leftmost non-zero exit propagates and silently killed the entire hook for consumers without a marker. Wrapped the grep in `{ ... || true; }` (same pattern already used elsewhere in the script at line 76 for the approved-specs grep) so absence resolves to an empty string instead of crashing.

This bug was caught during v1.17.1 smoke-testing when patryk-standalone (no marker) produced empty hook output instead of the expected initial-alignment offer.

### Smoke-test results

Hook tested against five scenarios — all green:

| Scenario | Marker state | Expected offer | Actual |
|---|---|---|---|
| patryk-standalone (no marker, `.ai/skills/` empty) | absent | Initial alignment | ✓ |
| `/tmp/aligned-test-1171` (marker `v=1.17.1`, plugin `v=1.17.1`) | matches | Silent | ✓ |
| `/tmp/aligned-test-1170` (marker `v=1.17.0`, plugin `v=1.17.1`) | mismatch | Refresh, reason mentions `v1.17.0 → v1.17.1` | ✓ |
| App #2 wizard (no marker, `.ai/skills/` has 19 SKILL.md) | absent | Initial alignment + Legacy warning | ✓ both |
| `~` (non-OM dir) | n/a | Hook outputs `{}` | ✓ |

### Files touched

- `hooks/session-start` — version-compare detection block (~30 lines net), tightened alignment instruction block (~40 lines rewritten), silent-crash fix (2 grep wrappers)
- `scripts/transform-agents-template.py` — marker format updated to `routing v=X.Y.Z synced=YYYY-MM-DD`; `datetime.date.today().isoformat()` stamps the synced date at generation time
- `templates/AGENTS.md` — regenerated with v1.17.1 marker (`v=1.17.1 synced=2026-05-11`); content otherwise identical to v1.17.0 canonical
- `.claude-plugin/plugin.json` — version bump 1.17.0 → 1.17.1
- `.claude-plugin/marketplace.json` — version bump 1.17.0 → 1.17.1

### Migration notes

- Consumer apps that successfully aligned under v1.17.0 (none known to exist due to the partial-execution bug, but in theory) will see a Refresh offer on next SessionStart with v1.17.1. The refresh writes the new marker format and brings them in lockstep with the current plugin version.
- Future plugin releases that ship updated `templates/AGENTS.md` content will cause aligned consumers to see a Refresh offer automatically. The marker version-compare is the trigger — no consumer-side action needed for the hook to detect drift.

## 1.17.0 — canonical AGENTS.md template + sync-driven generation + confirm-overwrite flow

### Added — plugin ships its own AGENTS.md routing template

v1.16.1 fixed the SessionStart hook so it stops reinforcing legacy `.ai/skills/` routing. But the underlying problem remained: consumer apps still ship broken AGENTS.md (because `create-mercato-app` template still routes to `.ai/skills/<name>/SKILL.md`), and the v1.16.1 hook only warned about `.ai/skills/` directory contents, not the dangling routing rows in AGENTS.md itself.

v1.17.0 closes that gap by making **plugin om-superpowers the canonical source for the consumer-app `AGENTS.md` routing template**. The plugin ships `templates/AGENTS.md` (sync-generated from upstream `OM/packages/create-app/agentic/shared/AGENTS.md.template` with routing rewrites applied), and the SessionStart hook offers — via user confirmation — to overwrite a misaligned consumer `AGENTS.md` with the canonical.

#### How the sync transform works

`scripts/transform-agents-template.py` (new) reads the upstream template and emits a plugin-canonical version by:

1. **Rewriting `.ai/skills/<name>/SKILL.md` references** to `om-superpowers:om-<canonical>` invocations using a static map. Sub-references (`.ai/skills/<name>/references/<sub>.md`) become `invoke om-superpowers:om-<parent>` (loads `<name>/<sub>`).
2. **Dropping table rows + prose** that reference skills with no plugin equivalent — `auto-create-pr-loop`, `auto-continue-pr-loop`, `auto-fix-github`, `auto-upgrade-0.4.10-to-0.5.0`, `trim-unused-modules`. Reasons per skill: deprecated (auto-*-loop superseded by `/loop 5m /auto-continue-pr <PR#>` harness cron), one-off (auto-upgrade is a transient framework migration), or scope-mismatch (trim-unused-modules is a post-scaffold utility better suited to create-app's UX, not the plugin).
3. **Dropping Critical Rule #8** (entirely predicated on `trim-unused-modules` being available) and renumbering subsequent rules 9→8, 10→9, 11→10, 12→11. The Dashboards fallback rule survives because it's still useful when the user disables `dashboards` manually.
4. **Surgical prose substitutions** for slash-command examples that mention dropped skills (e.g., the `/auto-fix-github 42` example in the Agent Automation section's blurb) and parenthetical asides ("or the `trim-unused-modules` skill" in the Dashboards fallback).
5. **Replacing `{{PROJECT_NAME}}`** placeholder with `Open Mercato App`.
6. **Prepending `<!-- om-superpowers:routing:v<plugin-version> -->`** at the top so the hook can detect "already aligned" on subsequent sessions.

The plugin version for the marker is read at sync time from `.claude-plugin/plugin.json`, so the canonical's marker always matches the version that shipped it.

#### Sync-script extension

`scripts/sync-om-skills.sh` Section 5 (new) fetches the upstream template via `curl` and pipes through the transform. Failures (network, upstream 404) leave the previous canonical in place — sync is best-effort, not destructive.

#### Hook detection + confirm-overwrite flow

`hooks/session-start` now detects two new states alongside the v1.16.1 legacy-skills check:

- **No AGENTS.md exists** in the consumer app at all
- **AGENTS.md exists but lacks `<!-- om-superpowers:routing:v` marker** — likely scaffolded from an older `create-mercato-app` version or never aligned

When either is true, the hook injects an `AGENTS.md Alignment Available` block that instructs the agent (BEFORE responding to the user's actual prompt) to invoke `AskUserQuestion` with a three-option choice — `Yes, align now` / `No, skip this session` / `Show diff first`. On YES: agent backs up the existing `AGENTS.md` to `AGENTS.md.bak`, reads `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md`, writes the canonical. On NO: agent doesn't re-prompt this session.

#### Why confirm-and-overwrite (not auto-rewrite, not warn-only)

Three earlier design options were considered:

| Approach | Why rejected |
|---|---|
| **Auto-rewrite at SessionStart** | AGENTS.md is user-customizable. Silent rewrite on every session fights user edits. Idempotency markers help but not enough — projects have legitimately project-specific content (env vars, integration test setup, deletion notices) that the canonical doesn't preserve. |
| **Marker-bounded merge** (canonical inserted between `<!-- om-superpowers:routing:start --><!-- om-superpowers:routing:end -->` markers) | Preserves project-specific content. Considered. The user picked full overwrite explicitly — cleaner separation between plugin-owned routing and consumer-owned everything else, at the cost of asking the user to manually re-merge project-specific notes. |
| **Warn-only** (v1.16.1 baseline) | Closes nothing — agent still confronts the broken routing on the next prompt. The warning doesn't fix the failure mode that the routing rows point at files that don't exist. |

The chosen design: full overwrite with explicit user confirmation, backup preserved as `.bak`, project-specific content is the consumer's responsibility to re-merge.

#### Lossy-map decisions (transform exceptions)

Five upstream skills don't map cleanly to plugin equivalents. Disposition decided per skill:

| Upstream skill | Status | Rationale |
|---|---|---|
| `auto-create-pr-loop` | drop | Advanced spec-implementation variant; plugin's `om-auto-create-pr` is the non-loop fork. Manual port from upstream samples when needed. |
| `auto-continue-pr-loop` | drop | Same rationale as above |
| `auto-fix-github` | drop | Real plugin gap (issue → PR autonomously). Not ported in this release; manual cherry-pick when needed |
| `auto-upgrade-0.4.10-to-0.5.0` | drop | One-off framework migration; not a permanent capability |
| `trim-unused-modules` | drop | Post-scaffold utility better suited to create-app's UX layer, not the plugin |

If any of these become priority later, they can be brought into the plugin in a separate release and the transform map updated to route them through plugin namespace.

### Smoke-test results

Hook tested against four scenarios — all green:

| Scenario | Legacy warning | Alignment offer | Hook empty `{}`? |
|---|---|---|---|
| patryk-standalone (`.ai/skills/` empty, no marker) | NO | YES | — |
| App #1 (`create-mercato-app --skip-agentic-setup`, no `.ai/skills/`, no marker) | NO | YES | — |
| App #2 (`create-mercato-app` wizard, `.ai/skills/` has 19 SKILL.md, no marker) | YES | YES | — |
| `~` (non-OM dir) | — | — | YES |

Transform output verified:
- 0 references to `.ai/skills/` paths remain
- 0 mentions of dropped skill names remain
- Critical Rules renumbered 1–11 (was 1–12)
- Marker present at line 1
- 280 lines, 26123 chars (vs upstream's 287 lines, ~27 KB)

### Files touched

- `hooks/session-start` — detection of alignment state + AGENTS.md Alignment Available offer block
- `scripts/sync-om-skills.sh` — Section 5 (new): fetches and transforms the AGENTS.md template at sync time
- `scripts/transform-agents-template.py` — new Python helper, ~170 lines, implements the routing rewrites + drops + prose substitutions
- `templates/AGENTS.md` — new, generated by the transform; 280 lines containing the canonical routing template with marker
- `.claude-plugin/plugin.json` — version bump 1.16.1 → 1.17.0
- `.claude-plugin/marketplace.json` — version bump 1.16.1 → 1.17.0

### Migration notes

- Existing consumer apps will see the AGENTS.md Alignment Available block on their first SessionStart with v1.17.0+. Agents will offer to align; users decide per-app. Once aligned, the marker suppresses the offer on subsequent sessions.
- `templates/AGENTS.md` is committed alongside the script that generates it. Future plugin releases should re-run the sync before tagging so the committed template reflects the upstream-as-of-release. Drift between `templates/AGENTS.md` and upstream is acceptable between syncs.
- The Python transform's `ROUTING_MAP`, `DROP_SKILLS`, `DROP_BLOCKS`, and `PROSE_REPLACEMENTS` are the authoritative configuration. Adding a new plugin skill that the upstream template references means updating `ROUTING_MAP`; dropping a previously-mapped skill means moving it to `DROP_SKILLS`.

## 1.16.1 — hook: align session-start with 1.16.0 plugin-only policy

### Fixed — three misalignments that defeated v1.16.0's "plugin om-* is single source of truth" policy

v1.16.0 collapsed 19 top-level skills into 11 and moved the rest under parent `references/`. The `hooks/session-start` SessionStart injection was not updated to match — it kept pre-1.16 routing assumptions that actively pushed agents in the wrong direction. This patch fixes three issues found while diagnosing why a `patryk-standalone` debug session never invoked any om-* skill (it tried to follow stale `.ai/skills/` mandates the hook reinforced).

#### 1. `is_om_vanilla` semantic inverted

**Before:** hook treated presence of `.ai/skills/` in a consumer app as proof of "vanilla mode" and emitted an *OM Vanilla Hybrid — Routing Precedence* block telling agents *"AGENTS.md row → `.ai/skills/<name>/SKILL.md` — YES, always honor first; Plugin om-`<name>` Skill — NO, cross-reference only."* Under v1.16.0's plugin-only policy that's wrong-direction — a consumer with `.ai/skills/` is migration debt, not a routing signal.

**After:** renamed to `has_legacy_skills_dir`. Requires non-empty `.ai/skills/` (at least one `SKILL.md` under it) before firing — empty leftover directories no longer trigger anything. The block now emits a *Legacy `.ai/skills/` Directory Detected — DO NOT Use It as Authoritative* warning that:

- Tells the agent: do NOT `Read` `.ai/skills/<name>/SKILL.md` as authoritative; invoke the plugin equivalent instead.
- Provides the Task → Plugin Skill map (e.g., `troubleshooter` → `om-troubleshooter`; `module-scaffold` / `data-model-design` / `system-extension` → `om-implement-spec`; `backend-ui-design` → `om-ds-guardian`; `spec-writing` / `toolkit-review` / `user-proxy` → `om-cto`).
- Asks the agent to mention the migration debt to the user once per session.
- Covers stale references encountered in *other* project files (specs, plans, `runs/`, PR comments), not just AGENTS.md.

#### 2. `OM_CONTEXT` skill list pruned to match the manifest

**Before:** the heredoc listed 8 names that are NOT directly invocable top-level skills — `om-spec-writing`, `om-pre-implement-spec`, `om-module-scaffold`, `om-data-model-design`, `om-system-extension`, `om-eject-and-customize`, `om-integration-builder`, `om-backend-ui-design`, `om-toolkit-review`, `om-user-proxy`. All of those moved under parent `references/` in v1.16.0 (or earlier in the case of `om-eject-and-customize` / `om-toolkit-review` / `om-pre-implement-spec`). It also OMITTED 4 real top-level skills: `om-ds-guardian` and all three `om-auto-*`. The script's own comment confessed: *"MAINTENANCE: the custom-skill list below is hard-coded. If scripts/sync-om-skills.sh changes which skills are synced vs custom, update the list here too."*

**After:** both the "Standalone skills" sub-list and the categorized "Available OM Skills" section now list exactly the 11 invocable top-level skills, with Task Router notation pointing at sub-references. New "Automation (PR lifecycle)" category for the three `om-auto-*` skills.

#### 3. Stray `om-user-proxy` reference in the User Proxy section

**Before:** *"See the `om-user-proxy` skill for the full onboarding flow"* — pointed at a skill name that no longer exists at the top level.

**After:** *"invoke `om-superpowers:om-cto` and load `references/user-proxy.md`"* — matches v1.16.0's demotion of user-proxy under om-cto.

### Smoke-test results

Hook tested against three scenarios — all green:

| Scenario | Expected | Actual |
|---|---|---|
| `patryk-standalone` (`.ai/skills/` exists, empty) | Legacy warning: NOT fired | NOT fired |
| `OM-CR/wieczor24` (`.ai/skills/` has 9 SKILL.md) | Legacy warning: fired | Fired |
| `~` (non-OM project) | Hook outputs `{}` | Outputs `{}` |
| Bash syntax | Valid | `bash -n` passes |
| JSON output | Parseable, with `hookSpecificOutput.additionalContext` | 5989 chars (patryk), 7192 chars (wieczor24) |

### Other artifacts produced alongside this fix (not part of the plugin)

While diagnosing, two repairs landed outside the plugin and are recorded here for traceability:

- `patryk-standalone/AGENTS.md` — Task → Context Map rewritten to use `invoke om-superpowers:om-<name>` notation instead of dangling `.ai/skills/<name>/SKILL.md` paths. Critical Rule #5 updated with skill-invocation guidance and an anti-pattern note covering stale refs in older docs.

### Plugin-internal additions to support the policy

- `skills/om-troubleshooter/SKILL.md` — promoted the buried upstream-bug routing rule to a top-of-file `## STOP — Upstream bug routing (read first)` block. Description frontmatter extended with the trigger phrase. Buried Rules-section bullet de-duplicated to a one-liner pointer.
- `skills/om-cto/references/upstream-bug-triage.md` — Step 1 path resolution now probes `~/Documents/OM` (require `.git` AND `agents/tasks/`) as a self-bootstrapping default before asking the user. Added explicit anti-patterns at end of Step 2 (do NOT append to `ISSUE_LOG.md`; do NOT use bare `.md` at top of `agents/tasks/`; do NOT write into consumer-app `.ai/`; do NOT open PR from consumer-app session).
- `scripts/check-consumer-agents.sh` — new file, executable, lints consumer-app `AGENTS.md` / `CLAUDE.md` files for dangling `.ai/skills/<name>/SKILL.md` refs and suggests plugin-namespace replacements per dangling ref. Smoke-tested against 7 consumer apps.

### Files touched

- `hooks/session-start` — three edits described above
- `.claude-plugin/plugin.json` — version bump 1.16.0 → 1.16.1
- `.claude-plugin/marketplace.json` — version bump 1.16.0 → 1.16.1
- `skills/om-troubleshooter/SKILL.md` — STOP-block addition + description trigger extension + Rules-bullet de-duplication
- `skills/om-cto/references/upstream-bug-triage.md` — Step 1 canonical-default probe + Step 2 anti-patterns block
- `scripts/check-consumer-agents.sh` — new file

### Migration notes

- Consumer apps with a non-empty `.ai/skills/` directory will now see a Legacy Skills Warning block in their SessionStart context. Recommended action: migrate any AGENTS.md routing to `om-superpowers:om-*` notation (see `scripts/check-consumer-agents.sh` for a lint of dangling refs), then remove the directory.
- Subagents dispatched in long sessions: as with prior versions, the SessionStart injection does NOT carry into subagent contexts. Orchestrators should restate routing inline when spawning subagents that touch om-* skill areas.

## 1.16.0 — architecture: development-flow vs ad-hoc skills

### Changed — 19 top-level skills → 11 (7 demoted to references, 1 removed)

A skill-corpus audit against actual usage data (last 30 days, all projects) showed many "skills" were really specialty references that fired during specific work episodes — not user-typed entry points. They cost ~3,500 chars of always-on description budget for cases the user wasn't directly invoking. v1.16 separates **development-flow skills** (user-facing entry points + always-on pipeline parts) from **ad-hoc references** (loaded by parent skill when a specific kind of work begins).

**Backing data:** [`docs/specs/analysis/ANALYSIS-2026-05-10-skill-corpus-audit.md`](docs/specs/analysis/ANALYSIS-2026-05-10-skill-corpus-audit.md) captures the two-channel mining query (Skill tool invocations + Read activity on skill paths), full data for all 19 skills + 3 already-demoted controls, calibration against the v1.8.0 demotion precedent, caveats, and a 60-day re-audit cadence with a forward ledger path. Reproducible — both queries are in the doc and re-run from any operator's `~/.claude/projects/`.

Pattern is identical to v1.8.0's three-skill demotion (om-pre-implement-spec, om-eject-and-customize, om-toolkit-review): body content moves under parent's `references/` with frontmatter stripped; parent SKILL.md absorbs trigger phrases and adds Task Router rows.

#### Demotions (7 skills → references)

| Demoted skill | New location | Parent absorbs triggers |
|---|---|---|
| om-user-proxy | `skills/om-cto/references/user-proxy.md` | (proxy invocation pattern, no user trigger) |
| om-spec-writing | `skills/om-cto/references/spec-writing/spec-writing.md` + 3 sub-refs | already covers "write specs" |
| om-module-scaffold | `skills/om-implement-spec/references/module-scaffold/` + 3 sub-refs | "create module", "new module", "scaffold module" |
| om-data-model-design | `skills/om-implement-spec/references/data-model-design/` + 2 sub-refs | "design entity", "data model", "schema", "migration" |
| om-system-extension | `skills/om-implement-spec/references/system-extension/` + 3 sub-refs (incl. eject.md) | "extend", "add column to", "intercept", "override component" |
| om-integration-builder | `skills/om-implement-spec/references/integration-builder/` + 2 sub-refs | "build integration", "add provider", "new connector" |
| om-backend-ui-design | `skills/om-ds-guardian/references/backend-ui-design/` + 1 sub-ref | "build admin page", "data table", "CRUD interface" |

#### Removal (1 skill)

- **om-orchestrate** deleted entirely. Per `feedback_loop_self_pace_anti_pattern` and 0 invocations in 30 days, the autonomous-fleet workflow was superseded by `/loop 5m /auto-continue-pr <PR#>` (harness cron mode). Coding-agent / e2e-agent / merge-agent prompts and dispatcher script are gone with it.

#### Top-level skill list (11 remaining)

User-facing entry points only:
- **Advisory & PM** — om-cto, om-product-manager, om-ux
- **Implementation** — om-implement-spec, om-code-review, om-integration-tests
- **PR mechanics** — om-auto-create-pr, om-auto-continue-pr, om-auto-review-pr
- **Quality enforcement** — om-ds-guardian, om-troubleshooter

#### Frozen-snapshot decision (not auto-synced from upstream)

6 of the 7 demoted skills were vendored from upstream `open-mercato/open-mercato`. v1.16 takes them out of `CORE_SKILL_PAIRS` / `APP_SKILL_PAIRS` rather than extending `sync_demoted_skill()` to handle nested `references/` folders. They become **frozen snapshots** as of v1.16.0; manual cherry-pick from upstream is required for future changes. Trade-off: cleaner sync script, marginally more upkeep for the four upstream-tracked references. Pattern documented in the script comments.

The pre-existing `om-eject-and-customize` demotion (v1.8.0) still flows through `DEMOTED_SKILL_PAIRS` — its target path was updated from `skills/om-system-extension/references/eject.md` to `skills/om-implement-spec/references/system-extension/eject.md` to match the v1.16 reshuffle.

#### Budget impact

| Stage | Top-level skills | Description chars | Δ vs baseline |
|---|---|---|---|
| Baseline (1.15.0) | 19 | 8,577 | — |
| 1.15.1 (frontmatter trim) | 19 | 4,889 | -43% |
| **1.16.0 (this draft)** | **11** | **3,031** | **-65%** |

#### Stale-reference cleanup (complete)

All **concrete file paths** to demoted skill folders updated (verified: zero `skills/om-<demoted>/...` paths remain). All **descriptive name mentions** in body content also updated — references to "invoke `om-user-proxy`", "`om-module-scaffold` scaffolds new modules", etc. now point at the new reference paths or describe the parent skill that loads them. README.md and UPSTREAM.md fully reflect the new architecture: 11 top-level skills, 10 demoted references (7 added in v1.16.0 + 3 from v1.8.0 era), Custom/Synced/Frozen-snapshot taxonomy in the Custom-vs-Synced table.

### Files touched

- 7 × demoted skill directories — `git mv` to parent's `references/<name>/` (or single-file for om-user-proxy); frontmatter stripped from main SKILL.md
- `skills/om-orchestrate/` — deleted (11 files)
- `skills/om-cto/SKILL.md` — Task Router gains spec-writing + user-proxy rows; User Proxy Integration section updated
- `skills/om-cto/references/{advisory,impl-orchestrator,spec-orchestrator,toolkit-audit}.md` — concrete paths updated; "invoke `om-user-proxy`" rephrased to "consult `references/user-proxy.md`"; toolkit-audit's trigger matrix and orchestrator-chain blocks reflect v1.16.0 routing
- `skills/om-implement-spec/SKILL.md` — description widened; Task Router section added; orchestration-detect block in Step 8 simplified to plain integration-test command
- `skills/om-implement-spec/references/{module-scaffold,data-model-design,system-extension,integration-builder}/<sub-ref>.md` — header lines updated from "Referenced by om-X" to "Sibling of <name>.md under <new path>"
- `skills/om-ds-guardian/SKILL.md` — description widened to absorb backend page build triggers; Task Router section added; collaboration table pruned of demoted skill rows; "page generation is owned by `om-module-scaffold`" callout rewritten
- `skills/om-product-manager/SKILL.md` — Proxy Gate section now points to `skills/om-cto/references/user-proxy.md`
- `skills/om-ux/SKILL.md` + `skills/om-ux/references/krug-prompt.md` — backend-ui-design paths updated
- `scripts/sync-om-skills.sh` — `CORE_SKILL_PAIRS` and `APP_SKILL_PAIRS` lose the 6 demoted upstream skills; `DEMOTED_SKILL_PAIRS` updates the eject.md target path
- `.claude-plugin/plugin.json` + `marketplace.json` — version bump to 1.16.0; description updated from "19 user-facing skills" to "11 user-facing skills"
- `README.md` — opening blurb (19→11), inline examples, Spec & Design / Implementation / Quality / Automation / Demoted-references tables, ASCII pipeline diagram, Custom-vs-Synced-vs-Frozen taxonomy, v1.12.0 om-orchestrate callout rewritten as v1.16.0 removal callout, v1.12.1 upstream-bug-triage rule scope updated, v1.13.0 mirrors-docs callout updated to point at new reference paths
- `UPSTREAM.md` — main registry pruned to 11 top-level rows; "Demoted skills" section expanded to 10 rows with two source modes (Auto-synced vs Frozen snapshot v1.16.0)

### Migration notes

- Direct invocation of demoted skills via the `Skill` tool will no longer find them by their old names. Switch to invoking the parent (om-cto, om-implement-spec, om-ds-guardian) and let it route via Task Router.
- For any downstream session script that read `skills/om-system-extension/SKILL.md` directly: the new path is `skills/om-implement-spec/references/system-extension/system-extension.md`.

## 1.15.1

### Fixed — skill description budget (frontmatter trim across all 19 skills)

`/doctor` was reporting **29 skill descriptions dropped** from the system-prompt skill listing. Root cause: om-superpowers ate ~8.6KB of the global description budget on its own, with seven skills exceeding 500 chars of frontmatter `description:` and the worst (`om-system-extension` at 788, `om-cto` at 757) packing full trigger keyword lists into the field meant for a 1-2 sentence hint.

Anthropic's skill-spec guidance keeps `description:` short on purpose — it's injected verbatim into the system prompt for every Claude Code session, and the budget is a hard cap. When exceeded, late-loading skills (third-party plugins, user skills) get listed name-only, losing the description Claude uses to decide when to load them.

#### What ships

Every SKILL.md frontmatter `description:` rewritten to ≤315 chars while preserving the key trigger keywords. No behavior changes — only frontmatter. Body content untouched.

| skill | before | after |
|---|---|---|
| om-system-extension | 788 | 291 |
| om-cto | 757 | 309 |
| om-ds-guardian | 637 | 279 |
| om-auto-create-pr | 610 | 315 |
| om-orchestrate | 601 | 229 |
| om-auto-continue-pr | 551 | 255 |
| om-integration-builder | 532 | 292 |
| om-auto-review-pr | 450 | 302 |
| om-implement-spec | 422 | 265 |
| om-troubleshooter | 397 | 238 |
| om-data-model-design | 393 | 232 |
| om-code-review | 391 | 254 |
| om-integration-tests | 345 | 249 |
| om-module-scaffold | 340 | 223 |
| om-backend-ui-design | 326 | 231 |
| om-user-proxy | 304 | 227 |
| om-ux | 275 | 240 |
| om-product-manager | 269 | 269 (untouched, already short) |
| om-spec-writing | 189 | 189 (untouched, already short) |

**Total: 8,577 → 4,889 chars (-43%, saved 3,688 chars).** Should recover the 29 dropped descriptions in `/doctor`; verifies after `/plugin update om-superpowers`.

### Files touched

- 17 × `skills/*/SKILL.md` — frontmatter `description:` field only
- `.claude-plugin/plugin.json` — version bump
- `.claude-plugin/marketplace.json` — version bump

### Follow-up — synced skills will regress on next `sync-om-skills.sh`

10 of the 17 trimmed skills are vendored from upstream `open-mercato/open-mercato`. Their `description:` fields will be overwritten back to the long form when the sync script next runs. To make this permanent, upstream PRs are needed against `.ai/skills/` and `packages/create-app/agentic/shared/ai/skills/` in the OM core repo.

**Synced (need upstream PR to stay trimmed):**
- `om-implement-spec`, `om-code-review`, `om-spec-writing`, `om-backend-ui-design`, `om-integration-builder`, `om-integration-tests` ← `.ai/skills/`
- `om-data-model-design`, `om-module-scaffold`, `om-system-extension`, `om-troubleshooter` ← `packages/create-app/agentic/shared/ai/skills/`

**Local-only (trim is permanent):**
- `om-cto`, `om-ds-guardian`, `om-orchestrate`, `om-auto-create-pr`, `om-auto-continue-pr`, `om-auto-review-pr`, `om-user-proxy`

Tracked separately per `feedback_no_silent_upstream_workarounds` — this release is the downstream patch; the upstream task is the permanent fix.

## 1.15.0

### Added — upstream patch handoff (producer convention + consumer drain protocol)

Closes the producer-consumer loop on upstream OM core fixes — as a documented convention the model executes with native tools (`Read` / `Write` / one `Bash` find), not a CLI wrapper. A consumer-app session (PRM, patryk-standalone, any other downstream app) reads the OM core checkout path from `~/.config/om-superpowers/handoff.json` (asking the user once and persisting if missing), then `Write`s a self-contained task folder at `<om-core-checkout>/agents/tasks/YYYY-MM-DD-<slug>/README.md` with the README template inline in the skill body. A separate session running with `cwd` inside the OM checkout drains that queue per the new `skills/om-cto/references/upstream-task-drain.md` — landing the patch upstream without ever cross-contaminating the two repos.

**Driven by** `docs/specs/analysis/ANALYSIS-2026-05-10-upstream-handoff-baseline.md` (empirical baseline) + `ANALYSIS-2026-05-10-upstream-handoff-baseline-v2.md` (Musk-Step-1 review of the wrapper plan). The baseline mined 16 cross-project handoff writes since 2026-04-01 across three real tasks dropped on 2026-05-10. Without any rule, the binding rate was **67%** (2 of 3 README-only handoffs as intended; 1 task had a `patches.diff` written from the consumer side — the failure mode this release closes).

#### Why a convention, not wrappers

A `bin/om-handoff` + `bin/om-task-list` wrapper pair was drafted earlier in the day and **deleted before commit** after Musk-Step-1 review. Five jobs the wrapper would do — resolve the OM-core path, validate slug regex, `mkdir` the folder, write a 9-section skeleton, return the path — all reduce to native primitives the model already has. The skeleton-then-Edit pattern actually inverted the friction goal: two round trips where a single `Write` with substance composed inline is one. Two BLOCKERs that only existed because the wrapper existed (heredoc interpolation leaking the producer-local path into the README the drain agent reads on a different machine; wrapper not on `$PATH` from a consumer-app session) disappeared with the wrapper. The convention's binding logic is identical to the wrapper's — both are prose-channel binding (per the agents-master `feedback_text_channel_does_not_bind` finding, N=17) — but the convention has lower friction at every step and a more legible failure mode: a missed handoff shows up as the absence of writes under `agents/tasks/`, not a confused half-attempt to invoke a wrapper that wasn't on PATH.

The PreToolUse cwd-jail / lockdown-mode hook (the alternative structural-policing approach) was rejected separately. Adversarial review found 2 BLOCKER issues (matcher missed `Bash` writes via `cat > file` and `sed -i`; proposed `{"decision":"block"}` is `Stop` semantics, not `PreToolUse`) and 4 SERIOUS issues. Friction reduction beats structural policing when the population is willing — and the data shows consumer-app sessions are willing.

#### What ships

- **`skills/om-cto/references/upstream-bug-triage.md`** — the "Upstream patch handoff" section is rewritten to spec the convention inline, three steps the model performs with native tools: (1) `Read` `~/.config/om-superpowers/handoff.json`'s `om_core_path` key, ask the user once and `Write` the config if missing; (2) compose substance and `Write` `<om-core-checkout>/agents/tasks/<YYYY-MM-DD>-<slug>/README.md` with the template (inline in the skill body, `<om-core-checkout>` placeholder kept literal in example commands so the drain agent on a different machine doesn't see a stale absolute path); (3) stop the upstream-patch portion of the task, report the folder path back to the user. Slug regex (`^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`, no double hyphens) stated in the skill body. Action-table rows for both `confirmed-new-bug` recommendations updated. New `upstream_patch_task_path` YAML field in the structured verdict output. Boundary section gains a fourth bullet: "does not author the upstream core patch from the consumer-app session." Why-this-exists gains a fourth failure mode: "Cross-repo patch contamination." Net: ~70 lines added to the skill body, prior wrapper-pointing prose removed.
- **`skills/om-cto/references/upstream-task-drain.md` (new)** — consumer-side protocol for the OM-side agent. Sibling reference under `om-cto`, NOT a new top-level skill (per skill-surface-budget rule: bug-triage and task-drain are two phases of the same architectural concern). Specifies claim protocol (`git mv` to `in-progress/` is the lock — race losers fail loudly), work protocol (re-verify anchors against current upstream sha → branch off `origin/main` → patch → tests → PR to your fork), done protocol (`git mv` to `done/` + sibling `resolution.md` linking the merged PR back to the originating downstream task with a removal trigger for any consumer-side workaround), and rejection/pushback path.

#### Verification target (Karpathy bar)

Binding-rate KPI: `handoff_correct / (handoff_correct + inline_authored)`. Today's baseline 67%. Target after release: ≥90%. Re-run the mining query monthly. Plan B (`SessionEnd` git-diff auditor scanning for `patches.diff` writes inside `/OM/agents/tasks/` from non-OM `cwd`) held for 1.15.1 if Plan A measurement says the convention alone isn't enough.

Reproducible mining query lives in the v1 analysis doc.

### Files touched

- `skills/om-cto/references/upstream-bug-triage.md` — rewrote "Upstream patch handoff" section to spec the convention inline (Read config / Write template / stop). Added `upstream_patch_task_path` YAML field, updated action table for both `confirmed-new-bug` rows, updated boundary + reporting-back, added fourth failure mode in why-this-exists.
- `skills/om-cto/references/upstream-task-drain.md` (new) — consumer-side drain protocol reference.
- `docs/specs/analysis/ANALYSIS-2026-05-10-upstream-handoff-baseline.md` (new) — empirical baseline + mining query + rejected `PreToolUse` lockdown proposal. Top-line note added pointing at v2 for the plan section.
- `docs/specs/analysis/ANALYSIS-2026-05-10-upstream-handoff-baseline-v2.md` (new) — Musk-Step-1 review of the wrapper plan; specifies the convention shape that actually shipped.
- `CHANGELOG.md` — this entry.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.15.0.
- `README.md` — v1.15.0 callout.

#### Cross-refs

- v1.12.1 (`upstream-bug-triage` discipline — the producer-side triage rule this release operationalizes for the patch-authoring path)
- agents-master `feedback_text_channel_does_not_bind` (the prose-channel binding limitation that applies equally to convention and wrapper, and informed the choice not to over-engineer)

## 1.14.0

### Added — `bin/claude-validated` output validator wrapper

Implements `agents-master/improvements/I018.md` — a structural validator that wraps `claude -p` (headless mode) and runs 5 deterministic regex checks against stdout. On any FAIL: rejects + retries with reinforcement (up to 2 retries). After retry budget: exits 1 with named FAIL on stderr. Silent fabrication is no longer an option for the "does platform X cover capability Y" prompt class in headless mode.

**Driven by** S008 → S010 → S011 — 16 data points across 4 progressively-tightened text-channel gates (HARD-GATE prose, `## Sources` mandate from I014, Phase 6 doubt-check from I016, ROUTING CHECK addition from I017) all empirically establishing that prose rules in skill bodies do not bind `claude -p --model claude-opus-4-7` for fabrication-shape failures. Plus one deletion experiment (Replace Advisory with Research Plan) that also failed: agent read the new template four times then violated every Hard Rule. Skill text channel is dead for this prompt class. The wrapper bypasses it entirely — skill text becomes advisory; the regex is normative.

#### What it catches

- **#1 Percentage without N/M fraction** — `~70%` without backing fraction (`8/11 covered`) → FAIL
- **#2 English hedges** — `approximately`, `around`, `roughly`, `~[0-9]` → FAIL
- **#3 Persona invocation** — `Piotr`, `Cagan`, `Piotr-style`, `Cagan-style` used as authority labels → FAIL (cite rule numbers from `references/piotr-decision-library.md`, never the persona name as label)
- **#4 Polish hedges** — `szacunkowo`, `około`, `mniej więcej`, `w przybliżeniu` (locale-restrictive: output must be English) → FAIL
- **#5 Effort estimates without enumeration** — `6-8 modules` without per-module list → FAIL

#### Locale-restrictive design

The wrapper prepends a `LOCALE_RULE` requiring English output regardless of input language, so an English-only regex set suffices. Addresses S011's finding that fabrication shape transfers across languages — agent matching user's Polish prompt was the carrier wave for the fabrication. Removing the language-mirroring instinct removes one transfer surface. Cost: Polish-speaking users reading English answers about platform capabilities; acceptable given the user is the developer here, not the end customer; final user-facing answers can be re-localized as a separate step after grounding holds.

#### Empirical retry trajectory (verified 2026-05-09)

ISO 9001 prompt against patched wrapper (transcripts captured):

- Retry 0: 3 FAILs (`#2` hedge, `#3` persona, `#5` effort estimate)
- Retry 1: 1 FAIL (`#3` persona) — narrowed
- Retry 2: 1 FAIL (`#5` effort regex precision); output structurally near-compliant — 10 modules enumerated explicitly with descriptions, fractions `7/7`, `10/10`, `4/4` instead of percentages, zero persona invocations
- Exit 1 with named FAIL surfaced on stderr

Retry-into-compliance empirically works; failure to PASS within retry budget on this specific prompt is due to validator `#5`'s effort-estimate regex precision (fires on `10 modules` mention even when 10 modules are explicitly enumerated). Tuning deferred until N≥3 false-fire cases accrue from real use — picked from data, not pre-commit.

#### Downstream stdin-fix vs spec verbatim

I018's spec used `cat` inside the retry loop, but stdin is consumed by retry 0 — retries 1+ then received only `LOCALE_RULE` without the original prompt and the model emitted orientation messages instead of retried-answer-with-reinforcement (verified empirically before the fix: vacuous PASS on retry 2). Three-line downstream fix: `PROMPT=$(cat)` once at top, `printf '%s\n' "$PROMPT"` in retry pipeline. Aligned with spec intent (retry-with-reinforcement); does not modify spec semantics. Synced as implementation note to agents-master.

#### Usage (opt-in)

The wrapper is opt-in tooling — not auto-injected anywhere. Symlink to PATH or invoke via full path:

```bash
echo "<question>" | ~/Documents/om-superpowers/bin/claude-validated --model claude-opus-4-7

# Or symlink for short invocation
ln -sf ~/Documents/om-superpowers/bin/claude-validated ~/bin/claude-validated
```

#### What it does NOT cover (named for honesty)

- Interactive Claude Code sessions (this chat) — wrapper is post-emit, not streaming; no insertion point in a live session
- Claude Desktop, Claude Web — wrapper is a bash script, terminal-only
- Plain `claude` invocations without `-p` — wrapper specifically targets headless mode
- Other prompt classes (spec writing, implementation orchestration) — each needs its own validator regex set if the same fabrication shape appears
- The model's training-internalized output shape — the wrapper addresses the symptom (fabrication leaks past skill body), not the cause

For interactive enforcement, Claude Code hooks would be needed (option (b) from S011, deferred until empirical demand).

### Refactor — om-cto/SKILL.md persona-prune

Empirical evidence from probe 3 of the S011 verification chain: `# Piotr — advisory:` H1 fired as a fabrication shield even after `piotr-decision-library.md` prune. SKILL.md was the load-bearing surface for the persona shield, not the library file.

This release removes:
- `# Piotr` H1 (replaced with `# om-cto`)
- Persona-narrative paragraph ("Piotr Karwatka — CTO of Open Mercato, 1,400+ contributions...")
- "Red Flags" `Piotr says` table (8 rows)

Four surviving "Piotr" references in lower SKILL.md sections (Task Router row, User Proxy Integration, Architecture Direction, closing line) were not load-bearing per probe 3 data and are intentionally left for a future surgical pass if needed. The wrapper's validator `#3` catches residual prose-level invocations regardless of where in the skill the persona content lives — the persona does not need to be pruned everywhere, just out of the output.

### Files touched

- `bin/claude-validated` (new) — bash wrapper, ~80 lines, executable. Implements I018 with downstream stdin-fix. Already landed standalone in commit `8ca946c`.
- `skills/om-cto/SKILL.md` — persona-prune, 2 hunks (-13 net lines). Already landed standalone in commit `c288c45`.
- `CHANGELOG.md` — this entry.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.14.0.
- `README.md` — v1.14.0 callout in Quality & Testing section.

The two functional commits (`c288c45` + `8ca946c`) landed during the verification work and were pushed standalone before this version bump. This release commit packages them with the manifest bump so users actually receive both changes via `/plugins marketplace update`.

#### Cross-refs

- `agents-master/improvements/I018.md` (wrapper spec, output-validator design)
- `agents-master/sessions/S011.md` (failure analysis driving I018: 4 replays of progressively-tightened text gates, all bypassed)
- `agents-master/improvements/I017.md` (Musk Step 2 attempt: replace Advisory with Research Plan; empirically failed; partial revert kept SKILL.md persona-prune)
- `agents-master/improvements/I016.md` (Phase 6 doubt-check; in-vitro adoption test passed but in-vivo deployment via skill-text channel failed; superseded by I018)

## 1.13.0

### Added — DS Guardian sync infrastructure (`scripts/sync/ds.mjs`)

`om-ds-guardian` references are now kept in sync with upstream OM canonical DS docs via a manual sync script. Run `node scripts/sync/ds.mjs` from the plugin root to:

- **Mirror** `.ai/ds-rules.md` and `.ai/ui-components.md` from upstream `open-mercato/open-mercato@develop` into `om-reference/.ai/`. Two upstream files, both authoritative for tokens and primitive contracts; on conflict with hand-curated content, upstream wins.
- **Source-extract** 11 specialized inputs (ComboboxInput, DatePicker, DateTimePicker, EventPatternInput, EventSelect, LookupSelect, PhoneNumberField, SwitchableMarkdownInput, TagsInput, TimeInput, TimePicker) from `packages/ui/src/backend/inputs/*.tsx` into `skills/om-ds-guardian/references/specialized-inputs.md`. The bridge exists because upstream `.ai/ui-components.md` does not yet document specialized inputs (per `.ai/design-system-audit-2026-04-10.md`'s "defer to their own sections when they land" note); upstream issue [open-mercato/open-mercato#1874](https://github.com/open-mercato/open-mercato/issues/1874) tracks the canonical doc gap.
- **Discover** new/removed/changed upstream files in tracked directories (`.ai/`, `packages/ui/src/backend/inputs/`, `packages/ui/src/backend/`) by diffing against `skills/om-ds-guardian/.last-sync.json`. Deltas surface as action items in `sync-reports/YYYY-MM-DD-HHMM.md`.
- **Smoke-test** mirrored content (e.g., "ds-rules.md has Colors section", "specialized-inputs.md has TagsInput section") so a malformed mirror does not silently break downstream skill rules.

The script pins to a single upstream commit SHA per run (resolved at start), is idempotent (re-runs with the same SHA are no-ops), supports `--dry-run` for preview without writing, fails loudly (non-zero exit) on gh API errors / missing manifest entries / smoke test failures, and writes atomically (write-then-rename per file).

**Driven by** the user's review of PRM `caseStudyForm.tsx`, where DS Guardian REVIEW gave 10/10 to `<Input value="comma,separated,slugs">` for multi-value dictionary fields. Investigation surfaced that the upstream `<TagsInput>` primitive ships in `@open-mercato/ui@0.5.0`, is documented in source, and is used in 10+ core call-sites — but our hand-curated `references/component-guide.md` had no mention of it. The drift was structural: skill references were written at one point in time and never resynced as upstream evolved. This release closes the gap and prevents the same failure mode for future primitives.

#### Tier model

DS Guardian now layers references in three tiers:

| Tier | Source | Authority | Examples |
|------|--------|-----------|----------|
| **1 — Upstream-mirrored** | `open-mercato/open-mercato` canonical docs | Wins on conflict | `om-reference/.ai/ds-rules.md`, `om-reference/.ai/ui-components.md` |
| **2 — Source-extracted bridge** | `packages/ui/src/backend/inputs/*.tsx` (TS source) | Best-effort until upstream docs catch up | `references/specialized-inputs.md` |
| **3 — Skill-curated** | Hand-maintained in this repo | DS Guardian recipes layered on top | `references/component-guide.md`, `references/token-mapping.md`, `references/page-templates.md` |

#### New `mirrors-docs` relationship in `UPSTREAM.md`

Sibling to existing `extends` (upstream skill plugin), `composes` (orchestration), and `independent` (no upstream) — `mirrors-docs` is for skills that downstream-enforce upstream canonical *documentation* (not skill plugins). Pattern generalizes: future shadowing skills (om-data-model-design, om-system-extension, om-module-scaffold, om-backend-ui-design) can adopt the same shape (manifest + discovery + extract + smoke test + report) when their upstream canonical docs land. Pilot validated the shape; rolling out to other skills is staged.

#### Cadence

Manual trigger only — no cron. The user runs `node scripts/sync/ds.mjs` from the plugin root when they want fresh upstream content. Idempotent re-runs are cheap (no-op exit), so re-running before each release is the recommended cadence. When upstream evolves, the discovery scan flags new/removed/changed files in the report, and the human decides routing (add to manifest, ignore, escalate to a new skill, or file an upstream issue).

#### Files touched

- `scripts/sync/ds.mjs` (new) — single-file sync script; manifest + discovery + extract + smoke test + dry-run + atomic writes + idempotency. Uses `gh api` (already authenticated for plugin users) for upstream calls; no node deps.
- `skills/om-ds-guardian/sync-config.json` (new) — manifest: 2 mirror paths, 1 extract group (11 inputs), 3 discovery paths, 4 smoke tests, upstream `open-mercato/open-mercato@develop`, tracking issue `#1874`.
- `skills/om-ds-guardian/.last-sync.json` (new) — snapshot from last successful sync; fuels discovery diff for the next run.
- `skills/om-ds-guardian/sync-reports/2026-05-08-1930.md` (new) — first official sync report (Tier 1: 2 mirrors written, Tier 2: 11 primitives extracted, 0 discovery deltas, 4 smoke tests passed; pinned to upstream `b39fb4d`).
- `skills/om-ds-guardian/references/specialized-inputs.md` (new, auto-generated) — Tier 2 bridge for the 11 specialized inputs with provenance header, decision rule table, anti-pattern callout for CSV-in-Input, and per-primitive sections (source link, import path, exported types, defaults from destructuring).
- `om-reference/.ai/ds-rules.md` (new, mirrored) — canonical DS foundation rules (~19KB, mirrored verbatim from upstream).
- `om-reference/.ai/ui-components.md` (new, mirrored) — canonical primitive contracts (~36KB, mirrored verbatim from upstream).
- `skills/om-ds-guardian/SKILL.md` — added Tier 1/2/3 reference layers section + Sync section + run-this-manually command.
- `UPSTREAM.md` — added `mirrors-docs` relationship to taxonomy; updated `om-ds-guardian` row from `independent` to `mirrors-docs` with upstream paths and pinned commit `b39fb4d`.
- `README.md` — v1.13.0 callout under Quality & Testing skills section linking to upstream issue #1874.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.13.0.

#### Upstream issue filed

[open-mercato/open-mercato#1874](https://github.com/open-mercato/open-mercato/issues/1874) — "`.ai/ui-components.md` missing Specialized Inputs section". Asks upstream to add a "Specialized Inputs" section covering the 11 primitives with decision rule + props summary + anti-pattern callouts. When that lands, our Tier 2 extract becomes redundant — sync's discovery scan will flag the new upstream section and we can collapse Tier 2 into Tier 1 mirror.

## 1.12.1

### Added — upstream-bug-triage discipline

Suspected OM core (`@open-mercato/*`) bugs no longer get silent workarounds. Any om-superpowers agent that finds itself thinking "OM is broken, let me work around it" MUST route through `om-cto/references/upstream-bug-triage.md` before patching. om-cto verifies the bug, drafts the upstream issue + downstream tracking task, returns a verdict (`not-a-bug` / `already-reported` / `confirmed-new-bug`) and a workaround-size classification (`minor` / `major`); the calling agent does the actual `gh issue create` filings and applies the patch (or stops and reports to user).

**Driven by** the user's observation that downstream agents accumulate undocumented workarounds whenever core misbehaves — three failure modes: real bugs never reach the OM core team, workarounds without removal triggers outlast their cause by years, and "minor for now" workarounds become permanent because no one remembers they were temporary.

#### Workaround size rule

| Class | Definition | Recommendation |
|-------|------------|----------------|
| **Minor** | ≤50 LOC, single downstream file, no abstraction leakage, no public API surface touched, no repetition of upstream logic. | Apply workaround AND file upstream issue + downstream removal-trigger task. |
| **Major** | >50 LOC, OR multi-file, OR leaks abstractions, OR forks/copies upstream logic, OR would repeat at every call site. | Wait for upstream fix. File upstream + downstream blocker. Stop the run. Report to user. |

A 30-LOC change that wraps a core helper across 5 call sites = **major** (leaks into the call graph). A 60-LOC change that's a single guard at one call site with a clear `// remove when @open-mercato/<pkg>#<N> ships` marker = **minor** (containable, removable). When in doubt, recommend major — workaround tech debt outlasts the original deadline.

#### Paper trail required

Every workaround MUST have:
1. An upstream issue at `open-mercato/open-mercato`.
2. A downstream tracking task with a removal-trigger marker.
3. A code comment of the form `// remove when @open-mercato/<pkg>#<N> ships`.

`om-code-review` flags any workaround missing any of those three as **Critical**, regardless of size.

#### Files touched

- `skills/om-cto/references/upstream-bug-triage.md` (new) — verification protocol, verdict matrix, size rule, issue/task templates, om-cto-does-not-file boundary.
- `skills/om-cto/SKILL.md` — Task Router row + new triggers ("upstream bug", "OM core seems broken", "workaround for OM").
- `skills/om-troubleshooter/SKILL.md` — Rules section, route-through-om-cto rule.
- `skills/om-auto-create-pr/SKILL.md` — Rules section, route-through-om-cto rule scoped to step 6 (implementation).
- `skills/om-auto-continue-pr/SKILL.md` — Rules section, route-through-om-cto rule scoped to the resume path (resume agents are at especially high risk of mistaking "core misbehaves" for "push past this").
- `skills/om-system-extension/SKILL.md` — Rules section, route-through-om-cto rule (eject is allowed only after `confirmed-new-bug` + `wait-for-upstream` unacceptable + user approval).
- `skills/om-code-review/SKILL.md` — new "Silent Upstream Workarounds (Critical)" sub-section in Quick Rule Reference.
- `skills/om-orchestrate/prompts/coding-agent.md` — Rules section, autonomous-fleet variant of the rule (route through om-cto, on `wait-for-upstream` set `status:blocked`+post upstream link+exit).
- `README.md` — v1.12.1 callout above the v1.12.0 callout describing the new triage discipline.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.12.1.
- `CHANGELOG.md` — this entry.

#### What this is NOT

- NOT a new top-level skill (per the v1.12.0 surface-budget rule). The triage logic lives as an on-demand reference inside `om-cto`.
- NOT a replacement for ejection — ejection is still the last resort when UMES is genuinely insufficient. Triage clarifies whether the trigger for ejection is real or imagined.
- NOT a gate that blocks legitimate fast paths — `not-a-bug` verdicts return correct usage in the same hop, no filings needed.

## 1.12.0

### Added — `om-orchestrate` skill (Phase 1 of the road to v1.14.0 oneshot)

A new top-level skill that runs a fully autonomous agent fleet via GitHub Issues + labels + PR comments. Phase 1 ships single-agent + e2e-singleton + auto-merge mode. Phase 2 (v1.13.0) raises `parallel_n` for multi-agent; Phase 3 (v1.14.0) closes the loop with full failure recovery + Projects v2 view. End state of v1.14.0: typing `/om-orchestrate <app-spec>` produces merged PRs with no human babysitting.

**Driven by** the user's stated goal — *oneshot OM systems* — and three failures observed in PRM forensics: v1.11.5 (agents sleeping during /loop self-pace) was the *symptom*; the *cause* was no peer to yield to. v1.11.6 (review-skipped) was the *symptom*; the *cause* was no downstream gate that another agent enforced. v1.12.0 builds the substrate: an agent that yields work via labels and another agent that picks it up.

#### Skill structure (context-budget discipline)

The entire orchestration system adds **at most one new top-level skill** to the plugin. Total session-start context tax: ~150 tokens (one skill description), not ~1000 (the naive design with five separate skills). 6× reduction. Internal "agents" are PROMPTS fed to background `claude -p` processes by the dispatcher script — they never appear in the Skill router and never tax session start.

```
skills/om-orchestrate/
├── SKILL.md                                # ~80 lines, just enough for routing
├── references/                             # loaded on-demand, zero session tax
│   ├── agent-contracts.md
│   ├── claim-protocol.md
│   ├── dispatcher.md
│   ├── failure-recovery.md
│   ├── orchestration-yml.md
│   └── bootstrap.md
├── prompts/                                # fed to claude -p at runtime, never loaded as skills
│   ├── coding-agent.md
│   ├── e2e-agent.md
│   └── merge-agent.md
└── scripts/
    └── dispatcher.sh                       # the bash wrapper
```

#### Subcommands

- `/om-orchestrate init` — bootstrap UX. Writes `.ai/orchestration.yml`, creates the 11 status labels, verifies `gh auth`. Idempotent.
- `/om-orchestrate run [<app-spec>]` — start the dispatcher. Spawns one e2e singleton + one coding agent (Phase 1; raises to N in Phase 2). Runs until queue drains.
- `/om-orchestrate status` — read-only state report.
- `/om-orchestrate stop` — graceful shutdown.

#### Key design decisions baked into v1.12.0

- **Issues, not PRs, are work units.** Earlier draft used PRs; Issues are a strict upgrade because the work exists from decomposition (before any code), failed PRs don't muddy state (issue stays open, new PR can be linked), and dependencies use the well-known `Blocked by #N` idiom.
- **Claim protocol uses single-instance `claim:agent-<ts>-<pid>-<host>` label + verify-after-add + lowest-timestamp tiebreaker.** GitHub does NOT return 422 on duplicate `--add-assignee` (assignees are additive); the v0.1 spec assumed wrong. The corrected primitive is race-safe sub-second.
- **Dispatcher is a bash wrapper (`scripts/dispatcher.sh`), not a long-running claude session.** Coding agents are short-lived per-tick `claude -p` processes. E2E singleton is the one long-lived `/loop` process. Stateless beyond GitHub labels — the dispatcher (or any agent) can be killed and recovers.
- **Project-agnostic via `.ai/orchestration.yml`.** Every adopting OM project declares its own e2e command, required env, merge strategy, base branch, parallel_n, etc. No hardcoded PRM-specific assumptions. Community-fit by design.
- **Auto-merge ships in Phase 1.** Trivial when only one PR is in flight (no conflict possible). Pulled forward so v1.14.0 doesn't have to add it. Multi-PR conflict auto-rebase ships in Phase 2 (v1.13.0).
- **Cost telemetry instrumented from day 1.** Per-tick jsonl logs to `/tmp/om-telemetry/`. Phase 2 baseline measurement is therefore a deferred-but-easy step.

#### `om-implement-spec` Step 8 — additive singleton-detect fallback

`om-implement-spec` Step 8 (Verification → Integration tests) is patched additively. When ready for tests, the implementer detects whether an e2e singleton is alive (`.ai/orchestration.yml` exists + `/tmp/om-agent-e2e.pid` names a live process + recent e2e comment posted). If alive → enqueue via `status:coding → status:needs-e2e` label transition + lean handoff comment, exit. If not alive → fall back to inline `yarn test:integration:ephemeral` (current v1.11.6 behavior). Three positive signals required to enqueue; false positives unacceptable; false negatives recoverable.

**BC**: nothing breaks for users who haven't run `/om-orchestrate init`. Identical v1.11.6 behavior in inline path.

### Bundled — lean GitHub language (formerly v1.11.7)

The lean GitHub communication style codification was originally planned as v1.11.7. Per the context-budget rule and to avoid release-ceremony churn, it ships AS PART OF v1.12.0:

- **`om-auto-create-pr` Step 12** — verbose "comprehensive summary comment" template (~50 lines with stat tables, file lists, §-citations, internal skill names) replaced with a 6-line lean template: run plan path + status + plain-English what-changed + verification one-liner + rollback note. No stat tables, no SHA dumps, no internal jargon.
- **`om-auto-continue-pr` Step 8** — same shape rewrite for resume comments. Same 6-line lean template.
- **`om-auto-review-pr` Step 11** — completion comment tightened to one short line. Verdict + findings live in the formal review body (step 8), not duplicated into the completion comment.
- All three skills now MUST NOT paste secrets, env var values, raw test output, or unredacted stack traces in any comment. (The rule existed in `auto-continue-pr`'s Rules block; v1.12.0 standardizes it across the trio.)

Pre-v1.11.7 PRs in any repo retain their verbose comments as historical record — no retroactive rewriting.

### Files touched

- `skills/om-orchestrate/SKILL.md` (new) — ~80 lines, the only new top-level skill.
- `skills/om-orchestrate/references/{bootstrap,orchestration-yml,dispatcher,agent-contracts,claim-protocol,failure-recovery}.md` (new × 6) — on-demand references; zero session-start cost.
- `skills/om-orchestrate/prompts/{coding-agent,e2e-agent,merge-agent}.md` (new × 3) — content fed to background `claude -p` processes; not skills.
- `skills/om-orchestrate/scripts/dispatcher.sh` (new) — bash wrapper that spawns the fleet.
- `skills/om-implement-spec/SKILL.md` — Step 8 patched additively with singleton-detect fallback.
- `skills/om-auto-create-pr/SKILL.md` — Step 12 verbose template replaced with lean version.
- `skills/om-auto-continue-pr/SKILL.md` — Step 8 verbose template replaced with lean version.
- `skills/om-auto-review-pr/SKILL.md` — Step 11 completion comment tightened.
- `README.md` — bumped from "18 user-facing skills" to "19" + new entry in Automation table + v1.12.0 callout.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.12.0.
- `CHANGELOG.md` — this entry.

### Phasing toward v1.14.0 oneshot goal

| Phase | Version | Surface |
|---|---|---|
| **Phase 1 (this release)** | v1.12.0 | E2E singleton + label vocabulary + bootstrap UX + auto-merge for single-agent + lean language. **Validation surface: PRM Spec #6 single-agent end-to-end through auto-merge.** |
| Phase 2 | v1.13.0 | Multi-agent coding (parallel_n > 1) + claim protocol race-safety + multi-PR conflict auto-rebase + cost baseline measurement. **Validation: PRM Spec #6 + #7 in parallel.** |
| Phase 3 | v1.14.0 | Full failure recovery (machine-reboot, dispatcher crash, mid-merge crash) + GitHub Projects v2 status field + kanban view for humans. **v1.14.0 = oneshot-complete.** |

### Process notes (lessons)

- The `om-orchestrate` skill avoids the trap of "5 new skills for orchestration" by treating internal agents as prompts (fed to `claude -p`) and workflow detail as references (loaded on-demand). New rule for any future orchestration extensions: at most ONE new top-level skill per architectural concern. Captured as a feedback memory.
- Bundling v1.11.7's lean-language codification into v1.12.0 saves a release-ceremony round and demonstrates that small refactors don't always need their own version bump — they ship with the next behavior change that needs them.
- The pre-implementation analysis (`docs/specs/analysis/ANALYSIS-2026-05-07-github-tasks-orchestration.md`) caught 4 critical issues in the v0.1 spec before any code was written. Continue this discipline for future major specs — Piotr's spec-readiness gate is cheap and high-value.

## 1.11.6

### Added — om-implement-spec post-PR review gate

**Triggered by PRM PR #4 + PR #5 (consecutive incidents, same shape).** Two autonomous spec implementations stopped at "PR opened" without invoking any real code-review pass. PR #4 (Spec #4 WIC ingestion) shipped a "merge-ready" comment; the user caught it manually with *"we havent closed this in clean way, have we run tests, ui tests, design system review code review?"* — triggered 5 cleanup iterations. PR #5 (Spec #5 RFP broadcast/response) repeated the exact same gap one day later: 14 commits, run plan C5 ran typecheck + jest + integration + opened the PR + posted "Spec #5 shipped end-to-end" + went idle. **Zero `om-auto-review-pr` invocation. Zero `om-ds-guardian REVIEW` on the new portal pages. Zero security checklist pass.** The fix from PR #4 lived only in the user's session memory and was never encoded into om-superpowers.

The gap: `om-auto-create-pr` (Step 11) and `om-auto-continue-pr` (Step 7) both run `om-auto-review-pr` in autofix loop until clean. **`om-implement-spec` doesn't.** Its Step 6 ("Self-Review") is the implementer reading the checklist *to itself*, which catches the rules the implementer was already trying to follow but does NOT catch cross-file architectural concerns, security checklist items needing fresh eyes (orgId scoping, tenant isolation, ACL guards), DS-Guardian findings, BC concerns on contract surfaces, or test-coverage gates that fire at commit boundaries. The orchestrator (`impl-orchestrator.md` Step 2) named "Code review: passed" as a gate but didn't actually invoke `om-auto-review-pr` — it left that to the implementer, which didn't do it. Net cost: every `om-implement-spec` run produced a PR that *looked* complete but bypassed the same review pass every other PR-producing skill enforces.

v1.11.6 closes the gap with the same three-layer doc-only shape as v1.11.5. No enforcement hook (rejected — false-positive risk on legitimate "stopped early because user interrupted" or "stopped because real blocker" cases, see spec § Why doc-only, no hook). See `docs/specs/2026-05-07-implement-spec-post-pr-gate.md` for the full forensic and rationale.

#### Layer 1 — `skills/om-implement-spec/SKILL.md` new Step 9 "Post-PR Review Gate"

Inserted after Step 8 Verification, before Subagent Strategy. Mirrors the language from `om-auto-create-pr` Step 11 and `om-auto-continue-pr` Step 7. Mandates: invoke `auto-review-pr <PR#>` in autofix mode against the resulting PR; chain `om-ds-guardian REVIEW` for UI changes; loop until clean verdict or non-actionable findings explicitly documented in the spec's `## Implementation Status` notes column; if `auto-review-pr` cannot run, escalate by leaving the spec status as `in_progress` and reporting the blocker to the user. **Closing line: do not report a spec implementation complete until this step has passed.**

#### Layer 2 — `skills/om-cto/references/impl-orchestrator.md` Step 2 "Verify completion"

The "Code review: passed" bullet was a passive checkbox the implementer self-attested. Now explicitly says `om-auto-review-pr <PR#>` must be invoked and return a clean verdict, autofix loop applied, all Critical/High findings fixed, DS-Guardian REVIEW chained for any UI changes. Notes that as of v1.11.6, `om-implement-spec` Step 9 enforces this; Piotr verifies it actually ran and passed before checkpointing.

#### Layer 3 — `om-implement-spec` Rules block one-liner

Added: *"MUST NOT report a spec implementation complete until `om-auto-review-pr` has returned a clean verdict on the resulting PR (Step 9). Step 6's self-review is the implementer reading the checklist to itself and does not substitute for a real review pass. Two production incidents (PRM PR #4 + PR #5) shipped without this gate."*

### Files touched

- `README.md` — added v1.11.6 callout under the Implementation skills table explaining the new Step 9 gate.
- `skills/om-implement-spec/SKILL.md` — new Step 9 + Rules one-liner.
- `skills/om-cto/references/impl-orchestrator.md` — operationalized "Code review: passed" bullet in Step 2.
- `docs/specs/2026-05-07-implement-spec-post-pr-gate.md` — new forensic + rationale + verification criteria + why-no-hook.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.11.6.
- `CHANGELOG.md` — this entry.

### Process notes (lessons)

- The fix that surfaced from PR #4's "we haven't closed this in clean way" correction lived only in the user's session memory. The next spec implementation (PR #5) walked into the same gap one day later. **One-time corrections in conversation do not persist; only doc/skill/memory layer changes do.** This release codifies the rule so it survives the next session.
- Two consecutive incidents with the same shape is the threshold for a v1.X release in this project. v1.11.5 (the /loop self-pace fix) and v1.11.6 (this fix) both ship from the same patryk-standalone forensic vein. If v1.11.7 emerges from the same source, it will likely be a hook escalation — the doc layer is getting its second fair trial.
- Saved as a feedback memory: `om-implement-spec` does not invoke `om-auto-review-pr` in versions ≤ v1.11.5; future sessions in om-superpowers context need to know this gap closed in v1.11.6 and remember to run the review pass themselves if they encounter pre-v1.11.6 behavior.

## 1.11.5

### Added — autonomous loop policy

**Triggered by patryk-standalone forensic.** A long-running orchestrated session (Spec #5: RFP broadcast/response, branch `feat/prm-spec-05-rfp-broadcast-response`) was told mid-run to "do that in our ralph loop approach" and invoked the harness `/loop` skill *self-paced* (no interval). That mode wires the agent to call `ScheduleWakeup` between iterations, whose tool-description default for "idle ticks" is 1200–1800 s. The agent dutifully picked 1200 s, then 1500 s, while a run plan with C1.10/C2.x/C3a–d/C4/C5 unchecked sat right next to it. Each "tick" inserted a 20–30 min do-nothing gap per commit, and at iteration 4 the agent wrote a `ScheduleWakeup` reason — *"cache-friendly idle window keeps prompt cache warm across iterations"* — that contradicts the tool's own first sentence (cache TTL is 300 s, not 1500 s).

The `/loop` skill is harness-owned and we can't patch its tooltip. What om-superpowers controls is the dispatch context — what an agent reads when entering autonomous Ralph mode via `om-cto` / `om-implement-spec` / `om-auto-continue-pr`. Before this release, those skills were silent on `/loop` mode selection; the agent had no policy to anchor against. v1.11.5 closes that gap with a three-layer doc-only policy. No enforcement hook (rejected — false-positive risk on legitimate polling-mode wake-ups). See `docs/specs/2026-05-07-autonomous-loop-policy.md` for the full forensic and rationale.

#### Layer 1 — `README.md` "Autonomous Ralph-style runs" anti-pattern callout

Adds an explicit **do NOT use `/loop` self-paced for chained autonomous coding** callout under the existing v1.11.0 cron-mode example. Names the two correct patterns: `/loop 5m /auto-continue-pr <PR#>` (cron mode, fresh context per turn) or a single long conversation that chains checklist items without sleeping. Calls out the cache-TTL contradiction so users who get burned by it again can recognize the failure mode.

#### Layer 2 — `skills/om-cto/references/impl-orchestrator.md` § Autonomous loop policy

Adds a three-paragraph subsection right after "Dispatch Context: Implementation." Says implementation runs in this conversation, chained; for unattended runs, use cron-mode `/loop` or a single long Task agent. Explicitly forbids `/loop` self-paced for chained autonomous coding and explains why (idle-tick default doesn't fit queued work). Cites the patryk forensic.

#### Layer 3 — `om-implement-spec` and `om-auto-continue-pr` Rules one-liner

Each skill's Rules section now includes: *"MUST NOT call `ScheduleWakeup` between phases / iterations / checklist items. … delay >270 s while a run-plan checklist has unchecked items is an anti-pattern."* Cross-references the orchestrator policy. Catches the case where the agent never reads the orchestrator reference but does reach the SKILL.md Rules block.

### Files touched

- `README.md` — added v1.11.5 anti-pattern callout under "Autonomous Ralph-style runs."
- `skills/om-cto/references/impl-orchestrator.md` — new "Autonomous loop policy" subsection after "Dispatch Context: Implementation."
- `skills/om-implement-spec/SKILL.md` — appended `ScheduleWakeup` rule to Rules section.
- `skills/om-auto-continue-pr/SKILL.md` — appended `ScheduleWakeup` rule to Rules section.
- `docs/specs/2026-05-07-autonomous-loop-policy.md` — new forensic + spec.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.11.5.
- `CHANGELOG.md` — this entry.

### Process notes (lessons)

- The `/loop` skill is shipped by the harness, not by om-superpowers. We can't patch its tooltip default of 1200–1800 s. Anchoring policy in our own dispatch contexts and skill Rules is the only lever we have when the agent reaches for the wrong harness mode.
- Saved as a feedback memory: `/loop` self-pace is for polling external signals; for chained autonomous coding, use cron mode (`/loop 5m …`) or a single long conversation. Future sessions in om-superpowers context shouldn't re-derive this from scratch.

## 1.11.4

### Documentation

- `README.md` — added two callouts under the Automation skills table for behavior changes that shipped in v1.11.2 (auto-review-pr autofix gate) and v1.11.3 (duplicate-work prevention via `gh pr list` keyword overlap check). Skimmers reading the README to understand `om-auto-create-pr` / `om-auto-continue-pr` / `om-auto-review-pr` will now see all three layers without digging into the CHANGELOG.

### Removed

- **All Polish-language text removed from active skills, hooks, and references.** Owner directive: skills/docs are English-only. Three places had active Polish:
  - `hooks/session-start` — removed `"co dalej"` and `"kontynuuj"` from the vague-prompt example list in the entry-point block. Replaced with English equivalents (`"what's next"`, `"resume"`).
  - `skills/om-cto/SKILL.md` — removed the `"zanim zaczniemy kodzenie"` trigger phrase from the description frontmatter. The English equivalent (`"before we start coding"`) remains.
  - `skills/om-cto/references/advisory.md` — replaced the Polish-equivalents list (`"około"`, `"mniej więcej"`, `"z grubsza"`) for hedge-word ban with the language-agnostic phrasing `"or any equivalent hedge in any language"`. Same semantic ban, no Polish strings.

CHANGELOG entries from prior releases (v1.7.2, v1.8.0, v1.11.0) that mention Polish phrases as historical context are preserved as-is — historical record should not be rewritten.

### Process notes (lessons)

- v1.11.3 shipped a behavior change without a matching README callout — same gap as v1.10.0 → v1.10.1. Caught only when explicitly asked to audit "shipped in pro way?" Saved as a feedback memory: README updates for behavior changes belong in the SAME commit as the behavior, not deferred.
- Polish trigger phrases had crept in across three releases (v1.7.2, v1.8.0, v1.11.0) without a written rule prohibiting them. Owner directive on 2026-05-07 establishes the rule going forward: skills/docs are English-only. Saved as a feedback memory.

### Files touched

- `README.md` — added two callouts under the Automation skills table.
- `hooks/session-start` — removed two Polish phrases from the entry-point block's vague-prompt example list.
- `skills/om-cto/SKILL.md` — removed one Polish trigger phrase from the description frontmatter.
- `skills/om-cto/references/advisory.md` — replaced Polish-equivalents list with language-agnostic phrasing.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.11.4.
- `CHANGELOG.md` — this entry.

## 1.11.3

### Added — duplicate-work prevention (two layers)

**Triggered by patryk-standalone forensic.** A session ran "continue our auto development" and over 36 minutes created `feat/prm-spec-04-wic-ingestion` with 7 commits re-implementing WIC ingestion under "T4" labels — while PR #4 (`feat/prm-t3-wic-ingestion`, "T3: PRM WIC ingestion (Spec #4)") was already open with the exact same scope. The agent had run `gh pr view 4` and seen the existing tracking plan. It proceeded anyway. The local `.ai/runs/` scan only saw plans on the current branch — PR #4's plan lived on its own feature branch and was invisible to the v1.11.0 entry-point detection.

This release closes both gaps with two complementary layers:

#### Layer 1 — `hooks/session-start`: open-PR tracking-plan scan (soft surfacing)

After the existing local `.ai/runs/` scan, the SessionStart hook now runs:

```bash
gh pr list --state open --json number,headRefName,body --limit 30 \
  | python3 [extract Tracking plan: <path> from each PR body]
```

When matches are found, an "In-Flight Work Detected Elsewhere" block is injected into the agent's context with the canonical list of tracking plans backed by open PRs, plus a hard rule: if the incoming task overlaps, STOP and run `om-auto-continue-pr <PR#>` instead of forking. Tolerates `gh` unavailability (skips silently). One network call (~500ms), additive to the v1.11.0 entry-point block.

#### Layer 2 — `om-auto-create-pr` step 0: keyword-overlap check (hard enforcement)

Before claiming the slug, step 0 now extracts keywords from the brief (Spec numbers, module names, feature words) and runs `gh pr list --search "<keywords> in:title,body"`. If any open PR matches:

- **STOP.** Surface the matched PR(s) to the user via `AskUserQuestion`.
- Wait for explicit choice: `resume` (hand off to `auto-continue-pr`), `parallel` (confirm intentional fork), or `abort`.
- Never silently fork against an open PR for the same Spec / module / feature.

Hard enforcement because the patryk-standalone forensic showed the agent had `gh pr view 4` data and ignored it. Surfacing alone wasn't enough; the create-pr step needs to halt and ask.

A new entry was added to the skill's Rules section locking in the discipline. `gh` unavailability falls back to the SessionStart hook's soft layer.

### Why two layers, not one

The SessionStart hook is informational — it makes the right answer obvious in the agent's context. It does NOT prevent the agent from creating a new plan if it judges (incorrectly) that the work is parallel. The auto-create-pr step 0 check makes the wrong answer expensive: the agent has to either match keywords differently (hard) or affirmatively confirm parallel work to the user. Two layers because a single soft surfacing layer empirically does not stop the failure.

### Smoke-tested

- Non-OM directory: hook returns `{}` ✓
- OM project, no open PRs: no In-Flight block ✓
- OM project with open PR carrying `Tracking plan:` line in body (verified against patryk-standalone): block correctly lists `PR #4 (feat/prm-t3-wic-ingestion): .ai/runs/2026-05-06-prm-t3-wic-ingestion.md` ✓

### Honest limits

- Hook scan caps at 30 open PRs (`--limit 30`) — repos with hundreds of open PRs may need the limit raised.
- Keyword extraction in auto-create-pr step 0 uses a project-vocabulary regex that needs tuning per repo (Spec numbering format, module names). The example regex matches OM projects' patterns; downstream apps may need to adjust.
- Both layers depend on PR bodies actually containing the `Tracking plan:` line — auto-create-pr writes this by default, but manually-created PRs do not. Cross-branch git scan (find `.ai/runs/` files in branches without an open PR) is deferred to a future release if the v1.11.3 baseline shows it's needed.
- Network failure / no `gh` auth: both layers degrade gracefully (skip the scan, do not block the session). The local-only fallback is the v1.11.0 entry-point detection.

### Files touched

- `hooks/session-start` — added `open_pr_plans` scan via `gh pr list` + python regex extraction; conditional "In-Flight Work Detected Elsewhere" block appended to OM_CONTEXT when matches are found.
- `skills/om-auto-create-pr/SKILL.md` — added "Duplicate-PR keyword check" sub-section in step 0 (~30 lines) + one new entry in the Rules section.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.11.3.
- `CHANGELOG.md` — this entry.

## 1.11.2

### Fixed

- **`om-auto-review-pr` autofix commits now run the tests-with-code gate.** The gate was added to `om-auto-create-pr` step 6 and `om-auto-continue-pr` step 4 in v1.10.0 but NOT to `om-auto-review-pr`'s autofix loop. Forensic check of a recent session (patryk-standalone, PR #4 autofix pass) showed an autofix commit titled `fix(prm): tenant-scope all WIC query paths + migrate to findWithDecryption` landed code-bearing changes without test files in the same commit, and the gate signature `git diff --cached --name-only` never appeared. The gate is now in `om-auto-review-pr` §10 as a "Tests-with-code gate (mandatory before every autofix commit)" sub-section, with the same shell block and same exemptions as the other two auto-* skills, plus a new entry in the Rules list.
- **`scripts/sync-om-skills.sh` retroactively corrected.** v1.10.0's CHANGELOG claimed `om-auto-create-pr` and `om-auto-continue-pr` were removed from `CORE_SKILL_PAIRS`, but the actual v1.10.0 commit (`5135095`) shipped without that file change. Both skills have been at risk of CI sync overwrite since v1.10.0 — every daily sync run could have wiped the gate edits. v1.11.2 removes all three auto-* skills (including the newly-forked auto-review-pr) from `CORE_SKILL_PAIRS` and updates the header comment to reflect the actual fork timeline.
- **`README.md` Custom vs Synced table** was also stale relative to v1.10.0's claims. Now correctly lists all three auto-* skills as Custom and explains the fork timeline.

### Why this gap existed

The tests-with-code gate is a per-skill copy, not a shared layer. v1.10.0's spec was scoped to "skills produced by `om-auto-create-pr` and resumed by `om-auto-continue-pr`" — `om-auto-review-pr`'s autofix loop is a third entry point that also produces commits, and v1.10.0's spec didn't enumerate it. The forensic on PR #4's autofix surfaced this as a real coverage hole, not a hypothetical one.

This is a coverage-completeness fix, not a new feature. Same gate, same shell block, third invocation site.

### Files touched

- `skills/om-auto-review-pr/SKILL.md` — added a "Tests-with-code gate (mandatory before every autofix commit)" sub-section in §10 (the autofix loop) plus one new entry in the §Rules section.
- `scripts/sync-om-skills.sh` — removed all three auto-* skills from `CORE_SKILL_PAIRS`, corrected header comment to reflect actual fork timeline.
- `README.md` — Custom vs Synced table now lists all three auto-* skills as Custom; added paragraph explaining the fork timeline (v1.10.0 + v1.11.2).
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.11.2.
- `CHANGELOG.md` — this entry.

### Honest note

Two of the three changes in this release (sync-script removal, README table) are corrections of oversights from v1.10.0, not new work. v1.10.0's CHANGELOG documented these as "landed" when they had not actually been committed. Caught only because v1.11.2 was investigating a related issue (the auto-review-pr gap). Lesson saved to memory: verify CHANGELOG claims against the actual diff before tagging.

## 1.11.1

### Documentation

- `README.md` — added two callouts under the Automation skills table: (1) brief note on the v1.11.0 entry-point auto-detection, (2) **Autonomous Ralph-style runs** section explaining how to compose Claude Code's harness `/loop` skill with `om-auto-continue-pr` for unattended execution. No custom bash wrapper is shipped — the harness's `/loop` already does what Ralph's `for` loop does, and v1.11.0's SessionStart hook makes each cold iteration self-orient toward the in-progress plan.

No behavior change. Manifest bump only so `/plugins marketplace update om-superpowers` actually picks up the README for users on v1.11.0.

## 1.11.0

### Added

- **Smart entry-point auto-detection** in `hooks/session-start`. The hook now inspects the project filesystem and injects a specific actionable recommendation into the agent's context, so the agent picks the right om-* skill to invoke even when the user prompt is vague ("continue", "finish this", "let's go", "co dalej", "kontynuuj"). Three states are detected:
  - **In-progress run** (`.ai/runs/*.md` with unchecked `- [ ]` items) → recommends `gh pr list --search "Tracking plan: <basename>"` + `om-auto-continue-pr <PR#>`. Includes plan path and unchecked-step count.
  - **Approved specs without execution plan** (specs with `Status: approved/ready/implemented`) → recommends invoking `om-cto` Implementation Orchestrator.
  - **app-spec/ phase only** → recommends `om-cto` Spec Orchestrator (if Cagan output present) or `om-product-manager` (if not).
- The recommendation includes an explicit reminder: per-atomic-commit gates (currently tests-with-code; future DS/e2e/code-review when baseline justifies) live inside the auto-* SKILL.md content and only fire when those skills are invoked. Ad-hoc `git commit` calls bypass the gate. The recommendation routes the agent through a skill where the gate is present.
- Smoke-tested across 5 scenarios: non-OM (silent), OM-no-state, in-progress plan, approved specs, app-spec only — all behave correctly.

### Why

Forensic data from a recent session (oss-prm / patryk-standalone-standalone-app, 563 records, 92 Bash calls, 6 git commits): the agent invoked `Skill` exactly once and `Agent` exactly once. The tests-with-code gate (shipped in v1.10.0) never fired — its signature `git diff --cached --name-only` + grep never appeared. Root cause: the user said "lest finish this project" (vague continuation prompt), the agent did not route to `om-auto-create-pr` / `om-auto-continue-pr` / `om-implement-spec`, and went into ad-hoc Bash mode. The gate is dead text on disk if the skill that contains it is not invoked.

This release moves entry-point selection from "agent figures it out from prose in the hook" to "hook does filesystem detection and injects a specific command." Determinism on entry; gate then fires because the skill it lives in has been invoked.

### Fixed

- `hooks/session-start` had a latent `set -e` + `pipefail` interaction with `grep`'s no-match exit code (1) that would cause the hook to exit silently when scanning `.ai/specs/` for approved specs returned zero matches. Wrapped the grep in a brace block with `|| true` to neutralize. Caught during smoke-testing of the new entry-point detection path.

### Honest scope

This is **entry-point** determinism, not **mid-session** determinism. The agent can still bypass the recommendation and run ad-hoc Bash. A `PreToolUse` hook on `git commit` (harness-level harder enforcement) is a separate piece of work — not in v1.11.0. After this release, baseline 5 sessions and measure: did the agent follow the entry-point recommendation? If <70%, the hook needs strengthening or we ship the PreToolUse Bash interceptor.

### Files touched

- `hooks/session-start` — added `most_recent_plan` / `in_progress_count` / `has_app_spec` / `approved_specs_count` detection (~30 lines), conditional `ENTRY_POINT` block (~40 lines, 0 tokens when nothing detected, ~600 tokens when most-likely-case in-progress fires).
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.11.0.
- `CHANGELOG.md` — this entry.

## 1.10.2

### Added

- **OM vanilla hybrid routing rule** in `hooks/session-start`. When an OM project also has `.ai/skills/` (i.e. AGENTS.md path mandates are present alongside the plugin), the SessionStart hook appends a routing-precedence section to the agent's context:
  - `.ai/skills/<name>/SKILL.md` path mandates from AGENTS.md are authoritative for synced skills.
  - Plugin om-`<name>` Skills that are synced from upstream are cross-reference only — same content, do not double-fire.
  - Plugin om-cto, om-product-manager, om-ux, om-user-proxy, om-auto-create-pr, om-auto-continue-pr are PRIMARY (custom in this repo or forked ahead of upstream).
- Smoke-tested across three scenarios: non-OM project (silent), OM project without `.ai/skills/` (no vanilla block), OM vanilla (block injected).

### Why

When a developer works inside the upstream OM clone with the plugin installed, AGENTS.md routes tasks like "implementing a spec" to `.ai/skills/implement-spec/SKILL.md` AND the plugin description for `om-implement-spec` matches the same prompt. Both fire — same content loaded twice in context, possible behavior drift between path mandate and (slightly stale) plugin sync. The routing rule tells the agent: defer to AGENTS.md path for synced skills, use plugin Skill for the 6 custom/forked ones.

### Honest caveats

- This is **soft enforcement**. Description-match still fires the plugin Skill if the model judges it hits — the rule asks the agent to skip the redundant invocation but does not block at the harness level.
- Subagents (Agent tool dispatches) may not inherit the SessionStart context. The rule reminds the orchestrator to include precedence inline when delegating to subagents.
- Custom-vs-synced skill list in the hook is hard-coded. If `scripts/sync-om-skills.sh` changes which skills are synced, the hook needs a matching update. Comment in the hook flags the maintenance burden.

### Verification plan

After v1.10.2 ships, baseline 5 sessions inside an OM-vanilla project (e.g. an `open-mercato/open-mercato` clone). Count: how often does the agent double-fire a synced skill (path mandate + plugin Skill invocation for the same task) despite the routing rule? Decision rule:

- **<10% double-fire:** hook is sufficient. Lock in.
- **10–30%:** add the precedence reminder to synced skill description fields ("if AGENTS.md path mandate exists, defer").
- **>30%:** soft enforcement isn't enough; consider stripping synced skills from the plugin entirely or thinning them to redirect stubs.

This mirrors the v1.10.0 lesson: ship the right tool for the layer, then measure rather than declare it solved.

### Files touched

- `hooks/session-start` — added `is_om_vanilla` detection (3 lines) + conditional routing block (~40 lines, ~300 tokens injected into agent context only when `.ai/skills/` is present)
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.10.2
- `CHANGELOG.md` — this entry

## 1.10.1

### Documentation

- `README.md` — added a callout under the Automation skills table describing the new tests-with-code gate (introduced in v1.10.0). Skimmers reading the README to understand `om-auto-create-pr` / `om-auto-continue-pr` behavior will now see the gate without having to dig into the CHANGELOG. Links to the spec and baseline.

No code changes. Manifest bump only so `/plugins marketplace update om-superpowers` actually picks up the README change for users on v1.10.0.

## 1.10.0

### Added

- **Tests-with-code gate at commit time.** `om-auto-create-pr` step 6 and `om-auto-continue-pr` step 4 now run a ~10-line shell check on the staged index before `git commit`. If the staged diff contains source code (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs` outside `__tests__/` and not matching `*.test.*` / `*.spec.*`) but no test files, the gate blocks the commit. The agent then either adds tests in the same commit or splits the staged set so test-bearing changes land separately. No retry counter, no `needs-human` label, no audit log — single mechanical check.

### Why narrowed from v1.9.0's four-gate proposal

v1.9.0 proposed four per-commit gates (DS, unit tests, e2e-when-applicable, code-review fast subset) and was yanked the same day after internal review surfaced two critical bugs and a process violation (see v1.9.1 entry).

The follow-up baseline (`docs/specs/2026-05-06-ralph-loop-baseline.md`, N=5 most recent `om-auto-create-pr` PRs, 15 code-bearing commits) found:

- **Tests-with-code gap:** 0/15 commits landed tests in the same commit as code. Real, measurable, mechanical to fix → ships in v1.10.0.
- **DS gap:** 0 DS issues caught at end-of-PR across the 5 PRs. Sample is backend-biased; no evidence of a gap → defer.
- **E2E gap:** 0/2 same-commit landing rate, but N=2 doesn't clear any decision threshold → defer to v1.11+ pending re-baseline of UI-heavy PRs.
- **Code-review fast subset:** ~3/15 mechanical issues catchable; 100% already auto-fixed by existing end-of-PR `om-auto-review-pr` autofix pass → drop. Marginal value over existing infrastructure.

Conclusion: only the test-coverage gap was real in this sample. v1.10.0 ships that one gate, nothing else.

### Specs

- New: `docs/specs/2026-05-06-test-coverage-at-commit.md` (the spec that drives v1.10.0).
- Evidence: `docs/specs/2026-05-06-ralph-loop-baseline.md` (the N=5 baseline that narrowed scope).
- Superseded: `docs/specs/2026-05-06-ralph-loop-per-commit-gates.md` (v1.9.0's spec, marked SUPERSEDED at the top, body preserved as historical record).

### Verification plan for v1.11.0

- Re-baseline the next 5 `om-auto-create-pr` PRs after v1.10.0 ships.
- Success criterion: same-commit test landing rate ≥ 90% (vs. 0% baseline).
- Failure criterion: rate < 50% — investigate root cause before adding more gates.
- At the same time, re-baseline UI PRs (e2e gate candidate) and end-of-PR DS findings (DS gate candidate). If either gap holds with N=5, ship in v1.11.0.

### Migration notes

- Update with `/plugins marketplace update om-superpowers`.
- The gate is mechanical: if the agent stages source code without tests, the check blocks the commit. Existing patterns where tests landed in a separate later commit will need to be revised — either include tests in the same commit, or split the staged set so test-immune changes (config, docs, package.json) land in their own commit.
- No new files were added. No `_shared/` directory. The check is inline in two SKILL.md files. If a third caller appears later, extract to a shared reference then.

### Files touched

- `skills/om-auto-create-pr/SKILL.md` — step 6 gains the gate, subsequent steps renumbered.
- `skills/om-auto-continue-pr/SKILL.md` — step 4 gains the gate, subsequent steps renumbered.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version 1.10.0.
- `CHANGELOG.md` — this entry.
- `docs/specs/2026-05-06-test-coverage-at-commit.md` — new spec.
- `docs/specs/2026-05-06-ralph-loop-baseline.md` — baseline evidence (already shipped in v1.9.1 trail).
- `docs/specs/2026-05-06-ralph-loop-per-commit-gates.md` — v1.9.0 spec, marked SUPERSEDED at the top.

## 1.9.1

### Rollback of v1.9.0

v1.9.0 has been **yanked**. This release reverts commit `e5691c2` and restores the codebase to the v1.8.0 behavior. Users who installed v1.9.0 should update via `/plugins marketplace update om-superpowers` to receive the rollback.

### Why

Internal review of v1.9.0 surfaced two critical bugs and a process violation:

1. **Fictional invocation contracts.** `skills/_shared/per-commit-gates.md` documented `om-code-review --fast` and `om-ds-guardian` reading `/tmp/staged.diff`. Neither exists — both targets are Skills (invoked via the Skill tool), not CLIs. At runtime the agent would either fabricate an invocation or silently skip the gate. Two of three gates therefore would not run as documented.
2. **Pre-commit semantics chosen wrong for the stated use case.** OQ-1 was resolved as pre-commit (gate the staged index, leave dirty index on retry exhaustion). For dispatched / unattended runs, post-commit-with-revert gives `git log` as the audit trail and avoids the dirty-worktree-to-physically-re-attach problem. Wrong choice for the actual use case.
3. **Spec verification step skipped.** The spec's own Verification step 1 required auditing the last 5 `om-auto-create-pr` PRs to baseline what gates would catch at commit time vs end-of-PR. That audit was not run before implementation. There was no evidence the per-commit gate solves a failure mode the existing end-of-PR pass doesn't already catch.

### What's still in flight

The work is not abandoned — only rolled back. The plan, in order:

1. Run the L93 baseline (5 most recent `om-auto-create-pr` PRs, per-commit gate-coverage analysis with numbers).
2. Branch on the baseline data: ship gates, ship them partially, or abandon.
3. If shipping: rewrite `_shared/per-commit-gates.md` with real Skill-tool invocations, replace per-commit `om-code-review` with a focused inline subagent (security + arch only), flip OQ-1 to post-commit-with-revert, collapse work-commit + Progress-flip + Gate-log into one commit per Step. Ship as v1.10.0.

### Migration notes

- If you installed v1.9.0, run `/plugins marketplace update om-superpowers` to pull v1.9.1 (rollback). Your local plugin will return to v1.8.0 behavior.
- The v1.9.0 git tag is preserved for history. Its GitHub Release body is marked YANKED.
- No data or PR state from any prior auto-create-pr / auto-continue-pr run is affected — the rollback only changes which version of the skill drives future runs.

## 1.8.0

### Changed
- **3 specialist skills demoted to references under their natural parents** — they are no longer top-level user-facing entries in the skill picker, but their full content remains available and the parent skill loads the matching reference on demand:
  - `om-pre-implement-spec` → `skills/om-cto/references/pre-impl-analysis.md` (om-cto routes BC/risk-analysis prompts here)
  - `om-eject-and-customize` → `skills/om-system-extension/references/eject.md` (om-system-extension routes ejection prompts here)
  - `om-toolkit-review` → `skills/om-cto/references/toolkit-audit.md` (om-cto routes skill-corpus-audit prompts here)
- `om-cto` description widened to absorb the user trigger phrases for pre-implementation analysis (`analyze spec`, `BC analysis`, `spec readiness`, `zanim zaczniemy kodzenie`) and toolkit audit (`review skills`, `audit toolkit`, `skill health check`).
- `om-system-extension` description widened to absorb ejection trigger phrases (`eject`, `should I eject`, `customize module`, `modify core module`).
- `om-cto/SKILL.md` Task Router gained two new rows pointing at the demoted references.
- `om-system-extension/SKILL.md` §1 gained a "When UMES is insufficient" callout that loads `references/eject.md`.
- `scripts/sync-om-skills.sh` gained a `DEMOTED_SKILL_PAIRS` array and a `sync_demoted_skill()` function — upstream content for demoted skills is fetched, frontmatter is stripped, and the body is written under the parent's `references/` path. Awk frontmatter stripping recognizes only the line-1 opening `---` marker so in-body horizontal rules in markdown bodies are preserved.
- `om-pre-implement-spec` and `om-eject-and-customize` removed from `CORE_SKILL_PAIRS` and `APP_SKILL_PAIRS` respectively — future syncs flow through the new demoted path.
- Stale cross-references repaired in `om-cto/references/{advisory,spec-orchestrator,toolkit-audit}.md` — orchestrator chains now point at the new reference paths instead of the deleted top-level skills.

### Added
- `UPSTREAM.md` at the repo root — registry of which om-* skills extend, compose, or are independent of upstream skill plugins (obra/superpowers, code-review, frontend-design), what each inherits and inlines, and at which upstream version it was last reviewed. Includes a "Demoted skills" section mapping each demoted name → parent → reference path → upstream source.

### Migration notes (for plugin users)
- Prompts that previously triggered `om-pre-implement-spec`, `om-eject-and-customize`, or `om-toolkit-review` will now fire `om-cto` or `om-system-extension`, which then loads the matching reference on demand. Behavior is preserved; only the entry-point name changes.
- Direct invocation of the demoted skills via the Skill tool will no longer find them by their old names. If you scripted a workflow that calls the demoted skill directly, switch to invoking the parent and let it route via its Task Router.
- Update with `/plugins marketplace update om-superpowers`.

### Origin
- Session 2026-05-06 — discussion about reducing the user-facing skill picker surface and dynamically loading specialist tools only when needed. Validated the routing pattern against historical session data: across 9 successful om-cto fires, 6 read a single reference and 3 read two, with 77% of references staying unread per fire. Conservative demotion picked 3 skills with single-parent homes (no risk of multi-parent reachability loss) and verified-low natural top-level user-prompt frequency. om-ds-guardian was a candidate but kept top-level after discovering its multi-home wiring (build-flow validation, auto-review-pr, scaffolders).

## 1.7.2

### Changed
- `om-cto/references/advisory.md` — added structural enforcement of the existing `<HARD-GATE>`. Two additions: (1) a one-line **Enforcement** pointer right after `</HARD-GATE>` directing the agent to the new Output Contract section; (2) a new `## Output Contract` section between Phase 6 and Quality Checks. The Output Contract requires every Advisory answer to end with a `## Sources` block listing the actual tool calls (Read, gh search code, find) that back the answer — empty Sources = answer is invalid by skill contract. Bans un-denominated percentages (write `8/11 layers covered`, not `~70%`), banned hedges (`approximately`/`around`/`roughly` and Polish equivalents `około`/`mniej więcej`/`z grubsza`) before unmeasured numbers, and banned module-count estimates without enumeration. Three-box self-check before emit.

### Origin
- Session S008 (2026-05-04) — om-cto Advisory mode emitted a 4718-char ISO 9001 gap analysis with three different fabricated percentages (`~70–80%`, `0%`, `~50%`) and zero prior `Read om-reference/AGENTS.md` or `gh search code` calls. The HARD-GATE rule was correct; its enforcement was absent. I014 makes the gate structurally verifiable via the `## Sources` artifact — anyone replaying a transcript can grep for it.

## 1.7.1

### Added
- `skills/om-ds-guardian/scripts/ds-diff-check.sh` — deterministic per-file DS linter. Takes a list of changed files (args or stdin), emits `<file>:<line>:<rule-id>:<match>` findings. Pattern set kept in sync with `ds-health-check.sh`. Used as the grep-first phase of `om-auto-review-pr` step 6a.

### Changed
- `om-auto-review-pr` step 6a — flipped from LLM-only REVIEW to a two-phase additive gate. Phase 1 (`ds-diff-check.sh`, ~5s) runs first against UI-touching diff files; Phase 2 (DS Guardian REVIEW) consumes the grep findings as known-violations input and focuses on judgment cases (decoration vs status, primitive choice, missing empty/loading states, color-as-only-info, IconButton aria-label, FormField wrapping). LLM REVIEW still runs unconditionally — coverage is preserved, latency drops on the common case.

### Origin
- Session S006 (2026-05-02) — Karpathy/Musk verification of v1.7.0 absorption flagged that the deterministic gate (`ds-health-check.sh`) was demoted to a snapshot tool while LLM REVIEW carried the full enforcement burden, despite ~80% of recurring DS violations being grep-detectable. I012 promoted the deterministic floor; the additive (rather than substitutive) wiring was chosen to avoid coverage loss on judgment cases the grep can't see.

## 1.7.0

### Added
- **DS Guardian** (`om-ds-guardian`) — Design System enforcement skill absorbed from Open Mercato repo PR [#1707](https://github.com/open-mercato/open-mercato/pull/1707). Five capabilities: ANALYZE (DS violation scan), PLAN (migration plan), MIGRATE (script-based + surgical + raw-HTML→DS-primitive recipes), REVIEW (compliance review with scoring), REPORT (health metrics with delta).
- Reference: `references/component-guide.md` — when to use which DS component, API quick reference, MUST rules per primitive (Input, Select, Switch, Radio, Textarea, Tooltip, etc.) — required reading for any skill that generates UI code.
- Reference: `references/token-mapping.md` — full color/typography mapping tables, raw-HTML→DS-primitive diff recipes
- Reference: `references/page-templates.md` — canonical DS-compliant List/Create/Detail page templates — required reading for `om-module-scaffold` and `om-implement-spec`.
- Scripts: `ds-health-check.sh`, `ds-migrate-colors.sh`, `ds-migrate-typography.sh` — bundled bash codemods (also live in OM repo at `.ai/skills/ds-guardian/scripts/` since PR #1707)
- `om-auto-review-pr` step 6a: invokes DS Guardian REVIEW on UI-touching PRs (`.tsx`/`.ts` under `packages/`/`apps/` non-test paths). Severity maps to existing CRITICAL/MEDIUM/LOW pipeline. Skipped on non-UI PRs.

### Changed
- Updated plugin tagline: 20 → 21 skills
- `om-module-scaffold` step 6 (Create Backend Pages): now requires consulting `om-ds-guardian/references/page-templates.md`, `component-guide.md`, and `token-mapping.md` before emitting any page. Hard-rules listed inline (no raw HTML controls, no hardcoded status colors, no arbitrary text sizes, etc.).
- `om-implement-spec` Pre-Flight: new step 4 — load DS references when the spec touches UI. UI rule in code-review enforcement table extended with DS primitives + tokens + typography scale requirements.
- `om-backend-ui-design` and `om-code-review` collaboration table cross-references `om-ds-guardian` for design-system-specific checks (build vs. enforce split).

### Architectural decision
- **DS Guardian does not write code.** It shapes inputs (via reference docs that primary scaffolders consume) and polices outputs (via REVIEW at PR time). The original SCAFFOLD capability from PR #1707 was dropped during absorption — primary scaffolders (`om-module-scaffold`, `om-implement-spec`) own page creation and consume the DS templates as required input. Single source of truth for templates, single enforcement gate at PR time.

## 1.6.0

### Added
- Getting started guide for ideation-first workflow (no app needed to start)
- Piotr decision library — real decision patterns extracted from code reviews and architecture choices
- Personas table in Getting Started
- `app-spec/` detection for ideation-first flow
- Scaffold into same directory — app-spec stays in place

### Changed
- Restructured README for ideation-first flow
- Recommend `create-mercato-app@develop` in getting started
- Slimmed om-product-manager
- Polished plugin metadata, added `.gitignore`

### Fixed
- Broken cross-skill references
- Sync script path rewriting
- Hook completeness
- Misleading "activates all skills" wording in building section

## 1.5.0

### Added
- **User Proxy** (`om-user-proxy`) — pipeline-level decision interceptor that answers routine agent questions on the user's behalf, learning from corrections
- **Proxy gates** in om-product-manager, om-cto, om-pre-implement-spec, om-implement-spec, om-code-review — all findings/questions pass through the proxy before reaching the user
- **Piotr Decision Library** — 10 real decision patterns extracted from code reviews and architecture choices
- **Cross-story impact analysis** in om-product-manager — matrix of state changes, affected stories, conflict patterns
- **Failure and alternate paths** required for every user story — happy-path-only stories are rejected
- **Toolkit Review** (`om-toolkit-review`) — 8-dimension audit of the skill corpus for context waste, duplication, and structural drift
- Daily CI workflow for automated skill sync from upstream with auto version bump
- Getting started guide for ideation-first workflow (no app needed to start)

### Changed
- Renamed Mat persona to Marty Cagan for clarity
- Converted om-cto into lean task router (4.4 KB) with on-demand reference loading
- Removed 4 orchestration wrapper skills — Piotr dispatches base OM skills directly with dispatch context
- Replaced static platform-capabilities checklist with live discovery (AGENTS.md + `gh search code`)
- Restructured README for ideation-first flow with `app-spec/` detection

## 1.1.0

### Added
- **Spec & Implementation Orchestrator** in om-cto — autonomous spec writing and implementation coordination
- Piotr feedback triage — classifies user feedback as code bug / spec gap / business change
- 5 additional upstream OM skills: om-eject-and-customize, om-data-model-design, om-module-scaffold, om-system-extension, om-troubleshooter
- 7 framework architecture guides vendored from upstream
- Cross-skill handoffs between orchestrator and implementation skills

### Changed
- Enforced pipeline lock and auto-chain code review in implementation flow
- Session-start hook now proactively guides users through the pipeline sequence

## 1.0.0

### Added
- Initial plugin with 7 skills: om-product-manager, om-cto, om-ux, om-spec-writing, om-implement-spec, om-pre-implement-spec, om-code-review
- SessionStart hook with OM project detection
- Sync script for vendoring OM platform skills and AGENTS.md references
- Marketplace registration
