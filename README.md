# om-claude-plugin

Claude Code plugin for Open Mercato developers. 10 skills covering the full OM developer lifecycle: spec writing, platform challenge, UI review, implementation, and code review.

## Install

~~~
/plugin install https://github.com/SHGrowth/om-claude-plugin.git
~~~

### Prerequisites

- [Claude Code](https://claude.ai/code) (or Cursor with plugin support)
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated, for om-piotr platform search
- Recommended: [superpowers](https://github.com/obra/superpowers) plugin

## Skills

### Spec & Design

| Skill | When to use |
|-------|-------------|
| `om-mat` | Starting a new feature, module, or spec — business context, workflows, user stories |
| `om-piotr` | Before any code — gap analysis, "does OM already do X?", atomic commit estimation |
| `om-krug` | After UI architecture is defined — navigation, task completion, cognitive load review |

### Implementation

| Skill | When to use |
|-------|-------------|
| `om-spec-writing` | Creating architecturally compliant specifications |
| `om-pre-implement-spec` | Before implementation — backward compatibility impact, risk analysis |
| `om-implement-spec` | Multi-phase spec implementation with coordinated subagents |
| `om-integration-tests` | Creating or running Playwright integration tests |
| `om-integration-builder` | Building provider packages (payment, shipping, data sync) |
| `om-backend-ui-design` | Designing backend UI pages within OM framework |

### Quality

| Skill | When to use |
|-------|-------------|
| `om-code-review` | After completing a feature, before merging — CI/CD gate + full OM checklist |

### Developer Flow

~~~
om-mat --> om-piotr --> om-krug --> om-spec-writing --> om-pre-implement-spec --> om-implement-spec --> om-code-review
~~~

## How it works

The plugin auto-detects OM projects on session start by looking for:
- `@open-mercato/` dependency in `package.json`
- "Open Mercato" in `AGENTS.md`
- `.ai/` directory

When detected, it injects the list of available OM skills into the session context. Skills are invocable anytime via the Skill tool (e.g., `skill: "om-code-review"`).

## Syncing OM platform skills

7 of the 10 skills are vendored from [open-mercato/open-mercato](https://github.com/open-mercato/open-mercato). To update them:

```bash
# Fetch latest skills from OM repo (develop branch)
bash scripts/sync-om-skills.sh

# Review what changed
git diff skills/

# Commit the update
git add skills/ && git commit -m "chore: sync OM skills from open-mercato/open-mercato@$(head -c7 skills/.om-sync-version)"

# Tag a release
git tag vX.Y.Z
git push origin main --tags
```

The sync script:
1. Fetches each skill's `SKILL.md` and `references/` from `raw.githubusercontent.com`
2. Renames the `name:` field in frontmatter to add `om-` prefix
3. Saves the source commit SHA to `skills/.om-sync-version`

Run this before each plugin release.

## License

MIT
