#!/usr/bin/env node
// DS Guardian sync — manual trigger.
//
// Pulls upstream OM canonical DS docs into om-reference/, source-extracts
// specialized inputs into skills/om-ds-guardian/references/specialized-inputs.md,
// runs discovery for new files, runs smoke tests against mirrored content,
// writes a change report and snapshot.
//
// Usage:
//   node scripts/sync/ds.mjs               # apply (writes files)
//   node scripts/sync/ds.mjs --dry-run     # preview only
//   node scripts/sync/ds.mjs --branch main # override upstream branch
//   node scripts/sync/ds.mjs --repo foo/bar
//
// Pins to a single upstream commit SHA per run (resolved at start). Every
// mirrored file is associated with that SHA in the snapshot. Re-runs are
// reproducible if the SHA is held constant.
//
// Exits non-zero on: gh API errors, missing manifest entries, smoke test
// failures, parse errors. Never leaves references/ in a half-written state
// — writes are atomic per file (write to .tmp, rename).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = resolve(__dirname, '..', '..')
const SKILL_DIR = join(PLUGIN_ROOT, 'skills', 'om-ds-guardian')
const CONFIG_PATH = join(SKILL_DIR, 'sync-config.json')
const SNAPSHOT_PATH = join(SKILL_DIR, '.last-sync.json')
const REPORTS_DIR = join(SKILL_DIR, 'sync-reports')

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const flags = {
  dryRun: args.includes('--dry-run'),
  branch: pickArg('--branch'),
  repo: pickArg('--repo'),
  noReport: args.includes('--no-report'),
}

function pickArg(name) {
  const i = args.indexOf(name)
  if (i === -1) return null
  return args[i + 1] ?? null
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = {
  step: (msg) => console.log(`\n▸ ${msg}`),
  info: (msg) => console.log(`  ${msg}`),
  ok: (msg) => console.log(`  ✓ ${msg}`),
  add: (msg) => console.log(`  + ${msg}`),
  change: (msg) => console.log(`  ~ ${msg}`),
  remove: (msg) => console.log(`  - ${msg}`),
  warn: (msg) => console.log(`  ⚠ ${msg}`),
  err: (msg) => console.error(`  ✗ ${msg}`),
}

function die(msg, extra) {
  console.error(`\n✗ FATAL: ${msg}`)
  if (extra) console.error(String(extra).split('\n').map((l) => `  ${l}`).join('\n'))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// gh API wrapper
// ---------------------------------------------------------------------------

function gh(endpoint, opts = {}) {
  try {
    const out = execFileSync('gh', ['api', endpoint, ...(opts.jq ? ['--jq', opts.jq] : [])], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    })
    return out.trim()
  } catch (err) {
    if (opts.allowMissing && /404/.test(err.message)) return null
    die(`gh api ${endpoint} failed`, err.stderr || err.message)
  }
}

function ghJson(endpoint, opts = {}) {
  const out = gh(endpoint, opts)
  if (out === null) return null
  try {
    return JSON.parse(out)
  } catch (err) {
    die(`failed to parse gh api ${endpoint} as JSON`, err.message)
  }
}

function fetchFile(repo, ref, path) {
  const ep = `repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`
  const data = ghJson(ep, { allowMissing: true })
  if (!data) return null
  if (data.type !== 'file') {
    die(`expected file at ${path} but got ${data.type}`)
  }
  if (data.encoding !== 'base64') {
    die(`unexpected encoding ${data.encoding} for ${path}`)
  }
  return Buffer.from(data.content, 'base64').toString('utf8')
}

function listDir(repo, ref, path) {
  const ep = `repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`
  const data = ghJson(ep, { allowMissing: true })
  if (!data) return null
  if (!Array.isArray(data)) die(`expected directory at ${path}`)
  return data.map((entry) => ({
    name: entry.name,
    type: entry.type,
    size: entry.size ?? 0,
    sha: entry.sha,
  }))
}

function resolveSha(repo, branch) {
  const sha = gh(`repos/${repo}/commits/${branch}`, { jq: '.sha' })
  if (!sha || sha.length < 40) die(`failed to resolve SHA for ${repo}@${branch}`)
  return sha
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function readSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
  } catch (err) {
    log.warn(`could not parse ${relative(PLUGIN_ROOT, SNAPSHOT_PATH)} — treating as first run`)
    return null
  }
}

