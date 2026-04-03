#!/bin/bash
# PreToolUse hook: validate diagrams and CLAUDE.md architecture tree are up-to-date before git commit.
# BLOCKING — if stale, spawns a fixer agent and blocks the commit.

# Read stdin (JSON with tool input)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"command"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# Only act on git commit commands
case "$COMMAND" in
  git\ commit*) ;;
  *) exit 0 ;;
esac

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIAGRAM_DIR="$PROJECT_ROOT/memory/ai/diagrams"

# Skip if diagram directory doesn't exist
[ -d "$DIAGRAM_DIR" ] || exit 0

# Get staged files (these are what's being committed)
STAGED_FILES=$(cd "$PROJECT_ROOT" && git diff --cached --name-only 2>/dev/null)
[ -z "$STAGED_FILES" ] && exit 0

# Pattern map: source file patterns -> diagram files they affect
# Mirrors DIAGRAM_MAPPINGS from stop-hook.ts
check_affected() {
  local file="$1"
  case "$file" in
    convex/schema.ts) echo "schema.md" ;;
    convex/*.ts|convex/*.tsx) echo "functions.md data-flow.md" ;;
    convex/email/*|convex/storage/*|convex/ai/*) echo "functions.md data-flow.md greybox.md" ;;
    convex/auth.ts|convex/auth.config.ts|convex/users.ts) echo "auth-flow.md" ;;
    convex/functions.ts|convex/authHelpers.ts) echo "greybox.md" ;;
    src/lib/auth-server.ts|src/lib/auth-client.ts|src/components/providers.tsx) echo "auth-flow.md" ;;
    src/routes/_app/*.tsx|src/components/*.tsx) echo "data-flow.md" ;;
  esac
}

# Check if staged files affect the CLAUDE.md architecture tree
# Mirrors ARCHITECTURE_TREE_PATTERNS from stop-hook.ts
NEEDS_ARCH_UPDATE=false
check_arch_tree() {
  local file="$1"
  case "$file" in
    convex/[!_]*.ts|convex/[!_]*.tsx) NEEDS_ARCH_UPDATE=true ;;
    convex/*/[!_]*.ts|convex/*/[!_]*.tsx) NEEDS_ARCH_UPDATE=true ;;
    src/routes/_app/*.tsx) NEEDS_ARCH_UPDATE=true ;;
    src/components/*.tsx) NEEDS_ARCH_UPDATE=true ;;
    src/lib/*.ts) NEEDS_ARCH_UPDATE=true ;;
    .claude/hooks/*) NEEDS_ARCH_UPDATE=true ;;
  esac
}

# Collect which diagrams should be affected by this commit
AFFECTED=""
while IFS= read -r file; do
  AFFECTED="$AFFECTED $(check_affected "$file")"
  check_arch_tree "$file"
done <<< "$STAGED_FILES"

# Deduplicate
AFFECTED=$(echo "$AFFECTED" | tr ' ' '\n' | sort -u | grep -v '^$')

# Check if any affected diagrams are NOT staged (i.e. stale or missing from commit)
STALE=""
for diagram in $AFFECTED; do
  DIAGRAM_PATH="memory/ai/diagrams/$diagram"
  if [ ! -f "$PROJECT_ROOT/$DIAGRAM_PATH" ]; then
    STALE="$STALE $diagram(missing)"
  elif cd "$PROJECT_ROOT" && git diff --name-only "$DIAGRAM_PATH" 2>/dev/null | grep -q .; then
    # Diagram has unstaged modifications — the stop hook updated it but it wasn't staged
    STALE="$STALE $diagram(unstaged)"
  elif cd "$PROJECT_ROOT" && ! git diff --cached --name-only "$DIAGRAM_PATH" 2>/dev/null | grep -q .; then
    # Diagram exists and is clean, but source files changed — may be out of date
    # 5-minute window accounts for background processing lag
    DIAGRAM_MTIME=$(stat -f %m "$PROJECT_ROOT/$DIAGRAM_PATH" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE=$(( NOW - DIAGRAM_MTIME ))
    if [ "$AGE" -gt 300 ]; then
      STALE="$STALE $diagram(outdated)"
    fi
  fi
done

# Check if CLAUDE.md architecture tree is stale
ARCH_STALE=false
if [ "$NEEDS_ARCH_UPDATE" = true ]; then
  CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
  if [ -f "$CLAUDE_MD" ]; then
    # If CLAUDE.md has unstaged changes, the stop hook updated it
    if cd "$PROJECT_ROOT" && git diff --name-only "CLAUDE.md" 2>/dev/null | grep -q .; then
      ARCH_STALE=true
      STALE="$STALE CLAUDE.md:architecture(unstaged)"
    elif cd "$PROJECT_ROOT" && ! git diff --cached --name-only "CLAUDE.md" 2>/dev/null | grep -q .; then
      # CLAUDE.md is clean — check if it's outdated
      CLAUDE_MTIME=$(stat -f %m "$CLAUDE_MD" 2>/dev/null || echo 0)
      NOW=$(date +%s)
      AGE=$(( NOW - CLAUDE_MTIME ))
      if [ "$AGE" -gt 300 ]; then
        ARCH_STALE=true
        STALE="$STALE CLAUDE.md:architecture(outdated)"
      fi
    fi
  fi
fi

STALE=$(echo "$STALE" | xargs)
[ -z "$STALE" ] && exit 0

# Stale items detected — spawn fixer agent
echo "" >&2
echo "⚠ Stale documentation detected: $STALE" >&2
echo "  Spawning updater to fix before commit..." >&2
echo "" >&2

# Build the list of changed source files for the prompt
CHANGED_SRC=$(echo "$STAGED_FILES" | grep -v '^memory/ai/diagrams/' | grep -v '^CLAUDE.md$' | tr '\n' ', ' | sed 's/,$//')
STALE_LIST=$(echo "$STALE" | tr ' ' ', ')

# Build the prompt
PROMPT="The following source files are being committed: $CHANGED_SRC. These items need updating: $STALE_LIST."

# Add diagram instructions if needed
DIAGRAM_STALE=$(echo "$STALE" | tr ' ' '\n' | grep -v 'CLAUDE.md' | tr '\n' ' ' | xargs)
if [ -n "$DIAGRAM_STALE" ]; then
  PROMPT="$PROMPT Read each affected diagram in memory/ai/diagrams/ and the relevant source files, then update the diagrams to reflect the current code."
fi

# Add CLAUDE.md architecture tree instructions if needed
if [ "$ARCH_STALE" = true ]; then
  PROMPT="$PROMPT ALSO update the ## Architecture file tree section in CLAUDE.md. Read the current CLAUDE.md, then scan the actual file structure (convex/, src/routes/, src/components/, src/lib/, .claude/hooks/) and update the tree to match reality. Keep the same format — indented file tree with inline comments. Only update the tree block, do not change any other section."
fi

PROMPT="$PROMPT Do NOT commit. Leave changes as unstaged files."

claude -p --model sonnet "$PROMPT" >&2

# After the fixer runs, stage the updated files
for diagram in $AFFECTED; do
  DIAGRAM_PATH="memory/ai/diagrams/$diagram"
  if [ -f "$PROJECT_ROOT/$DIAGRAM_PATH" ]; then
    cd "$PROJECT_ROOT" && git add "$DIAGRAM_PATH" 2>/dev/null
  fi
done

if [ "$ARCH_STALE" = true ] && [ -f "$PROJECT_ROOT/CLAUDE.md" ]; then
  cd "$PROJECT_ROOT" && git add "CLAUDE.md" 2>/dev/null
fi

echo "" >&2
echo "✓ Documentation updated and staged. Proceeding with commit." >&2
echo "" >&2

exit 0
