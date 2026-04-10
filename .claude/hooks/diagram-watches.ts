import { readFileSync, readdirSync } from "fs";
import { basename, dirname, join } from "path";

// ── Watched tree roots ──────────────────────────────────────────────
// A file is considered "in a source tree" (and therefore eligible for
// basename matching + Layer-2 gap-fill detection) only if its relative
// path starts with one of these prefixes.
export const WATCHED_TREE_ROOTS: readonly string[] = [
  "convex/",
  "src/routes/",
  "src/components/",
  "src/lib/",
  "src/hooks/",
  "tests/",
  ".claude/hooks/",
];

// Overly generic basenames — matching these would cause false positives
// across unrelated diagrams. Safer to require a full path or directory
// reference for files with these names.
export const BASENAME_DENYLIST: ReadonlySet<string> = new Set([
  "index.ts",
  "index.tsx",
  "utils.ts",
  "utils.tsx",
  "config.ts",
  "types.ts",
  "helpers.ts",
  "constants.ts",
  "route.ts",
  "layout.tsx",
  "page.tsx",
]);

// Paths that should never be tracked (auto-generated, noise).
const IGNORED_PATH_FRAGMENTS = ["_generated/", "routeTree.gen"];

// ── Reference extraction ────────────────────────────────────────────

export interface ExtractedReferences {
  fullPaths: Set<string>;
  basenames: Set<string>;
  directories: Set<string>;
}

/**
 * Extract file references from one diagram's markdown body.
 *
 * Three styles are recognized:
 *   1. Full relative paths: `convex/auth.ts`, `src/routes/_app.tsx`
 *   2. Bare filenames with extensions: `r2.ts`, `sidebar.tsx`
 *   3. Directory prefixes: `convex/email/`, `src/routes/_app/`
 *
 * Matches are normalized: backticks stripped, trailing punctuation removed,
 * ignored fragments (`_generated/`, `routeTree.gen`) dropped.
 */