function writeFileAtomic(absPath, contents) {
  mkdirSync(dirname(absPath), { recursive: true })
  const tmp = `${absPath}.tmp-${process.pid}`
  writeFileSync(tmp, contents)
  renameSync(tmp, absPath)
}

function readFileIfExists(absPath) {
  if (!existsSync(absPath)) return null
  return readFileSync(absPath, 'utf8')
}

// ---------------------------------------------------------------------------
// Source extract — specialized inputs
// ---------------------------------------------------------------------------

// Parse a single .tsx file under packages/ui/src/backend/inputs/ and return a
// markdown section summarizing the public surface. Regex-based: this isn't a
// full TS parser, but the input shape is regular enough that we can extract
// (a) "use client" marker, (b) all `export type Xxx = { ... }` blocks, (c) the
// first `export function Xxx(...)` signature, (d) defaults from destructuring,
// (e) i18n / shared imports as feature signals.
function extractInputSurface(filename, content, branch, sha) {
  const componentName = filename.replace(/\.tsx$/, '')

  const isClient = /^"use client"/m.test(content)
  const usesT = /useT\s*\(\)/.test(content)
  const importsCalendar = /from .*primitives\/calendar/.test(content)
  const importsPopover = /from .*primitives\/popover/.test(content)

  // Match top-level `export type Foo = { ... }` and `export interface Foo { ... }`
  // blocks. We rely on the upstream convention: the closing `}` is at column 0.
  // Strip leading-comment JSDoc blocks per-property to keep the rendered
  // markdown compact (the source link is in the section header).
  const typeBlocks = []
  const stripDoc = (body) =>
    body
      .replace(/^[ \t]*\/\*\*[\s\S]*?\*\/\s*\n/gm, '')
      .replace(/^[ \t]*\/\/[^\n]*\n/gm, '')
  const typeRe = /^export type (\w+) = \{([\s\S]*?)^\}/gm
  let m
  while ((m = typeRe.exec(content)) !== null) {
    typeBlocks.push({
      name: m[1],
      body: `export type ${m[1]} = {${stripDoc(m[2])}}`,
    })
  }
  const ifaceRe = /^export interface (\w+) \{([\s\S]*?)^\}/gm
  while ((m = ifaceRe.exec(content)) !== null) {
    typeBlocks.push({
      name: m[1],
      body: `export interface ${m[1]} {${stripDoc(m[2])}}`,
    })
  }
  typeBlocks.sort((a, b) => content.indexOf(a.body.slice(0, 20)) - content.indexOf(b.body.slice(0, 20)))

  // Match the first exported function signature. Capture parameters.
  let mainFn = null
  const fnRe = /^export function (\w+)\(([\s\S]*?)\)(?:\s*:\s*[^\{]+)?\s*\{/m
  const fnMatch = fnRe.exec(content)
  if (fnMatch) {
    mainFn = { name: fnMatch[1], params: fnMatch[2].trim() }
  }

  // Pull defaults out of the destructured params: `disabled = false,`
  const defaults = []
  if (mainFn) {
    const defaultRe = /(\w+)\s*=\s*([^,\n}]+?)(?=,|\s*\})/g
    let dm
    while ((dm = defaultRe.exec(mainFn.params)) !== null) {
      defaults.push({ name: dm[1].trim(), value: dm[2].trim() })
    }
  }

  // Build markdown
  const lines = []
  lines.push(`### ${componentName}`)
  lines.push('')
  lines.push(`**Source**: \`packages/ui/src/backend/inputs/${filename}\` ([upstream@${sha.slice(0, 7)}](https://github.com/open-mercato/open-mercato/blob/${sha}/packages/ui/src/backend/inputs/${filename}))`)
  lines.push(`**Import**: \`import { ${componentName} } from '@open-mercato/ui/backend/inputs/${componentName}'\``)
  const flags = []
  if (isClient) flags.push('client component')
  if (usesT) flags.push('i18n via `useT`')
  if (importsCalendar) flags.push('calendar primitive')
  if (importsPopover) flags.push('popover primitive')
  if (flags.length) {
    lines.push(`**Notes**: ${flags.join(', ')}`)
  }
  lines.push('')

  if (typeBlocks.length) {
    lines.push('#### Exported types')
    lines.push('')
    lines.push('```ts')
    lines.push(typeBlocks.map((tb) => tb.body).join('\n\n'))
    lines.push('```')
    lines.push('')
  }

  if (defaults.length) {
    lines.push('#### Defaults (from destructuring)')
    lines.push('')
    for (const d of defaults) {
      lines.push(`- \`${d.name}\` = \`${d.value}\``)
    }
    lines.push('')
  }

  if (!mainFn || !typeBlocks.length) {
    lines.push('> ⚠ Parser could not extract full surface — verify against source.')
    lines.push('')
  }

  return {
    componentName,
    markdown: lines.join('\n'),
    surface: {
      typeNames: typeBlocks.map((t) => t.name),
      mainFn: mainFn?.name ?? null,
      flags,
    },
  }
}

