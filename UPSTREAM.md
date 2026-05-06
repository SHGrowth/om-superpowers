# Upstream skill lineage

om-superpowers is a layer on top of upstream skill plugins, not a replacement of them. This file tracks what each `om-*` skill builds on, what it inherits from upstream, what it inlines locally, and at which upstream version the inheritance was last reviewed.

Used to detect drift when an upstream plugin (most often [obra/superpowers](https://github.com/obra/superpowers)) changes a skill we extend. If the upstream change is a discipline upgrade, port it. If it's content swap that doesn't apply to OM, leave it and bump the reviewed-at marker.

## Relationship taxonomy

- **extends** — om skill uses the upstream discipline as its foundation, then adds an OM-specific layer (personas, spec format, OM rules, OM checklists). Upstream changes to the underlying discipline should be absorbed; upstream changes to prompts/examples usually shouldn't.
- **composes** — om skill orchestrates one or more upstream skills as steps in a larger OM-specific flow. Upstream changes propagate automatically *unless* the orchestration has inlined upstream logic.
- **independent** — no upstream counterpart. Upstream changes are irrelevant.

## Registry

Upstream pin format: `<plugin>@<version>`. `n/a` means the upstream plugin doesn't expose a version and the marker is "last reviewed by hand."

| om skill | rel | upstream | inherits | inlines | reviewed at |
|---|---|---|---|---|---|
| om-product-manager | extends | superpowers:brainstorming | iteration discipline, red-flag table, "before any creative work" gate | Cagan persona, business-requirements prompts, App Spec output format | superpowers@5.1.0 |
| om-spec-writing | extends | superpowers:writing-plans | plan-before-code rule, plan-as-checkpoint structure | OM spec format, architectural compliance checklist, AGENTS.md alignment | superpowers@5.1.0 |
| om-implement-spec | extends | superpowers:executing-plans + subagent-driven-development | phase checkpointing, subagent dispatch pattern | OM phases (unit + integration + i18n + code-review), per-spec status updates | superpowers@5.1.0 |
| om-code-review | extends | code-review:code-review | review rigor, evidence-before-assertion | OM compliance checklist (UMES, ACL, AGENTS.md, naming, security, anti-patterns) | code-review@n/a |
| om-troubleshooter | extends | superpowers:systematic-debugging | hypothesis loop, root-cause discipline | OM symptom→cause table, common error patterns (404s, missing modules, widgets) | superpowers@5.1.0 |
| om-backend-ui-design | extends | frontend-design:frontend-design | "no AI aesthetic" principle, design quality bar | OM @open-mercato/ui component library, backoffice patterns, CRUD/table/form templates | frontend-design@n/a |
| om-auto-create-pr | composes | superpowers:requesting-code-review + finishing-a-development-branch | PR-creation discipline, branch hygiene | OM validation gate (typecheck/tests/i18n/build), label discipline, .ai/runs/ plan format | superpowers@5.1.0 |
| om-auto-review-pr | composes | superpowers:receiving-code-review + code-review:code-review | review-driving discipline, feedback discipline | gh integration, autofix loop, OM compliance checklist | superpowers@5.1.0 |
| om-auto-continue-pr | composes | superpowers:executing-plans | resume-from-checkpoint discipline | OM in-progress lock protocol, .ai/runs/ plan resumption | superpowers@5.1.0 |
| om-cto | independent | — | — | OM persona/orchestrator (Piotr); also routes the demoted pre-impl-analysis and toolkit-audit references | — |
| om-ux | independent | — | — | OM IA review (Krug persona) | — |
| om-user-proxy | independent | — | — | OM context resolution from app spec + lessons | — |
| om-data-model-design | independent | — | — | OM entities + UMES + migrations | — |
| om-system-extension | independent | — | — | UMES extension mechanisms; also routes the demoted eject reference | — |
| om-module-scaffold | independent | — | — | OM module bootstrap | — |
| om-integration-builder | independent | — | — | OM provider package format | — |
| om-integration-tests | independent | — | — | OM Playwright suite | — |
| om-ds-guardian | independent | — | — | OM design system rules | — |

## Demoted skills (synced as references under a parent)

Demoted skills are no longer top-level user-facing entries — their upstream content is fetched by `scripts/sync-om-skills.sh` (the `DEMOTED_SKILL_PAIRS` list and `sync_demoted_skill()` function), frontmatter is stripped, and the body is written as a reference under the named parent. The parent's SKILL.md announces the reference and routes to it on demand.

| Demoted name | Parent | Reference path | Upstream source | Reviewed at |
|---|---|---|---|---|
| pre-implement-spec | om-cto | `om-cto/references/pre-impl-analysis.md` | open-mercato `.ai/skills/pre-implement-spec` | open-mercato@(see `skills/.om-sync-version`) |
| eject-and-customize | om-system-extension | `om-system-extension/references/eject.md` | open-mercato `packages/create-app/agentic/shared/ai/skills/eject-and-customize` | open-mercato@(see `skills/.om-sync-version`) |
| toolkit-review | om-cto | `om-cto/references/toolkit-audit.md` | maintained in this repo (custom, not synced) | n/a |

## Drift check workflow (manual, until automated)

1. Determine the currently-installed upstream version:
   ```
   ls ~/.claude/plugins/cache/claude-plugins-official/superpowers/
   ```
2. For each row in this file with `rel` ∈ {extends, composes}, compare the `reviewed at` pin against the installed version. If it changed:
   ```
   diff -r \
     ~/.claude/plugins/cache/claude-plugins-official/superpowers/<old>/skills/<upstream-skill>/ \
     ~/.claude/plugins/cache/claude-plugins-official/superpowers/<new>/skills/<upstream-skill>/
   ```
3. For each upstream change, decide:
   - **Discipline upgrade** (new red-flag check, new step in the loop, new safety rule) → port into the matching om-* skill, bump `reviewed at`.
   - **Content change** (different prompt wording, different examples, plugin-specific glue) → ignore, just bump `reviewed at` to mark "reviewed, intentionally not absorbing."
4. Commit with a clear message: `chore: review upstream <plugin>@<version>, port <change> into <om-skill>` or `chore: review upstream <plugin>@<version>, no changes absorbed`.

## When to upgrade to automated sync

Build the automated diff/PR pipeline once we have evidence it pays off — i.e., after we've absorbed at least 2–3 real discipline upgrades from upstream and the manual workflow above is the bottleneck. Until then, the manifest is enough.
