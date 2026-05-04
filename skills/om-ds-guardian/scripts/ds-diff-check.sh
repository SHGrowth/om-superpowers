#!/bin/bash
# ds-diff-check.sh — deterministic DS linter for a list of changed files.
#
# Usage:
#   bash ds-diff-check.sh path/to/a.tsx path/to/b.tsx
#   git diff --name-only main...HEAD | bash ds-diff-check.sh
#   gh pr diff <PR> --name-only | bash ds-diff-check.sh
#
# Output (one line per finding):
#   <file>:<line>:<rule-id>:<matched-text>
#
# Exit codes:
#   0 always (linter, not a gate). Caller decides what to do with findings.
#
# Rule set is kept in sync with ds-health-check.sh. When you add a rule
# here, add the matching count line in ds-health-check.sh and vice versa.
#
# Out of scope (intentionally): "missing empty/loading state on a list
# page", "is this color decorative or status", "is this the right
# primitive (Switch vs Radio)", "is this icon-button missing aria-label
# decorative". Those need context and stay with the LLM REVIEW step.

set -uo pipefail

# --- 1. Collect input file list (args or stdin) ---

INPUT_FILES=()
if [ "$#" -gt 0 ]; then
  INPUT_FILES=("$@")
elif [ ! -t 0 ]; then
  # stdin is a pipe or redirect — read file paths from it
  while IFS= read -r line; do
    [ -n "$line" ] && INPUT_FILES+=("$line")
  done
fi

# --- 2. Filter to lintable files (exists on disk, .ts/.tsx, not test/generated) ---

FILES=()
for f in "${INPUT_FILES[@]:-}"; do
  [ -n "${f:-}" ] || continue
  [ -e "$f" ] || continue
  case "$f" in
    *.ts|*.tsx) ;;
    *) continue ;;
  esac
  case "$f" in
    */__tests__/*|*/node_modules/*|*.generated.*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) continue ;;
  esac
  FILES+=("$f")
done

# Nothing to lint — exit clean.
if [ "${#FILES[@]}" -eq 0 ]; then
  exit 0
fi

# --- 3. Run rules ---

lint_rule() {
  local rule="$1"; shift
  local pattern="$1"; shift
  grep -nHE "$pattern" "${FILES[@]}" 2>/dev/null \
    | sed "s|^\([^:]*\):\([0-9]*\):|\1:\2:${rule}:|" \
    || true
}

# Hardcoded status colors (CRITICAL — broken dark mode, wrong contract)
lint_rule "ds-color-hardcoded" \
  'text-(red|green|emerald|amber|blue)-[0-9]|bg-(red|green|emerald|amber|blue)-[0-9]|border-(red|green|emerald|amber|blue)-[0-9]'

# Arbitrary text sizes (WARNING — bypasses typography scale)
lint_rule "ds-text-arbitrary" 'text-\[[0-9]+px\]'

# Deprecated Notice / ErrorNotice imports (WARNING)
lint_rule "ds-deprecated-notice" 'from[[:space:]].*primitives/Notice|ErrorNotice'

# Inline SVG (INFO — prefer lucide-react)
lint_rule "ds-inline-svg" '<svg[[:space:]]'

# Raw form controls (CRITICAL — skip DS focus/disabled/error patterns)
lint_rule "ds-form-input" \
  '<input[^>]*type=["'\''](text|email|password|number|tel|url|search)["'\'']'
lint_rule "ds-form-checkbox" '<input[^>]*type=["'\'']checkbox["'\'']'
lint_rule "ds-form-radio"    '<input[^>]*type=["'\'']radio["'\'']'
lint_rule "ds-form-select"   '<select[[:space:]>]'
lint_rule "ds-form-textarea" '<textarea[[:space:]>]'
lint_rule "ds-custom-switch" 'role=["'\'']switch["'\'']'

# Disabled state via opacity (WARNING — use --bg-disabled / --text-disabled)
lint_rule "ds-disabled-opacity" 'disabled:opacity-50'

# Wrong selection-color contract (CRITICAL)
lint_rule "ds-selection-color" 'data-\[state=checked\]:bg-primary'

# Hardcoded brand hex (WARNING — use --brand-* / SocialButton)
lint_rule "ds-brand-hex" '#1877F2|#0A66C2|#0061FF|#181717|#BC9AFF|#D4F372'

# Old focus rings (WARNING — use --shadow-focus token)
lint_rule "ds-old-focus-ring" 'focus.*ring-2.*ring-offset-2'

exit 0