function buildSpecializedInputsDoc(extracts, sha, branch, trackingIssue, repo) {
  const today = new Date().toISOString().slice(0, 10)
  const out = []
  out.push('<!-- AUTO-GENERATED by scripts/sync/ds.mjs — do not edit by hand. -->')
  out.push('<!-- Edits will be overwritten on next sync. To change content, fix the')
  out.push('     parser or update upstream source. -->')
  out.push('')
  out.push('# Specialized Inputs (Source-extracted)')
  out.push('')
  out.push('> **Tier 2 bridge.** Upstream `.ai/ui-components.md` does not yet document')
  out.push(`> these primitives (see [\`om-reference/.ai/design-system-audit-2026-04-10.md\`](../../../om-reference/.ai/design-system-audit-2026-04-10.md) for the explicit "specialized inputs deferred" note). This file is generated`)
  out.push('> from the TypeScript source until upstream lands a Specialized Inputs')
  out.push(`> section. Tracking: \`${trackingIssue}\`.`)
  out.push('')
  out.push('**Source repo**: `' + repo + '`')
  out.push(`**Source branch**: \`${branch}\``)
  out.push(`**Source commit**: \`${sha}\``)
  out.push(`**Generated**: ${today}`)
  out.push('')
  out.push('## Decision rule (when to reach for these)')
  out.push('')
  out.push('| Need | Use | Notes |')
  out.push('|------|-----|-------|')
  out.push('| Multi-value selection from a known set OR free-form tags | `<TagsInput>` | `value: string[]`. Closed list when `allowCustomValues={false}`. Dictionary-backed via `loadSuggestions={async () => fetch(\'/api/dictionaries/<slug>/entries\')}`. Replaces `<Input value="comma,separated,slugs">` antipattern. |')
  out.push('| Single-value with autocomplete + free-form fallback | `<ComboboxInput>` | `value: string`. Same suggestions/loadSuggestions contract as TagsInput, single-select. |')
  out.push('| Date selection | `<DatePicker>` | `value: Date \\| null`. Use `displayFormat`/`locale` for localized format. |')
  out.push('| Date + time selection | `<DateTimePicker>` | Wraps DatePicker with time. |')
  out.push('| Cron-like event pattern | `<EventPatternInput>` | Domain-specific pattern editor. |')
  out.push('| Pick from `/api/events` | `<EventSelect>` | Async-loaded event names. |')
  out.push('| Pick from a lookup table | `<LookupSelect>` | Generic lookup-table picker. |')
  out.push('| Phone number with formatting | `<PhoneNumberField>` | Country-aware formatting. |')
  out.push('| Markdown editor with rendered preview toggle | `<SwitchableMarkdownInput>` | Toggleable rich/markdown view. |')
  out.push('| Time-only entry | `<TimeInput>` | Stricter than `<TimePicker>` — text input. |')
  out.push('| Time picker (popover) | `<TimePicker>` | Popover-based selector. |')
  out.push('')
  out.push('## Anti-pattern: CSV-in-Input')
  out.push('')
  out.push('`<Input value="a, b, c">` for multi-value data is **always wrong** when a closed dictionary or free-form tag list is the actual contract. Use `<TagsInput>`. DS Guardian REVIEW must flag any `<Input>` whose label or placeholder matches `/comma[- ]separated|slugs|tags/i` as **WARNING** with link to this doc.')
  out.push('')
  out.push('---')
  out.push('')
  out.push('## Primitives')
  out.push('')
  for (const ex of extracts) {
    out.push(ex.markdown)
    out.push('---')
    out.push('')
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

function diffEntries(prev, curr, keyFn) {
  const prevMap = new Map((prev ?? []).map((e) => [keyFn(e), e]))
  const currMap = new Map(curr.map((e) => [keyFn(e), e]))
  const added = []
  const removed = []
  const changed = []
  for (const [k, e] of currMap) {
    if (!prevMap.has(k)) added.push(e)
    else if (prevMap.get(k).hash !== e.hash) changed.push(e)
  }
  for (const [k, e] of prevMap) {
    if (!currMap.has(k)) removed.push(e)
  }
  return { added, removed, changed }
}

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

function runSmokeTests(tests, virtualFs) {
  const failures = []
  for (const t of tests) {
    const abs = join(PLUGIN_ROOT, t.file)
    const content = virtualFs.get(abs) ?? readFileIfExists(abs)
    if (content == null) {
      failures.push({ name: t.name, reason: `file missing: ${t.file}` })
      continue
    }
    if (t.mustMatch && !content.includes(t.mustMatch)) {
      failures.push({ name: t.name, reason: `'${t.mustMatch}' not found in ${t.file}` })
      continue
    }
    if (t.mustMatchRegex && !new RegExp(t.mustMatchRegex).test(content)) {
      failures.push({ name: t.name, reason: `regex '${t.mustMatchRegex}' did not match in ${t.file}` })
    }
  }
  return failures
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date()

  // Load config
  if (!existsSync(CONFIG_PATH)) die(`config not found at ${relative(PLUGIN_ROOT, CONFIG_PATH)}`)
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))

  const repo = flags.repo ?? config.upstream?.repo
  const branch = flags.branch ?? config.upstream?.branch
  if (!repo || !branch) die('missing upstream.repo or upstream.branch in config')

  log.step(`DS Guardian sync — ${repo}@${branch}${flags.dryRun ? ' (DRY RUN)' : ''}`)

  log.step('Resolving upstream commit SHA')
  const sha = resolveSha(repo, branch)
  log.ok(`pinned to ${sha.slice(0, 7)} (${sha})`)

  const prev = readSnapshot()
  if (prev) log.info(`previous sync: ${prev.sha?.slice(0, 7) ?? 'unknown'} on ${prev.completedAt ?? 'unknown'}`)
  else log.info('no previous snapshot — first run')

  // ---- Phase 1: Mirror -----------------------------------------------------

  log.step('Mirroring canonical files')
  const virtualFs = new Map()
  const mirrorEntries = []
  for (const m of config.mirror ?? []) {
    const content = fetchFile(repo, sha, m.src)
    if (content == null) die(`mirror source missing upstream: ${m.src}`)
    const hash = sha256(content)
    const absDest = join(PLUGIN_ROOT, m.dest)
    const prevContent = readFileIfExists(absDest)
    const prevHash = prevContent != null ? sha256(prevContent) : null
    const status = prevHash == null ? 'added' : prevHash === hash ? 'unchanged' : 'changed'
    mirrorEntries.push({ src: m.src, dest: m.dest, hash, status, size: content.length })
    virtualFs.set(absDest, content)
    if (status === 'added') log.add(`${m.dest} (${content.length}B)`)
    else if (status === 'changed') log.change(`${m.dest} (${content.length}B)`)
    else log.ok(`${m.dest} (unchanged)`)
  }

  // ---- Phase 2: Extract ----------------------------------------------------

  log.step('Extracting specialized inputs')
  const extractEntries = []
  for (const x of config.extract ?? []) {
    if (x.type !== 'specialized-inputs') {
      log.warn(`unknown extract type: ${x.type} — skipping`)
      continue
    }
    const dirEntries = listDir(repo, sha, x.srcDir)
    if (!dirEntries) die(`extract srcDir missing upstream: ${x.srcDir}`)
    const sources = dirEntries
      .filter((e) => e.type === 'file' && x.extensions.some((ext) => e.name.endsWith(ext)))
      .sort((a, b) => a.name.localeCompare(b.name))

    const extracts = []
    for (const s of sources) {
      const content = fetchFile(repo, sha, `${x.srcDir}/${s.name}`)
      if (content == null) {
        log.warn(`failed to fetch ${s.name} for extract — skipping`)
        continue
      }
      const ex = extractInputSurface(s.name, content, branch, sha)
      extracts.push(ex)
    }

    const doc = buildSpecializedInputsDoc(extracts, sha, branch, x.trackingIssue, repo)
    const hash = sha256(doc)
    const absDest = join(PLUGIN_ROOT, x.destFile)
    const prevContent = readFileIfExists(absDest)
    const prevHash = prevContent != null ? sha256(prevContent) : null
    const status = prevHash == null ? 'added' : prevHash === hash ? 'unchanged' : 'changed'
    virtualFs.set(absDest, doc)
    extractEntries.push({
      destFile: x.destFile,
      sourceCount: extracts.length,
      sourceNames: extracts.map((e) => e.componentName),
      hash,
      status,
    })
    log.info(`extracted ${extracts.length} primitives from ${x.srcDir}`)
    if (status === 'added') log.add(`${x.destFile}`)
    else if (status === 'changed') log.change(`${x.destFile}`)
    else log.ok(`${x.destFile} (unchanged)`)
  }

  // ---- Phase 3: Discovery --------------------------------------------------

  log.step('Discovery scan')
  const discoveryEntries = []
  for (const d of config.discovery ?? []) {
    const entries = listDir(repo, sha, d.path)
    if (!entries) {
      log.warn(`discovery path missing upstream: ${d.path}`)
      continue
    }
    const filtered = entries
      .filter((e) => e.type === 'file' && d.extensions.some((ext) => e.name.endsWith(ext)))
      .map((e) => ({ name: e.name, sha: e.sha, size: e.size, hash: e.sha }))
      .sort((a, b) => a.name.localeCompare(b.name))
    discoveryEntries.push({ path: d.path, purpose: d.purpose, files: filtered })
    log.info(`${d.path}/ — ${filtered.length} matching files`)
  }

  const prevDiscoveryByPath = new Map(
    (prev?.discovery ?? []).map((d) => [d.path, d.files ?? []])
  )
  const discoveryDeltas = []
  for (const d of discoveryEntries) {
    const prevFiles = prevDiscoveryByPath.get(d.path) ?? null
    if (prevFiles == null) {
      discoveryDeltas.push({ path: d.path, kind: 'first-seen', files: d.files })
      continue
    }
    const diff = diffEntries(prevFiles, d.files, (f) => f.name)
    if (diff.added.length || diff.removed.length || diff.changed.length) {
      discoveryDeltas.push({
        path: d.path,
        kind: 'delta',
        added: diff.added,
        removed: diff.removed,
        changed: diff.changed,
      })
    }
  }

  if (discoveryDeltas.length === 0) {
    log.ok('no discovery deltas')
  } else {
    for (const d of discoveryDeltas) {
      if (d.kind === 'first-seen') {
        log.info(`${d.path}/: baseline recorded (${d.files.length} files)`)
      } else {
        if (d.added.length) log.add(`${d.path}/: NEW ${d.added.map((f) => f.name).join(', ')}`)
        if (d.removed.length) log.remove(`${d.path}/: REMOVED ${d.removed.map((f) => f.name).join(', ')}`)
        if (d.changed.length) log.change(`${d.path}/: CHANGED ${d.changed.map((f) => f.name).join(', ')}`)
      }
    }
  }

  // ---- Phase 4: Smoke tests -----------------------------------------------

  log.step('Smoke tests')
  const failures = runSmokeTests(config.smokeTests ?? [], virtualFs)
  if (failures.length === 0) {
    log.ok(`${(config.smokeTests ?? []).length} smoke tests passed`)
  } else {
    for (const f of failures) log.err(`${f.name}: ${f.reason}`)
    die(`${failures.length} smoke test(s) failed — refusing to write`)
  }

  // ---- Phase 5: Write ------------------------------------------------------

  if (flags.dryRun) {
    log.step('Dry run — no files written')
  } else {
    log.step('Writing files')
    for (const m of mirrorEntries) {
      if (m.status === 'unchanged') continue
      const abs = join(PLUGIN_ROOT, m.dest)
      writeFileAtomic(abs, virtualFs.get(abs))
      log.ok(`wrote ${m.dest}`)
    }
    for (const x of extractEntries) {
      if (x.status === 'unchanged') continue
      const abs = join(PLUGIN_ROOT, x.destFile)
      writeFileAtomic(abs, virtualFs.get(abs))
      log.ok(`wrote ${x.destFile}`)
    }

    // Snapshot
    const snapshot = {
      schemaVersion: 1,
      repo,
      branch,
      sha,
      completedAt: startedAt.toISOString(),
      mirror: mirrorEntries.map((e) => ({ src: e.src, dest: e.dest, hash: e.hash })),
      extract: extractEntries.map((e) => ({
        destFile: e.destFile,
        sourceNames: e.sourceNames,
        hash: e.hash,
      })),
      discovery: discoveryEntries.map((d) => ({
        path: d.path,
        files: d.files,
      })),
    }
    writeFileAtomic(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n')
    log.ok(`wrote ${relative(PLUGIN_ROOT, SNAPSHOT_PATH)}`)
  }

  // ---- Phase 6: Report -----------------------------------------------------

  if (!flags.noReport) {
    const reportPath = join(
      REPORTS_DIR,
      `${startedAt.toISOString().slice(0, 10)}-${startedAt.toISOString().slice(11, 16).replace(':', '')}.md`
    )
    const report = buildReport({
      startedAt,
      repo,
      branch,
      sha,
      prev,
      mirrorEntries,
      extractEntries,
      discoveryDeltas,
      smokeTestsRan: (config.smokeTests ?? []).length,
      dryRun: flags.dryRun,
    })
    if (!flags.dryRun) {
      writeFileAtomic(reportPath, report)
      log.step(`Report: ${relative(PLUGIN_ROOT, reportPath)}`)
    } else {
      log.step('Dry run report (not written):')
      console.log(report.split('\n').map((l) => `    ${l}`).join('\n'))
    }
  }

  // ---- Summary -------------------------------------------------------------

  const changedCount =
    mirrorEntries.filter((e) => e.status !== 'unchanged').length +
    extractEntries.filter((e) => e.status !== 'unchanged').length
  const noopRun = changedCount === 0 && discoveryDeltas.every((d) => d.kind === 'first-seen' && prev != null)

  log.step('Summary')
  log.info(`Repo: ${repo}@${branch} → ${sha.slice(0, 7)}`)
  log.info(`Mirror: ${mirrorEntries.length} files (${mirrorEntries.filter((e) => e.status !== 'unchanged').length} changed)`)
  log.info(`Extract: ${extractEntries.length} groups (${extractEntries.filter((e) => e.status !== 'unchanged').length} changed)`)
  log.info(`Discovery deltas: ${discoveryDeltas.filter((d) => d.kind !== 'first-seen').length}`)
  if (noopRun) log.ok('idempotent run — nothing to do')
}

function buildReport(ctx) {
  const out = []
  out.push(`# DS Guardian Sync Report — ${ctx.startedAt.toISOString().slice(0, 10)}`)
  out.push('')
  out.push(`- **Repo**: \`${ctx.repo}\``)
  out.push(`- **Branch**: \`${ctx.branch}\``)
  out.push(`- **Commit**: \`${ctx.sha}\``)
  out.push(`- **Previous SHA**: \`${ctx.prev?.sha ?? 'none'}\``)
  out.push(`- **Started**: ${ctx.startedAt.toISOString()}`)
  if (ctx.dryRun) out.push(`- **Mode**: DRY RUN (no files written)`)
  out.push('')

  out.push('## Mirror')
  out.push('')
  out.push('| Source | Destination | Status |')
  out.push('|--------|-------------|--------|')
  for (const m of ctx.mirrorEntries) {
    out.push(`| \`${m.src}\` | \`${m.dest}\` | ${m.status} |`)
  }
  out.push('')

  out.push('## Extract')
  out.push('')
  for (const x of ctx.extractEntries) {
    out.push(`- \`${x.destFile}\` — ${x.sourceCount ?? x.sourceNames?.length ?? '?'} primitives, status: ${x.status}`)
    if (x.sourceNames?.length) {
      out.push(`  - Sources: ${x.sourceNames.map((n) => `\`${n}\``).join(', ')}`)
    }
  }
  out.push('')

  out.push('## Discovery deltas')
  out.push('')
  if (ctx.discoveryDeltas.length === 0) {
    out.push('_No deltas — upstream tracked surface unchanged since last sync._')
  } else {
    for (const d of ctx.discoveryDeltas) {
      if (d.kind === 'first-seen') {
        out.push(`- \`${d.path}/\` — baseline recorded (${d.files.length} files)`)
      } else {
        if (d.added.length) out.push(`- 🆕 \`${d.path}/\`: ${d.added.map((f) => `\`${f.name}\``).join(', ')}`)
        if (d.removed.length) out.push(`- ➖ \`${d.path}/\`: ${d.removed.map((f) => `\`${f.name}\``).join(', ')}`)
        if (d.changed.length) out.push(`- ✏️ \`${d.path}/\`: ${d.changed.map((f) => `\`${f.name}\``).join(', ')}`)
      }
    }
  }
  out.push('')

  out.push('## Smoke tests')
  out.push('')
  out.push(`${ctx.smokeTestsRan} test(s) passed.`)
  out.push('')

  out.push('## Action items')
  out.push('')
  const actions = []
  for (const d of ctx.discoveryDeltas) {
    if (d.kind === 'first-seen') continue
    if (d.added.length) actions.push(`Decide whether \`${d.path}/\` additions (${d.added.map((f) => f.name).join(', ')}) should be added to mirror or extract config.`)
    if (d.removed.length) actions.push(`\`${d.path}/\` removals (${d.removed.map((f) => f.name).join(', ')}) — review skill references for stale links and consider deprecation note.`)
  }
  if (actions.length === 0) {
    out.push('_None._')
  } else {
    for (const a of actions) out.push(`- ${a}`)
  }
  out.push('')

  return out.join('\n')
}

main().catch((err) => {
  console.error('\n✗ UNEXPECTED ERROR')
  console.error(err)
  process.exit(1)
})