export function extractReferences(text: string): ExtractedReferences {
  const fullPaths = new Set<string>();
  const basenames = new Set<string>();
  const directories = new Set<string>();

  // 1. Full-path regex. Roots come from WATCHED_TREE_ROOTS without trailing slash.
  //    Allow any non-whitespace path segment characters, anchored on a real extension.
  //    NOTE: we deliberately do NOT add dirname(match) to `directories`. If we did,
  //    any file referenced at the convex root (e.g. `convex/auth.ts`) would register
  //    `convex` as a watched directory, making every file under convex/ auto-match
  //    that diagram via the ancestor walk. That would defeat Layer 2 (gap-fill).
  //    Only explicit directory references (regex #3) contribute to byDirectory.
  const fullPathRegex =
    /\b(?:convex|src|tests|\.claude\/hooks)(?:\/[A-Za-z0-9_.\-]+)+\.(?:ts|tsx|js|jsx|md|sh)\b/g;
  for (const match of text.matchAll(fullPathRegex)) {
    const raw = match[0];
    if (IGNORED_PATH_FRAGMENTS.some((frag) => raw.includes(frag))) continue;
    fullPaths.add(raw);
  }

  // 2. Bare filename regex. Must NOT be preceded by `/` or a word character
  //    (so "convex/auth.ts" does not double-count as the bare name "auth.ts").
  const bareFilenameRegex =
    /(?<![\/\w])([A-Za-z0-9_][A-Za-z0-9_\-]*\.(?:ts|tsx))\b/g;
  for (const match of text.matchAll(bareFilenameRegex)) {
    const name = match[1];
    if (BASENAME_DENYLIST.has(name)) continue;
    if (IGNORED_PATH_FRAGMENTS.some((frag) => name.includes(frag))) continue;
    basenames.add(name);
  }

  // 3. Directory regex. Matches `convex/email/`, `src/routes/_app/` etc.
  //    A trailing `/` or `*` or `)` signals the end of a directory reference.
  const directoryRegex =
    /\b(?:convex|src|tests|\.claude\/hooks)(?:\/[A-Za-z0-9_\-]+)+\/(?=[*\s)"`'\]])/g;
  for (const match of text.matchAll(directoryRegex)) {
    const raw = match[0].replace(/\/$/, "");
    if (IGNORED_PATH_FRAGMENTS.some((frag) => raw.includes(frag))) continue;
    directories.add(raw);
  }

  return { fullPaths, basenames, directories };
}

// ── Diagram scanning ────────────────────────────────────────────────

export interface DiagramWatchMap {
  byFullPath: Map<string, Set<string>>;
  byBasename: Map<string, Set<string>>;
  byDirectory: Map<string, Set<string>>;
  diagramFiles: string[];
}

/**
 * Scan every `*.md` file in the diagram directory and build a reverse
 * index from referenced path → set of diagrams that mention it.
 */
export function scanDiagrams(diagramDir: string): DiagramWatchMap {
  const map: DiagramWatchMap = {
    byFullPath: new Map(),
    byBasename: new Map(),
    byDirectory: new Map(),
    diagramFiles: [],
  };

  let entries;
  try {
    entries = readdirSync(diagramDir, { withFileTypes: true });
  } catch {
    return map;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const diagramName = entry.name;
    map.diagramFiles.push(diagramName);

    let text: string;
    try {
      text = readFileSync(join(diagramDir, diagramName), "utf-8");
    } catch {
      continue;
    }

    const refs = extractReferences(text);

    for (const p of refs.fullPaths) {
      addToMap(map.byFullPath, p, diagramName);
    }
    for (const b of refs.basenames) {
      addToMap(map.byBasename, b, diagramName);
    }
    for (const d of refs.directories) {
      addToMap(map.byDirectory, d, diagramName);
    }
  }

  return map;
}

function addToMap(
  m: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  const existing = m.get(key);
  if (existing) {
    existing.add(value);
  } else {
    m.set(key, new Set([value]));
  }
}

// ── Matching changed files → affected diagrams ──────────────────────

export interface MatchResult {
  /** Diagram basenames (`auth-flow.md`, …) that need updating. */
  affected: Set<string>;
  /** Changed files inside a watched tree that matched no diagram at all. */
  unmatched: string[];
}

export function isSourceTreeFile(relPath: string): boolean {
  return WATCHED_TREE_ROOTS.some((root) => relPath.startsWith(root));
}

/**
 * For each changed file, determine which diagrams reference it via:
 *   1. Exact full-path match
 *   2. Basename match (only for files inside a watched tree root)
 *   3. Ancestor-directory match
 *
 * Returns both the set of affected diagrams and the list of "in-tree but
 * unmatched" files that Layer 2 should use to spawn a gap-fill sub-Claude.
 */
export function matchChangedFiles(
  changedRelPaths: string[],
  map: DiagramWatchMap
): MatchResult {
  const affected = new Set<string>();
  const unmatched: string[] = [];

  for (const rel of changedRelPaths) {
    if (IGNORED_PATH_FRAGMENTS.some((frag) => rel.includes(frag))) continue;

    const hits = new Set<string>();

    // 1. Exact full-path match.
    const exact = map.byFullPath.get(rel);
    if (exact) for (const d of exact) hits.add(d);

    // 2. Basename match (only inside watched trees).
    const inTree = isSourceTreeFile(rel);
    if (inTree) {
      const base = basename(rel);
      if (!BASENAME_DENYLIST.has(base)) {
        const byBase = map.byBasename.get(base);
        if (byBase) for (const d of byBase) hits.add(d);
      }
    }

    // 3. Ancestor-directory match — walk up from the file's dirname.
    let cursor = dirname(rel);
    const seen = new Set<string>();
    while (cursor && cursor !== "." && cursor !== "/" && !seen.has(cursor)) {
      seen.add(cursor);
      const byDir = map.byDirectory.get(cursor);
      if (byDir) for (const d of byDir) hits.add(d);
      const next = dirname(cursor);
      if (next === cursor) break;
      cursor = next;
    }

    if (hits.size === 0) {
      if (inTree) unmatched.push(rel);
    } else {
      for (const d of hits) affected.add(d);
    }
  }

  return { affected, unmatched };
}
