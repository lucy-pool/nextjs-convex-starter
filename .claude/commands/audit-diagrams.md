---
description: Full audit of memory/ai/diagrams and CLAUDE.md — broken refs, coverage gaps, and tree sync
---

Perform a complete sync audit of this project's architecture documentation. Do NOT commit — leave all changes unstaged for the user to review.

Work through the four steps below in order. Use Read / Grep / Glob to inspect files, and Edit / Write to fix issues. Track progress with TaskCreate if the scope is large.

## 1. Broken reference scan

Read every `*.md` in `memory/ai/diagrams/`. For each file path or bare filename it mentions (look for `convex/...`, `src/...`, `tests/...`, `.claude/hooks/...`, and bare `*.ts` / `*.tsx` references):

- If the referenced file no longer exists on disk, either (a) update the reference to the file's new location if you can determine it from the surrounding context, or (b) remove the stale reference and reconcile the surrounding text so the diagram stays coherent.
- If the referenced file was renamed or moved into a subfolder, update the mention everywhere it appears.
- Bare filenames (e.g. `r2.ts`, `files.ts`, `sidebar.tsx`) that only exist at a different path now should be updated to use the full relative path (`convex/storage/r2.ts`, `convex/storage/files.ts`, `src/components/layout/sidebar.tsx`) — this makes the Stop-hook watch system more reliable.

## 2. Coverage gap scan

Walk the current file tree under:
- `convex/` (and each subfolder — deep modules)
- `src/routes/_app/`
- `src/components/`
- `src/lib/`
- `.claude/hooks/`

For each top-level module (folder or standalone file), confirm it is mentioned in at least one diagram in `memory/ai/diagrams/`.

If an uncovered module exists:

1. Pick the most appropriate existing diagram to update:
   - `greybox.md` for module boundaries (deep modules in `convex/`)
   - `functions.md` for Convex query/mutation/action tables
   - `data-flow.md` for client↔server flows and sequence diagrams
   - `auth-flow.md` for auth touchpoints
   - `schema.md` for database tables
2. Embed the new file paths directly into the diagram (inside tables, mermaid node labels, or prose) so the Stop hook's content-derived watch system picks them up next time.
3. If no existing diagram fits, create a new one in `memory/ai/diagrams/` with a descriptive filename and include the file paths inside it.

## 3. Greybox consistency

Open `memory/ai/diagrams/greybox.md`. Compare its subgraphs against the current `convex/` subfolder structure. Every deep module (subfolder under `convex/` with multiple files) should have a `subgraph "Deep Module: <Name>"` block with `PUBLIC API` and `INTERNALS` sections. Each block should list the current file names.

- If a subfolder exists in `convex/` but has no subgraph in `greybox.md`, add one.
- If `greybox.md` has a subgraph for a module that no longer exists, remove it.
- If the `PUBLIC API` or `INTERNALS` lists inside a subgraph are stale, update them to match the current files in that subfolder.

## 4. CLAUDE.md architecture tree

Read the `## Architecture` section in `CLAUDE.md`. The code-block immediately under that header contains an indented file tree with inline comments.

- Walk the actual file tree under `convex/`, `src/`, and `.claude/hooks/`.
- Add lines for any files that exist on disk but are missing from the tree.
- Remove lines for files that appear in the tree but no longer exist on disk.
- Keep the existing indentation style and inline comment format. Do NOT reformat untouched lines.
- Do NOT touch any other section of CLAUDE.md — only the fenced code block under `## Architecture`.

## Output

At the end, print a short report to the user:

- **Broken references fixed:** N (with a list of which diagrams and what was changed)
- **Coverage gaps closed:** N (which diagrams were updated, which new diagrams were created)
- **Greybox drift fixed:** yes / no (which subgraphs changed)
- **CLAUDE.md tree updated:** yes / no (how many lines added / removed)
- **Unresolved issues:** anything you flagged but chose not to fix, with reasoning

Remind the user that all changes are unstaged and they should review with `git diff` before committing.
