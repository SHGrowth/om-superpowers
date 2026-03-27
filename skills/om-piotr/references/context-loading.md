# OM Context Loading Strategy

## OM Platform References

Platform AGENTS.md files are vendored in the plugin's `om-reference/` directory. No local OM repo clone needed.

Read files from the plugin's `om-reference/` directory using the Read tool.

## Step 1: Always start here (Task Router)
```
om-reference/AGENTS.md
```
Root AGENTS.md has the Task Router table — it tells you which guide to read for any given task.

## Step 2: Load 1-2 relevant module guides based on topic

| Investigating... | Read |
|-----------------|------|
| Module dev, CRUD, API routes, events, widgets, setup.ts | `om-reference/packages/core/AGENTS.md` |
| UI components, forms, data tables, backend pages, portal | `om-reference/packages/ui/AGENTS.md` |
| Backend page components, apiCall, RowActions | `om-reference/packages/ui/src/backend/AGENTS.md` |
| CRM patterns — **reference module to copy** | `om-reference/packages/core/src/modules/customers/AGENTS.md` |
| Auth, RBAC, roles, features, user management | `om-reference/packages/core/src/modules/auth/AGENTS.md` |
| Customer accounts, portal auth, self-registration | `om-reference/packages/core/src/modules/customer_accounts/AGENTS.md` |
| Workflows (step-based, timers, user tasks) | `om-reference/packages/core/src/modules/workflows/AGENTS.md` |
| Sales (orders, quotes, invoices) | `om-reference/packages/core/src/modules/sales/AGENTS.md` |
| Catalog (products, variants, pricing) | `om-reference/packages/core/src/modules/catalog/AGENTS.md` |
| Integrations, data sync | `om-reference/packages/core/src/modules/integrations/AGENTS.md` + `om-reference/packages/core/src/modules/data_sync/AGENTS.md` |
| Search (fulltext, vector, tokens) | `om-reference/packages/search/AGENTS.md` |
| Background jobs, workers | `om-reference/packages/queue/AGENTS.md` |
| Caching | `om-reference/packages/cache/AGENTS.md` |
| Events, event bus, DOM event bridge | `om-reference/packages/events/AGENTS.md` |
| Shared utilities, types, DSL, i18n | `om-reference/packages/shared/AGENTS.md` |
| CLI tooling, generators, migrations | `om-reference/packages/cli/AGENTS.md` |
| Onboarding wizards, tenant setup | `om-reference/packages/onboarding/AGENTS.md` |
| Enterprise overlay | `om-reference/packages/enterprise/AGENTS.md` |
| Currencies, exchange rates | `om-reference/packages/core/src/modules/currencies/AGENTS.md` |
| create-mercato-app template | `om-reference/packages/create-app/AGENTS.md` + `om-reference/packages/create-app/template/AGENTS.md` |
| AI assistant, MCP tools | `om-reference/packages/ai-assistant/AGENTS.md` |
| n8n automation, external orchestration | `open-mercato/n8n-nodes` repo (check via `gh` CLI) |
| Official marketplace modules | `open-mercato/official-modules` repo (check via `gh` CLI) |

## Step 3: Specs (when checking requirements or conflicts)

Specs are not vendored. Use GitHub API to browse them:
```bash
gh api repos/open-mercato/open-mercato/contents/.ai/specs --jq '.[].name'
gh api repos/open-mercato/open-mercato/contents/.ai/specs/enterprise --jq '.[].name'
```

## Step 4: Actual code (when verifying "does X exist?")

Source code is not vendored. Use `gh search code` to search the live repo:
```bash
gh search code "searchTerm" --repo open-mercato/open-mercato
gh search code "functionName" --repo open-mercato/open-mercato --filename "*.ts"
```

For browsing specific directories:
```bash
gh api repos/open-mercato/open-mercato/contents/packages/core/src/modules --jq '.[].name'
```

## Step 5: External OM repos (when checking ecosystem capabilities)

| Repo | What it is | When to check |
|------|-----------|---------------|
| `open-mercato/official-modules` | Marketplace modules as separate npm packages. Modules that ship outside core. | When investigating if a capability exists as an official module rather than in core. `gh repo view open-mercato/official-modules` or clone to check. |
| `open-mercato/n8n-nodes` | n8n community nodes for Open Mercato. Generic REST node that speaks OM API. | When investigating automation, external orchestration, or LLM integration patterns. n8n is the recommended automation + AI layer for apps that need scheduled/triggered external processing. |
| `open-mercato/open-mercato` `.ai/specs/enterprise/` | Enterprise overlay specs. Feature-toggled capabilities that extend core modules. | When checking if a "missing" feature is actually enterprise-only. Don't build in an app what enterprise already provides. |

## Loading rules for external repos
- Use `gh` CLI to browse without cloning: `gh api repos/open-mercato/<repo>/contents/<path>`
- Only clone if you need to search code. Keep external repos outside the working directory.
- Enterprise specs are in the main repo but gated — check them when a feature seems like it should exist but doesn't in OSS.

## Loading Rules

- **Max 2-3 AGENTS.md per investigation.** Root + the specific module. No more.
- **Always start with root AGENTS.md** — Task Router tells you where to look.
- **Use Grep/Glob for targeted searches** within vendored files — don't read entire files when looking for a specific function.
- **Use `gh search code`** for live code searches against the OM repo.
- **Don't load what you don't need** — "Agent will blow up context window."
